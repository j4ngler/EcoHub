import fs from 'fs/promises';
import path from 'path';
import prisma from '../../config/database';
import * as uploadQueueService from './upload-queue.service';

type RecordingFlow = 'outbound' | 'return';

type RuntimeOrderInfo = {
  order_id: string;
  order_code: string;
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
  totalScannedCount: number;
};

const DEFAULT_STORAGE_LIMIT_GB = Number.parseFloat(process.env.VIDEO_STORAGE_LIMIT_GB || '') || 90;
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

const buildOrderInfo = async (orderCode: string) => {
  const normalized = orderCode.trim();
  if (!normalized) return null;

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ orderCode: normalized }, { trackingCode: normalized }],
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

const computePackingItems = (state: RuntimeState) => {
  const items = state.orderInfo?.items || [];
  if (!items.length) return [];

  let remainingScanned = state.totalScannedCount;
  const rows = items.map((item, index) => {
    const required = Math.max(0, Number(item.qty || 0));
    const scanned = Math.min(required, remainingScanned);
    remainingScanned = Math.max(0, remainingScanned - required);
    const status = scanned === required ? 'ok' : 'missing';

    return {
      key: `${item.product_id || item.sku_id || 'item'}-${index}`,
      required_qty: required,
      scanned_count: scanned,
      status: status as 'ok' | 'missing' | 'excess',
    };
  });

  if (remainingScanned > 0) {
    rows.push({
      key: 'excess',
      required_qty: 0,
      scanned_count: remainingScanned,
      status: 'excess' as const,
    });
  }

  return rows;
};

export const syncPreparedOrder = async (
  userId: string,
  payload: {
    orderId: string;
    orderCode: string;
    shopId: string | null;
    recordingFlow: RecordingFlow;
    items?: Array<{ qty?: number; name?: string; product_id?: string; sku_id?: string }>;
  }
) => {
  const state = getState(userId);
  state.recordingFlow = payload.recordingFlow;
  state.currentOrderCode = payload.orderCode;
  state.orderInfo = {
    order_id: payload.orderId,
    order_code: payload.orderCode,
    shipping_status: 'prepared',
    shop_id: payload.shopId || undefined,
    items: payload.items || [],
  };
};

export const setRecordingFlow = (userId: string, flow: RecordingFlow) => {
  const state = getState(userId);
  state.recordingFlow = flow;
  return state.recordingFlow;
};

export const setCurrentOrderFromCode = async (userId: string, orderCode: string) => {
  const state = getState(userId);
  const orderInfo = await buildOrderInfo(orderCode);
  state.currentOrderCode = orderCode.trim() || null;
  state.orderInfo = orderInfo;
  state.scannedCodes = [];
  state.totalScannedCount = 0;
  state.notifications = [];
  return {
    current_order_code: state.currentOrderCode,
    order_info: state.orderInfo,
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

export const processManualScan = async (userId: string, code: string) => {
  const state = getState(userId);
  const normalized = code.trim();
  if (!normalized) {
    return { ok: false, message: 'Ma quet dang trong' };
  }

  if (!state.currentOrderCode || !state.orderInfo) {
    const local = await setCurrentOrderFromCode(userId, normalized);
    return {
      ok: true,
      action: local.order_info ? 'order-selected' : 'order-missing',
      ...local,
    };
  }

  if (normalized === state.currentOrderCode || normalized === state.orderInfo.order_code) {
    return {
      ok: true,
      action: 'order-confirmed',
      current_order_code: state.currentOrderCode,
      order_info: state.orderInfo,
    };
  }

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
