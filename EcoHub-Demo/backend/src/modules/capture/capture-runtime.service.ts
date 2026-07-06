import fs from 'fs/promises';
import path from 'path';
import prisma from '../../config/database';
import * as uploadQueueService from './upload-queue.service';
import { lookupAndPersistOrder } from '../channels/tiktok-sync.service';
import { lookupAndPersistShopeeOrder } from '../channels/shopee-sync.service';
import { getBarcodeMapCache } from './barcode-mapping.service';
import { RoleName } from '@prisma/client';

const getBarcodeSkuMap = (): Record<string, string> => getBarcodeMapCache();

type RecordingFlow = 'outbound' | 'return';
type RuntimeUserScope = { userId: string; roles?: RoleName[] };

type RuntimeOrderInfo = {
  order_id: string;
  order_code: string;
  channel_order_id?: string | null;
  tracking_code?: string | null;
  platform?: string;
  shipping_status?: string;
  shop_id?: string;
  product_id?: string;
  sku_id?: string;
  items?: Array<{ qty?: number; name?: string; product_id?: string; sku_id?: string }>;
};

type RuntimeState = {
  recordingFlow: RecordingFlow;
  currentOrderCode: string | null;
  orderInfo: RuntimeOrderInfo | null;
  isRecording: boolean;
  isPaused: boolean;
  recordingStartMs: number | null;
  cameraRunning: boolean;
  initialized: boolean;
  cameraError: string | null;
  lastTest: string | null;
  notifications: Array<{ level: 'info' | 'warning' | 'error'; message: string }>;
  scannedCodes: string[];
  scannedCodeSet: Set<string>;
  totalScannedCount: number;
};

const DEFAULT_STORAGE_LIMIT_GB = Number.parseFloat(process.env.VIDEO_STORAGE_LIMIT_GB || '') || 100;
const runtimeStates = new Map<string, RuntimeState>();

const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const getState = (userId: string): RuntimeState => {
  const existing = runtimeStates.get(userId);
  if (existing) return existing;

  const created: RuntimeState = {
    recordingFlow: 'outbound',
    currentOrderCode: null,
    orderInfo: null,
    isRecording: false,
    isPaused: false,
    recordingStartMs: null,
    cameraRunning: false,
    initialized: false,
    cameraError: null,
    lastTest: null,
    notifications: [],
    scannedCodes: [],
    scannedCodeSet: new Set<string>(),
    totalScannedCount: 0,
  };
  runtimeStates.set(userId, created);
  return created;
};

const getDirectorySizeBytes = async (dirPath: string): Promise<bigint> => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let total = 0n;

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySizeBytes(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        total += BigInt(stat.size);
      }
    }

    return total;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return 0n;
    throw error;
  }
};

const clampPercent = (usedBytes: bigint, limitBytes: bigint) => {
  if (limitBytes <= 0n) return 0;
  return Number(((usedBytes * 10000n) / limitBytes).toString()) / 100;
};

const resolveUserShopIds = async (userId: string) => {
  const roles = await prisma.userRole.findMany({
    where: { userId, shopId: { not: null } },
    select: { shopId: true },
    orderBy: { assignedAt: 'desc' },
  });
  return Array.from(new Set(roles.map((role) => role.shopId).filter(Boolean))) as string[];
};

const canSearchAllShops = (roles?: RoleName[]) =>
  Boolean(
    roles?.some((role) =>
      ([RoleName.super_admin, RoleName.admin, RoleName.customer_service] as RoleName[]).includes(role)
    )
  );

const normalizeScannedCode = (rawCode: string) => {
  const trimmed = String(rawCode || '').trim();
  if (!trimmed) return '';

  // Carrier QR codes often contain "TRACKING|HUB|..." data. The Flask app
  // used the first segment as the operational code.
  const firstSegment = trimmed.includes('|')
    ? trimmed
        .split('|')
        .map((part) => part.trim())
        .find(Boolean) || trimmed
    : trimmed;

  return firstSegment.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').trim() || firstSegment;
};

const buildOrderInfoFromDb = async (orderCode: string, shopIds?: string[]) => {
  const normalized = normalizeScannedCode(orderCode);
  if (!normalized) return null;

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ orderCode: normalized }, { channelOrderId: normalized }, { trackingCode: normalized }],
      ...(shopIds?.length ? { shopId: { in: shopIds } } : {}),
    },
    include: {
      items: {
        select: {
          quantity: true,
          productName: true,
          productId: true,
          productSku: true,
        },
      },
    },
  });

  if (!order) return null;

  return {
    order_id: order.id,
    order_code: order.orderCode,
    channel_order_id: order.channelOrderId,
    tracking_code: order.trackingCode,
    platform: order.channelId || undefined,
    shipping_status: order.status,
    shop_id: order.shopId,
    items: order.items.map((item) => ({
      qty: item.quantity,
      name: item.productName,
      product_id: item.productId || undefined,
      sku_id: item.productSku || undefined,
    })),
  } satisfies RuntimeOrderInfo;
};

const buildOrderInfo = async (orderCode: string, currentUser: RuntimeUserScope) => {
  const normalized = normalizeScannedCode(orderCode);
  const searchAllShops = canSearchAllShops(currentUser.roles);
  const shopIds = searchAllShops ? [] : await resolveUserShopIds(currentUser.userId);
  const local = await buildOrderInfoFromDb(
    normalized,
    !searchAllShops && shopIds.length ? shopIds : undefined
  );
  if (local) return local;

  let remote = null;
  for (const shopId of shopIds) {
    remote = await lookupAndPersistOrder({ code: normalized, shopId, userId: currentUser.userId });
    if (!remote) {
      remote = await lookupAndPersistShopeeOrder({
        code: normalized,
        shopId,
        userId: currentUser.userId,
      });
    }
    if (remote) break;
  }

  if (!remote && searchAllShops) {
    // Accounts without a shop-scoped role (for example super admin) can still
    // search all connected shops.
    remote = await lookupAndPersistOrder({ code: normalized, userId: currentUser.userId });
    if (!remote) {
      remote = await lookupAndPersistShopeeOrder({
        code: normalized,
        userId: currentUser.userId,
      });
    }
  }
  if (!remote) return null;

  return buildOrderInfoFromDb(
    remote.orderCode,
    !searchAllShops && shopIds.length ? shopIds : undefined
  );
};

const computePackingItems = (state: RuntimeState) => {
  const items = state.orderInfo?.items || [];
  if (!items.length) return [];

  const barcodeMap = getBarcodeSkuMap();
  const matchedIndexes = new Set<number>();

  const resolvedScans = state.scannedCodes.map((code) => {
    const normCode = normalizeScannedCode(code);
    return barcodeMap[normCode] || normCode;
  });

  const rows = items.map((item, index) => {
    const required = Math.max(0, Number(item.qty || 0));
    const normSku = normalizeScannedCode(item.sku_id || '');
    const normProd = normalizeScannedCode(item.product_id || '');

    let scanned = 0;
    resolvedScans.forEach((resolvedScan, scanIdx) => {
      if (
        (normSku && resolvedScan === normSku) ||
        (normProd && resolvedScan === normProd)
      ) {
        scanned++;
        matchedIndexes.add(scanIdx);
      }
    });

    const status = scanned === required ? 'ok' : scanned > required ? 'excess' : 'missing';

    return {
      key: `${item.product_id || item.sku_id || 'item'}-${index}`,
      name: item.name || 'Sản phẩm',
      sku: item.sku_id || '',
      required_qty: required,
      scanned_count: scanned,
      status: status as 'ok' | 'missing' | 'excess',
    };
  });

  const unmatchedScans = new Map<string, number>();
  state.scannedCodes.forEach((code, idx) => {
    if (!matchedIndexes.has(idx)) {
      const normCode = normalizeScannedCode(code);
      const count = unmatchedScans.get(normCode) || 0;
      unmatchedScans.set(normCode, count + 1);
    }
  });

  unmatchedScans.forEach((count, code) => {
    const mappedSku = barcodeMap[code];
    const displayName = mappedSku
      ? `Sản phẩm ngoài đơn: ${mappedSku}`
      : `Mã không khớp đơn: ${code}`;

    rows.push({
      key: `excess-${code}`,
      name: displayName,
      sku: mappedSku || code,
      required_qty: 0,
      scanned_count: count,
      status: 'excess' as const,
    });
  });

  return rows;
};

export const syncPreparedOrder = async (
  userId: string,
  payload: {
    orderId: string;
    orderCode: string;
    trackingCode?: string;
    shopId: string | null;
    recordingFlow: RecordingFlow;
    items?: Array<{ qty?: number; name?: string; product_id?: string; sku_id?: string }>;
  }
) => {
  const state = getState(userId);
  state.recordingFlow = payload.recordingFlow;
  state.currentOrderCode = payload.trackingCode || payload.orderCode;
  state.orderInfo = {
    order_id: payload.orderId,
    order_code: payload.orderCode,
    channel_order_id: payload.orderCode,
    tracking_code: payload.trackingCode || null,
    shipping_status: 'prepared',
    shop_id: payload.shopId || undefined,
    items: payload.items || [],
  };
  state.scannedCodes = [];
  state.scannedCodeSet = new Set<string>();
  state.totalScannedCount = 0;
  state.notifications = [];
};

export const setRecordingFlow = (userId: string, flow: RecordingFlow) => {
  const state = getState(userId);
  state.recordingFlow = flow;
  return state.recordingFlow;
};

export const setCurrentOrderFromCode = async (
  userOrId: string | RuntimeUserScope,
  orderCode: string
) => {
  const currentUser = typeof userOrId === 'string' ? { userId: userOrId } : userOrId;
  const userId = currentUser.userId;
  const state = getState(userId);
  const normalized = normalizeScannedCode(orderCode);
  const orderInfo = await buildOrderInfo(normalized, currentUser);
  if (orderInfo) {
    state.currentOrderCode = orderInfo.tracking_code || normalized || orderInfo.order_code || null;
    state.orderInfo = orderInfo;
    state.scannedCodes = [];
    state.scannedCodeSet = new Set<string>();
    state.totalScannedCount = 0;
    state.notifications = [];
  } else if (!state.orderInfo) {
    state.currentOrderCode = null;
  }
  return {
    ok: Boolean(state.orderInfo),
    action: orderInfo ? 'order-selected' : 'order-missing',
    message: orderInfo ? 'Da tim thay don hang' : `Khong tim thay don hang cho ma: ${normalized}`,
    current_order_code: state.currentOrderCode,
    order_info: orderInfo,
  };
};

export const clearCurrentOrder = (userId: string) => {
  const state = getState(userId);
  state.currentOrderCode = null;
  state.orderInfo = null;
  state.notifications = [];
  state.isRecording = false;
  state.isPaused = false;
  state.recordingStartMs = null;
  state.scannedCodes = [];
  state.scannedCodeSet = new Set<string>();
  state.totalScannedCount = 0;
};

export const markCameraTest = (userId: string, success: boolean, error?: string | null) => {
  const state = getState(userId);
  state.lastTest = nowStamp();
  state.cameraError = success ? null : error || 'Capture agent khong kha dung';
  if (success) {
    state.initialized = true;
  }
};

export const markCameraRunning = (userId: string, running: boolean, error?: string | null) => {
  const state = getState(userId);
  state.cameraRunning = running;
  state.initialized = running || state.initialized;
  state.cameraError = error || null;
};

export const markRecordingStarted = (userId: string) => {
  const state = getState(userId);
  state.isRecording = true;
  state.isPaused = false;
  state.recordingStartMs = Date.now();
};

export const markRecordingStopped = (userId: string) => {
  const state = getState(userId);
  state.isRecording = false;
  state.isPaused = false;
  state.recordingStartMs = null;
};

export const markRecordingPaused = (userId: string) => {
  const state = getState(userId);
  state.isPaused = true;
};

export const markRecordingResumed = (userId: string) => {
  const state = getState(userId);
  state.isPaused = false;
};

const getOrderIdentityCodes = (state: RuntimeState) => {
  const codes = [
    state.currentOrderCode,
    state.orderInfo?.order_id,
    state.orderInfo?.order_code,
    state.orderInfo?.channel_order_id,
    state.orderInfo?.tracking_code,
  ]
    .map((value) => normalizeScannedCode(String(value || '')))
    .filter(Boolean);

  return new Set(codes);
};

export const processManualScan = async (userOrId: string | RuntimeUserScope, code: string) => {
  const currentUser = typeof userOrId === 'string' ? { userId: userOrId } : userOrId;
  const userId = currentUser.userId;
  const state = getState(userId);
  const normalized = normalizeScannedCode(code);
  if (!normalized) {
    return { ok: false, message: 'Ma quet dang trong' };
  }

  if (!state.currentOrderCode || !state.orderInfo) {
    return setCurrentOrderFromCode(currentUser, normalized);
  }

  if (getOrderIdentityCodes(state).has(normalized)) {
    return {
      ok: true,
      action: 'order-confirmed',
      current_order_code: state.currentOrderCode,
      order_info: state.orderInfo,
    };
  }

  const barcodeMap = getBarcodeSkuMap();
  const mappedSku = barcodeMap[normalized] || normalized;

  const isSkuInOrder = state.orderInfo?.items?.some(
    (item) =>
      normalizeScannedCode(item.sku_id || '') === normalizeScannedCode(mappedSku) ||
      normalizeScannedCode(item.product_id || '') === normalizeScannedCode(mappedSku)
  );

  if (state.scannedCodeSet.has(normalized) && !isSkuInOrder) {
    state.notifications = [
      {
        level: 'warning',
        message: `Ma ${normalized} da duoc quet trong don nay.`,
      },
    ];
    return {
      ok: false,
      action: 'duplicate-serial',
      scanned_code: normalized,
      total_scanned_count: state.totalScannedCount,
      packing_state: {
        items: computePackingItems(state),
        has_missing: computePackingItems(state).some((item) => item.status === 'missing'),
        has_excess: computePackingItems(state).some((item) => item.status === 'excess'),
      },
      message: 'Ma nay da duoc quet trong don hien tai',
    };
  }

  state.scannedCodeSet.add(normalized);
  state.scannedCodes.push(normalized);
  state.totalScannedCount += 1;
  const packingItems = computePackingItems(state);
  const hasMissing = packingItems.some((item) => item.status === 'missing');
  const hasExcess = packingItems.some((item) => item.status === 'excess');

  state.notifications = [
    {
      level: hasExcess ? 'warning' : 'info',
      message: hasExcess
        ? `Da quet ${state.totalScannedCount} ma, vuot so luong yeu cau.`
        : `Da quet ${state.totalScannedCount} ma cho don ${state.currentOrderCode}.`,
    },
  ];

  return {
    ok: true,
    action: 'serial-scanned',
    scanned_code: normalized,
    total_scanned_count: state.totalScannedCount,
    packing_state: {
      items: packingItems,
      has_missing: hasMissing,
      has_excess: hasExcess,
    },
  };
};

export const getRuntimeStatus = (userId: string) => {
  const state = getState(userId);
  const packingItems = computePackingItems(state);
  return {
    is_recording: state.isRecording,
    recording_seconds: state.recordingStartMs ? Math.max(0, Math.floor((Date.now() - state.recordingStartMs) / 1000)) : 0,
    current_order_code: state.currentOrderCode,
    order_info: state.orderInfo,
    is_paused: state.isPaused,
    total_items: state.orderInfo?.items?.length || 0,
    num_cameras: state.cameraRunning ? 1 : 0,
    packing_state: {
      items: packingItems,
      has_missing: packingItems.some((item) => item.status === 'missing'),
      has_excess: packingItems.some((item) => item.status === 'excess'),
    },
    notifications: state.notifications,
    recording_flow: state.recordingFlow,
    recording_flow_label: state.recordingFlow === 'return' ? 'Hang hoan' : 'Hang gui',
    scanned_codes: state.scannedCodes,
    total_scanned_count: state.totalScannedCount,
  };
};

export const getCameraStatus = (userId: string) => {
  const state = getState(userId);
  return {
    initialized: state.initialized,
    running: state.cameraRunning,
    error: state.cameraError,
    last_test: state.lastTest,
  };
};

export const peekCameraStatus = (userId: string) => {
  return getCameraStatus(userId);
};

export const getUploadStatus = () => {
  return uploadQueueService.getQueueStatus();
};

export const getVideoStorageUsage = async (shopId?: string | null) => {
  const limitBytes = BigInt(Math.round(DEFAULT_STORAGE_LIMIT_GB * 1024 * 1024 * 1024));

  let usedBytes = 0n;
  let videoCount = 0;
  let totalDurationMin = 0;

  if (shopId) {
    const [packageAgg, receivingAgg, packageCount, receivingCount] = await Promise.all([
      prisma.packageVideo.aggregate({
        where: { order: { shopId }, deletedAt: null },
        _sum: { originalVideoSize: true, processedVideoSize: true, originalDuration: true },
      }),
      prisma.receivingVideo.aggregate({
        where: { order: { shopId }, deletedAt: null },
        _sum: { videoSize: true, duration: true },
      }),
      prisma.packageVideo.count({ where: { order: { shopId }, deletedAt: null } }),
      prisma.receivingVideo.count({ where: { order: { shopId }, deletedAt: null } }),
    ]);

    usedBytes =
      BigInt(packageAgg._sum.originalVideoSize || 0) +
      BigInt(packageAgg._sum.processedVideoSize || 0) +
      BigInt(receivingAgg._sum.videoSize || 0);
    videoCount = packageCount + receivingCount;
    totalDurationMin =
      (Number(packageAgg._sum.originalDuration || 0) + Number(receivingAgg._sum.duration || 0)) / 60;
  } else {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    usedBytes = await getDirectorySizeBytes(uploadsDir);

    const [packageCount, receivingCount, packageDurationAgg, receivingDurationAgg] = await Promise.all([
      prisma.packageVideo.count({ where: { deletedAt: null } }),
      prisma.receivingVideo.count({ where: { deletedAt: null } }),
      prisma.packageVideo.aggregate({ where: { deletedAt: null }, _sum: { originalDuration: true } }),
      prisma.receivingVideo.aggregate({ where: { deletedAt: null }, _sum: { duration: true } }),
    ]);

    videoCount = packageCount + receivingCount;
    totalDurationMin =
      (Number(packageDurationAgg._sum.originalDuration || 0) + Number(receivingDurationAgg._sum.duration || 0)) / 60;
  }

  return {
    usage: {
      used_bytes: Number(usedBytes),
      storage_limit_gb: DEFAULT_STORAGE_LIMIT_GB,
      percent_used: clampPercent(usedBytes, limitBytes),
      video_count: videoCount,
      total_duration_min: totalDurationMin,
    },
  };
};

export const getServiceInfo = () => {
  return {
    mode: 'server-local',
    capabilities: {
      nativeApiManagement: true,
      nativeStorageUsage: true,
      nativeCaptureRuntimeState: true,
      requiresCaptureAgentForCamera: false,
      requiresCaptureAgentForRecording: false,
    },
  };
};
