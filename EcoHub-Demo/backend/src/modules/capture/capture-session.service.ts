import crypto from 'crypto';
import prisma from '../../config/database';
import { badRequest, forbidden, notFound } from '../../middlewares/error.middleware';
import { RoleName } from '@prisma/client';
import { getCaptureSettings } from '../settings/settings.service';
import * as captureRuntimeService from './capture-runtime.service';

type CurrentUser = {
  userId: string;
  roles: RoleName[];
  shopId?: string | null;
};

type CaptureModule = 'packaging' | 'receiving';
type RecordingFlow = 'outbound' | 'return';

export type CaptureUploadSession = {
  sessionId: string;
  userId: string;
  shopId: string | null;
  orderId: string;
  orderCode: string;
  trackingCode: string;
  customerName: string;
  module: CaptureModule;
  recordingFlow: RecordingFlow;
  uploadEndpoint: string;
  createdAt: string;
  expiresAt: string;
};

const SESSION_TTL_MS = 30 * 60 * 1000;
const activeSessions = new Map<string, CaptureUploadSession>();

const pruneExpiredSession = (userId: string) => {
  const session = activeSessions.get(userId);
  if (session && new Date(session.expiresAt).getTime() <= Date.now()) {
    activeSessions.delete(userId);
    return null;
  }
  return session || null;
};

const canManageAllOrders = (roles: RoleName[]) =>
  roles.includes(RoleName.super_admin) ||
  roles.includes(RoleName.admin) ||
  roles.includes(RoleName.customer_service);

export const prepareUploadSession = async (
  payload: {
    orderId: string;
    trackingCode?: string;
    module?: CaptureModule;
    recordingFlow?: RecordingFlow;
  },
  currentUser: CurrentUser
) => {
  const order = await prisma.order.findUnique({
    where: { id: payload.orderId },
    include: {
      shop: { select: { id: true, name: true, code: true } },
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

  if (!order) {
    throw notFound('Không tìm thấy đơn hàng');
  }

  if (currentUser.shopId && order.shopId !== currentUser.shopId) {
    throw forbidden('Bạn không được phép thao tác đơn hàng của shop khác');
  }

  if (
    !canManageAllOrders(currentUser.roles) &&
    currentUser.roles.includes(RoleName.customer) &&
    order.customerId !== currentUser.userId
  ) {
    throw forbidden('Bạn không được phép thao tác đơn hàng này');
  }

  if (!['confirmed', 'packing', 'packed'].includes(order.status)) {
    throw badRequest(
      'Đơn hàng phải ở trạng thái Xác nhận / Đóng gói / Đã đóng gói để quay hoặc upload video'
    );
  }

  const trackingCode = (payload.trackingCode || order.trackingCode || '').trim();
  if (!trackingCode) {
    throw badRequest('Đơn hàng chưa có mã vận đơn');
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
  const recordingFlow =
    payload.recordingFlow || (payload.module === 'receiving' ? 'return' : 'outbound');
  const session: CaptureUploadSession = {
    sessionId: crypto.randomUUID(),
    userId: currentUser.userId,
    shopId: order.shopId,
    orderId: order.id,
    orderCode: order.orderCode,
    trackingCode,
    customerName: order.customerName,
    module: payload.module || 'packaging',
    recordingFlow,
    uploadEndpoint:
      payload.module === 'receiving' ? '/api/videos/receiving/upload' : '/api/videos/upload',
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  activeSessions.set(currentUser.userId, session);

  const captureSettings = await getCaptureSettings();
  await captureRuntimeService.syncPreparedOrder(currentUser.userId, {
    orderId: order.id,
    orderCode: order.orderCode,
    shopId: order.shopId,
    recordingFlow,
    items: order.items?.map((item: any) => ({
      qty: item.quantity,
      name: item.productName,
      product_id: item.productId || undefined,
      sku_id: item.productSku || undefined,
    })),
  });
  return {
    session,
    captureSettings,
    uploadPolicy: {
      maxFileSizeBytes: 500 * 1024 * 1024,
      acceptedVideoMimeTypes: [
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-msvideo',
      ],
      compressionTargetMb: Number(process.env.VIDEO_TARGET_SIZE_MB || '4'),
    },
    order: {
      id: order.id,
      orderCode: order.orderCode,
      trackingCode,
      status: order.status,
      customerName: order.customerName,
      shop: order.shop,
    },
  };
};

export const getActiveUploadSession = async (currentUser: CurrentUser) => {
  const session = pruneExpiredSession(currentUser.userId);
  if (!session) {
    return null;
  }

  const captureSettings = await getCaptureSettings();
  return {
    session,
    captureSettings,
  };
};

export const getActiveUploadSessionEntity = (currentUser: CurrentUser) => {
  return pruneExpiredSession(currentUser.userId);
};

export const ensureActiveRecordingSession = async (
  currentUser: CurrentUser,
  module: CaptureModule = 'packaging'
) => {
  const existing = pruneExpiredSession(currentUser.userId);
  if (existing) {
    return existing;
  }

  const runtime = captureRuntimeService.getRuntimeStatus(currentUser.userId);
  const runtimeOrderId = runtime.order_info?.order_id;
  if (!runtimeOrderId) {
    throw badRequest('Chua co don hang hien tai de tao phien ghi hinh');
  }

  const prepared = await prepareUploadSession(
    {
      orderId: runtimeOrderId,
      module,
      recordingFlow: runtime.recording_flow === 'return' ? 'return' : 'outbound',
    },
    currentUser
  );

  return prepared.session;
};

export const clearActiveUploadSession = (currentUser: CurrentUser) => {
  activeSessions.delete(currentUser.userId);
  captureRuntimeService.clearCurrentOrder(currentUser.userId);
  return { cleared: true };
};
