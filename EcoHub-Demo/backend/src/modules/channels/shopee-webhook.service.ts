import { createHash, timingSafeEqual } from 'crypto';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import prisma from '../../config/database';
import { forbidden } from '../../middlewares/error.middleware';
import { upsertReturnForOrder } from './tiktok-sync.service';
import { mapShopeeReturnStatus } from './shopee-sync.service';

const CALLBACK_TOKEN = (process.env.SHOPEE_PUSH_CALLBACK_TOKEN || '').trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
const asString = (value: unknown) => String(value ?? '').trim();
const asNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const verifyCallbackToken = (provided?: string) => {
  if (!CALLBACK_TOKEN) return;
  const actual = Buffer.from(asString(provided));
  const expected = Buffer.from(CALLBACK_TOKEN);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw forbidden('Shopee webhook callback token không hợp lệ');
  }
};

const mapShopeeStatus = (status: unknown): OrderStatus | null => {
  switch (asString(status).toUpperCase()) {
    case 'READY_TO_SHIP':
      return OrderStatus.confirmed;
    case 'PROCESSED':
      return OrderStatus.packing;
    case 'SHIPPED':
      return OrderStatus.shipping;
    case 'TO_CONFIRM_RECEIVE':
      return OrderStatus.delivered;
    case 'COMPLETED':
      return OrderStatus.completed;
    case 'IN_CANCEL':
    case 'CANCELLED':
      return OrderStatus.cancelled;
    default:
      return null;
  }
};

const processOrderPush = async (payload: Record<string, any>) => {
  const data = asRecord(payload.data);
  const orderSn = asString(
    data.ordersn || data.order_sn || data.order_id || payload.ordersn || payload.order_sn
  );
  if (!orderSn) return;

  const order = await prisma.order.findFirst({
    where: { OR: [{ orderCode: orderSn }, { channelOrderId: orderSn }] },
    select: { id: true },
  });
  if (!order) return;

  const mappedStatus = mapShopeeStatus(data.status || data.order_status);
  const trackingCode = asString(
    data.tracking_no || data.tracking_number || data.tracking_code
  );
  await prisma.order.update({
    where: { id: order.id },
    data: {
      ...(mappedStatus ? { status: mappedStatus } : {}),
      ...(trackingCode ? { trackingCode } : {}),
    },
  });
};

// Shopee's exact push event `code` for return/refund updates was not verified (doc access
// blocked when researched) — detect by payload shape (`return_sn` present) instead of a magic
// code number so this keeps working regardless of which code Shopee actually sends.
const processReturnPush = async (payload: Record<string, any>) => {
  const data = asRecord(payload.data);
  const returnSn = asString(data.return_sn || data.returnsn);
  const orderSn = asString(data.order_sn || data.ordersn);
  if (!returnSn || !orderSn) return;

  const mappedStatus = mapShopeeReturnStatus(data.status || data.negotiation_status);
  await upsertReturnForOrder({
    orderLookupCode: orderSn,
    externalReturnId: `shopee:${returnSn}`,
    platform: 'shopee',
    reason: data.reason,
    status: mappedStatus,
    refundAmount: asNumber(data.refund_amount, 0) || undefined,
    markOrderReturned: mappedStatus === ReturnStatus.completed,
  });
};

export const receiveShopeeWebhook = async (params: {
  payload: unknown;
  callbackToken?: string;
}) => {
  verifyCallbackToken(params.callbackToken);
  const payload = asRecord(params.payload);
  const eventCode = Number(payload.code);
  if (!Number.isInteger(eventCode)) {
    return { accepted: false, reason: 'missing_event_code' };
  }

  const remoteShopId = asString(payload.shop_id) || null;
  const eventKey =
    asString(payload.request_id || payload.event_id) ||
    createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  const event = await prisma.channelWebhookEvent.upsert({
    where: { eventKey },
    update: {},
    create: {
      channelCode: 'shopee',
      eventCode,
      remoteShopId,
      eventKey,
      payload,
    },
  });
  if (event.status === 'processed') return { accepted: true, duplicate: true };

  try {
    const data = asRecord(payload.data);
    if (asString(data.return_sn || data.returnsn)) {
      await processReturnPush(payload);
    } else {
      await processOrderPush(payload);
    }
    await prisma.channelWebhookEvent.update({
      where: { id: event.id },
      data: { status: 'processed', processedAt: new Date(), error: null },
    });
    return { accepted: true, duplicate: false };
  } catch (error) {
    await prisma.channelWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
      },
    });
    throw error;
  }
};
