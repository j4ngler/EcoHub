import { createHmac } from 'crypto';
import prisma from '../../config/database';
import { badRequest } from '../../middlewares/error.middleware';
import { type NormalizedOrder, upsertNormalizedOrder } from './tiktok-sync.service';

export type ShopeeConnection = {
  id: string;
  shopId: string;
  channelId: string;
  channel: { code: string; name: string };
  accessToken?: string | null;
  refreshToken?: string | null;
  shopIdRemote?: string | null;
  channelShopId?: string | null;
};

const SHOPEE_ENV = (process.env.SHOPEE_ENV || 'test').trim().toLowerCase();
const PARTNER_ID = (
  (SHOPEE_ENV === 'live'
    ? process.env.SHOPEE_LIVE_PARTNER_ID || process.env.SHOPEE_PARTNER_ID
    : process.env.SHOPEE_PARTNER_ID) || ''
).trim();
const PARTNER_KEY = (
  (SHOPEE_ENV === 'live'
    ? process.env.SHOPEE_LIVE_PARTNER_KEY || process.env.SHOPEE_PARTNER_KEY
    : process.env.SHOPEE_PARTNER_KEY) || ''
).trim();
const API_BASE_URL = (
  (SHOPEE_ENV === 'live'
    ? process.env.SHOPEE_LIVE_API_BASE_URL
    : process.env.SHOPEE_TEST_API_BASE_URL) ||
  process.env.SHOPEE_API_BASE_URL ||
  (SHOPEE_ENV === 'live'
    ? 'https://partner.shopeemobile.com'
    : 'https://openplatform.sandbox.test-stable.shopee.sg')
).trim();

const assertEnvironmentConfig = () => {
  if (SHOPEE_ENV === 'live' && /sandbox|test-stable/i.test(API_BASE_URL)) {
    throw badRequest('Cấu hình Shopee live đang trỏ nhầm API sandbox');
  }
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
const asArray = (value: unknown): Record<string, any>[] =>
  Array.isArray(value) ? value.map(asRecord) : [];
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
const asString = (value: unknown) => String(value ?? '').trim();
const asNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const asTimestamp = (value: unknown) => {
  const seconds = asNumber(value);
  return seconds > 0 ? new Date(seconds * 1000) : null;
};

const buildRequestUrl = (
  path: string,
  connection: ShopeeConnection,
  query: Record<string, string | number | undefined> = {}
) => {
  assertEnvironmentConfig();
  const accessToken = asString(connection.accessToken);
  const remoteShopId = asString(connection.shopIdRemote || connection.channelShopId);
  if (!PARTNER_ID || !PARTNER_KEY || !accessToken || !remoteShopId) {
    throw badRequest('Kết nối Shopee thiếu Partner ID, Partner Key, access token hoặc shop_id');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${PARTNER_ID}${path}${timestamp}${accessToken}${remoteShopId}`;
  const sign = createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');
  const url = new URL(`${API_BASE_URL}${path}`);
  url.searchParams.set('partner_id', PARTNER_ID);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('shop_id', remoteShopId);
  url.searchParams.set('sign', sign);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
};

const requestShopee = async (
  connection: ShopeeConnection,
  path: string,
  query: Record<string, string | number | undefined> = {}
) => {
  const url = buildRequestUrl(path, connection, query);
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const text = await response.text();
  let payload: Record<string, any>;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest(`Shopee trả về dữ liệu không hợp lệ (HTTP ${response.status})`);
  }
  if (!response.ok || payload.error) {
    throw badRequest(
      `Shopee API ${path} lỗi: ${asString(payload.message || payload.error || response.status)}`
    );
  }
  return payload;
};

const mapOrderStatus = (status: unknown) => {
  switch (asString(status).toUpperCase()) {
    case 'READY_TO_SHIP':
      return 'confirmed';
    case 'PROCESSED':
      return 'processing';
    case 'SHIPPED':
    case 'TO_CONFIRM_RECEIVE':
      return 'shipped';
    case 'COMPLETED':
      return 'completed';
    case 'IN_CANCEL':
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
};

const getTrackingCode = (order: Record<string, any>) => {
  const packageTracking = asArray(order.package_list)
    .map((pkg) => asString(pkg.tracking_number || pkg.tracking_no))
    .find(Boolean);
  return (
    asString(order.tracking_number || order.tracking_no || order.tracking_code) ||
    packageTracking ||
    null
  );
};

const normalizeShopeeOrder = (raw: Record<string, any>): NormalizedOrder => {
  const address = asRecord(raw.recipient_address);
  const items = asArray(raw.item_list).map((item) => {
    const quantity = Math.max(1, Math.trunc(asNumber(item.model_quantity_purchased, 1)));
    const unitPrice = asNumber(
      item.model_discounted_price ?? item.model_original_price ?? item.item_price,
      0
    );
    return {
      name: asString(item.item_name || item.model_name) || 'Sản phẩm Shopee',
      qty: quantity,
      productId: asString(item.item_id) || null,
      skuId: asString(item.model_id) || null,
      sku: asString(item.model_sku || item.item_sku || item.model_id || item.item_id) || null,
      unitPrice,
      totalPrice: unitPrice * quantity,
      imageUrl:
        asString(asRecord(item.image_info).image_url || item.image_url || item.image) || null,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalAmount = asNumber(raw.total_amount, subtotal);
  const shippingFee = asNumber(
    raw.actual_shipping_fee ?? raw.estimated_shipping_fee ?? raw.buyer_paid_shipping_fee,
    0
  );
  const orderSn = asString(raw.order_sn);

  return {
    code: orderSn,
    orderId: orderSn,
    platform: 'shopee',
    status: mapOrderStatus(raw.order_status),
    shippingStatus: asString(raw.order_status),
    trackingCode: getTrackingCode(raw),
    customerName: asString(address.name || raw.buyer_username) || 'Khách Shopee',
    customerPhone: asString(address.phone),
    shippingAddress: asString(address.full_address),
    shippingProvince: asString(address.state) || null,
    shippingDistrict: asString(address.city || address.district) || null,
    shippingWard: asString(address.town) || null,
    subtotal,
    shippingFee,
    discountAmount: Math.max(0, subtotal + shippingFee - totalAmount),
    totalAmount,
    paymentMethod: asString(raw.payment_method) || null,
    items,
  };
};

const getOrderList = async (
  connection: ShopeeConnection,
  options: { days?: number; maxPages?: number } = {}
) => {
  const now = Math.floor(Date.now() / 1000);
  const days = Math.min(15, Math.max(1, options.days || 15));
  const maxPages = Math.max(1, options.maxPages || 10);
  let cursor = '';
  const orderSns: string[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await requestShopee(connection, '/api/v2/order/get_order_list', {
      time_range_field: 'create_time',
      time_from: now - days * 86400,
      time_to: now,
      page_size: 100,
      cursor: cursor || undefined,
      response_optional_fields: 'order_status',
    });
    const response = asRecord(payload.response);
    for (const row of asArray(response.order_list)) {
      const orderSn = asString(row.order_sn);
      if (orderSn) orderSns.push(orderSn);
    }
    if (!response.more || !asString(response.next_cursor)) break;
    cursor = asString(response.next_cursor);
  }
  return [...new Set(orderSns)];
};

const getOrderDetails = async (connection: ShopeeConnection, orderSns: string[]) => {
  const details: Record<string, any>[] = [];
  for (let index = 0; index < orderSns.length; index += 50) {
    const chunk = orderSns.slice(index, index + 50);
    if (!chunk.length) continue;
    const payload = await requestShopee(connection, '/api/v2/order/get_order_detail', {
      order_sn_list: chunk.join(','),
      response_optional_fields:
        'buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,item_list,pay_time,package_list,shipping_carrier,payment_method,total_amount',
    });
    details.push(...asArray(asRecord(payload.response).order_list));
  }
  return details;
};

export const syncShopeeOrdersForConnection = async (
  connection: ShopeeConnection,
  userId: string
) => {
  const orderSns = await getOrderList(connection);
  const rows = await getOrderDetails(connection, orderSns);
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const normalized = normalizeShopeeOrder(row);
      const existing = await prisma.order.findFirst({
        where: { OR: [{ orderCode: normalized.code }, { channelOrderId: normalized.orderId }] },
        select: { id: true },
      });
      await upsertNormalizedOrder(connection as any, normalized, userId);
      if (existing) updated += 1;
      else created += 1;
    } catch (error) {
      failed += 1;
      console.warn('[Shopee sync] order upsert failed:', error instanceof Error ? error.message : error);
    }
  }

  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });
  return { synced: created + updated, created, updated, failed, lastSyncAt: new Date() };
};

export const lookupAndPersistShopeeOrder = async (params: {
  code: string;
  shopId?: string | null;
  userId?: string | null;
}) => {
  const code = asString(params.code);
  const connections = await prisma.shopChannelConnection.findMany({
    where: {
      status: 'connected',
      channel: { code: 'shopee' },
      ...(params.shopId ? { shopId: params.shopId } : {}),
    },
    include: { channel: true },
    orderBy: { createdAt: 'desc' },
  });

  for (const connection of connections) {
    try {
      const orderSns = await getOrderList(connection, { days: 15, maxPages: 10 });
      const directOrderSn = orderSns.find((orderSn) => orderSn === code);
      const rows = await getOrderDetails(connection, directOrderSn ? [directOrderSn] : orderSns);
      const row = rows.find((item) => {
        const normalized = normalizeShopeeOrder(item);
        return normalized.orderId === code || normalized.trackingCode === code;
      });
      if (row) {
        return upsertNormalizedOrder(
          connection as any,
          normalizeShopeeOrder(row),
          params.userId || undefined
        );
      }
    } catch (error) {
      console.warn('[Shopee lookup] failed:', error instanceof Error ? error.message : error);
    }
  }
  return null;
};

export const syncShopeeProductsForConnection = async (
  connection: ShopeeConnection,
  userId: string
) => {
  let offset = 0;
  const itemIds: string[] = [];
  for (let page = 0; page < 20; page += 1) {
    const payload = await requestShopee(connection, '/api/v2/product/get_item_list', {
      offset,
      page_size: 100,
      item_status: 'NORMAL',
    });
    const response = asRecord(payload.response);
    const rows = asArray(response.item);
    for (const row of rows) {
      const itemId = asString(row.item_id);
      if (itemId) itemIds.push(itemId);
    }
    if (!response.has_next_page || !rows.length) break;
    offset += rows.length;
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  for (let index = 0; index < itemIds.length; index += 50) {
    const payload = await requestShopee(connection, '/api/v2/product/get_item_base_info', {
      item_id_list: itemIds.slice(index, index + 50).join(','),
    });
    for (const item of asArray(asRecord(payload.response).item_list)) {
      try {
        const models = asArray(item.model);
        const firstModel = models[0] || {};
        const sku =
          asString(firstModel.model_sku || item.item_sku || firstModel.model_id || item.item_id);
        if (!sku) continue;
        const priceInfo = asArray(item.price_info)[0] || asArray(firstModel.price_info)[0] || {};
        const stockInfo = asArray(item.stock_info_v2).flatMap((row) => asArray(row.seller_stock));
        const stockQuantity = stockInfo.reduce(
          (sum, row) => sum + asNumber(row.stock, 0),
          asNumber(item.stock, 0)
        );
        const existing = await prisma.product.findUnique({
          where: { shopId_sku: { shopId: connection.shopId, sku } },
          select: { id: true },
        });
        const images = asStringArray(asRecord(item.image).image_url_list);
        await prisma.product.upsert({
          where: { shopId_sku: { shopId: connection.shopId, sku } },
          update: {
            name: asString(item.item_name) || sku,
            description: asString(item.description) || null,
            price: asNumber(priceInfo.current_price ?? priceInfo.original_price, 0),
            stockQuantity,
            images: images.length ? images : undefined,
            status: stockQuantity > 0 ? 'active' : 'out_of_stock',
          },
          create: {
            shopId: connection.shopId,
            sku,
            name: asString(item.item_name) || sku,
            description: asString(item.description) || null,
            price: asNumber(priceInfo.current_price ?? priceInfo.original_price, 0),
            stockQuantity,
            images: images.length ? images : undefined,
            status: stockQuantity > 0 ? 'active' : 'out_of_stock',
            createdBy: userId,
          },
        });
        if (existing) updated += 1;
        else created += 1;
      } catch (error) {
        failed += 1;
        console.warn('[Shopee sync] product upsert failed:', error instanceof Error ? error.message : error);
      }
    }
  }

  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });
  return { synced: created + updated, created, updated, failed, lastSyncAt: new Date() };
};
