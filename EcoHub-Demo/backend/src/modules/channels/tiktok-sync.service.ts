import crypto from 'crypto';
import prisma from '../../config/database';
import { badRequest } from '../../middlewares/error.middleware';

type TikTokConnection = {
  id: string;
  shopId: string;
  channelId: string;
  channel: { code: string; name: string };
  accessToken?: string | null;
  refreshToken?: string | null;
  shopCipher?: string | null;
  shopIdRemote?: string | null;
  merchantId?: string | null;
  channelShopId?: string | null;
};

type NormalizedOrderItem = {
  name: string;
  qty: number;
  productId?: string | null;
  skuId?: string | null;
  sku?: string | null;
  unitPrice: number;
  totalPrice: number;
  imageUrl?: string | null;
};

export type NormalizedOrder = {
  code: string;
  orderId: string;
  platform: string;
  status: string;
  shippingStatus?: string;
  trackingCode?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  shippingAddress: string;
  shippingProvince?: string | null;
  shippingDistrict?: string | null;
  shippingWard?: string | null;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod?: string | null;
  items: NormalizedOrderItem[];
};

type NormalizedProduct = {
  sku: string;
  name: string;
  description?: string | null;
  price: number;
  stockQuantity: number;
  barcode?: string | null;
  images?: string[];
};

const TIKTOK_BASE_URL = (
  process.env.TIKTOK_BASE_URL ||
  process.env.ECOHUB_TIKTOK_BASE_URL ||
  process.env.ECOHUB_ORDER_API_BASE_URL ||
  'https://open-api.tiktokglobalshop.com'
).trim();

const TIKTOK_APP_KEY = (
  process.env.TIKTOK_APP_KEY ||
  process.env.ECOHUB_TIKTOK_APP_KEY ||
  process.env.ECOHUB_ORDER_API_APP_KEY ||
  ''
).trim();

const TIKTOK_APP_SECRET = (
  process.env.TIKTOK_APP_SECRET ||
  process.env.ECOHUB_TIKTOK_APP_SECRET ||
  process.env.ECOHUB_ORDER_API_APP_SECRET ||
  ''
).trim();

const TIKTOK_AUTH_HEADER = (
  process.env.TIKTOK_AUTH_HEADER ||
  process.env.ECOHUB_TIKTOK_AUTH_HEADER ||
  process.env.ECOHUB_ORDER_API_AUTH_HEADER ||
  'x-tts-access-token'
).trim();

const TIKTOK_TIMEOUT_MS =
  (Number.parseFloat(
    process.env.TIKTOK_TIMEOUT_SEC ||
      process.env.ECOHUB_TIKTOK_TIMEOUT_SEC ||
      process.env.ECOHUB_ORDER_API_TIMEOUT_SEC ||
      '20'
  ) || 20) * 1000;

const ORDER_LOOKUP_PATH = (
  process.env.TIKTOK_ORDER_LOOKUP_PATH ||
  process.env.ECOHUB_ORDER_API_ENDPOINT_PATH ||
  '/api/order/202309/orders/query'
).trim();

const ORDER_SYNC_PATH = (
  process.env.TIKTOK_ORDER_SYNC_PATH ||
  process.env.ECOHUB_ORDER_SYNC_ENDPOINT_PATH ||
  ORDER_LOOKUP_PATH
).trim();

const PRODUCT_SYNC_PATH = (
  process.env.TIKTOK_PRODUCT_SYNC_PATH ||
  process.env.ECOHUB_PRODUCT_SYNC_ENDPOINT_PATH ||
  '/api/products/202309/products/search'
).trim();

const ORDER_LOOKUP_FIELD = (
  process.env.TIKTOK_ORDER_LOOKUP_FIELD ||
  process.env.ECOHUB_ORDER_API_LOOKUP_FIELD ||
  ''
).trim();

const parseJsonObjectEnv = (name: string) => {
  const raw = (process.env[name] || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw badRequest(`${name} phai la JSON object hop le`);
  }
};

const asString = (value: unknown, fallback = '') => {
  if (value == null) return fallback;
  return String(value).trim() || fallback;
};

const asNumber = (value: unknown, fallback = 0) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return asNumber(obj.amount ?? obj.value ?? obj.sale_price ?? obj.original_price, fallback);
  }
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const extractFirst = (source: unknown, keys: string[]): string => {
  if (!source || typeof source !== 'object') return '';
  const obj = source as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
};

const extractDeepFirst = (source: unknown, keys: string[]): string => {
  const direct = extractFirst(source, keys);
  if (direct) return direct;
  if (!source || typeof source !== 'object') return '';
  const obj = source as Record<string, unknown>;
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = extractDeepFirst(item, keys);
        if (found) return found;
      }
    } else if (value && typeof value === 'object') {
      const found = extractDeepFirst(value, keys);
      if (found) return found;
    }
  }
  return '';
};

const collectRows = (payload: unknown, keys: string[]): Record<string, unknown>[] => {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const nested = collectRows(value, keys);
      if (nested.length) return nested;
    }
  }
  return [];
};

const buildSign = (params: Record<string, unknown>, requestPath: string, bodyRaw = '') => {
  const signParams = Object.keys(params)
    .filter((key) => key !== 'sign' && key !== 'access_token')
    .sort()
    .map((key) => `${key}${String(params[key] ?? '')}`)
    .join('');
  const payload = `${TIKTOK_APP_SECRET}${requestPath}${signParams}${bodyRaw}${TIKTOK_APP_SECRET}`;
  return crypto.createHmac('sha256', TIKTOK_APP_SECRET).update(payload).digest('hex');
};

const ensureTikTokReady = (connection: TikTokConnection) => {
  if (connection.channel.code !== 'tiktok') {
    throw badRequest(`Kenh ${connection.channel.name} chua co adapter dong bo`);
  }
  if (!TIKTOK_APP_KEY || !TIKTOK_APP_SECRET) {
    throw badRequest('Thieu TIKTOK_APP_KEY/TIKTOK_APP_SECRET trong backend');
  }
  if (!connection.accessToken) {
    throw badRequest('Ket noi TikTok thieu access token');
  }
  if (!connection.shopCipher) {
    throw badRequest('Ket noi TikTok thieu shop_cipher');
  }
};

const requestTikTok = async (
  connection: TikTokConnection,
  method: 'GET' | 'POST',
  requestPath: string,
  queryParams?: Record<string, unknown>,
  body?: Record<string, unknown>
) => {
  ensureTikTokReady(connection);
  const normalizedPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  const query: Record<string, unknown> = {
    ...parseJsonObjectEnv('ECOHUB_TIKTOK_DEFAULT_QUERY_PARAMS'),
    ...parseJsonObjectEnv('ECOHUB_ORDER_API_QUERY_PARAMS'),
    ...(queryParams || {}),
    app_key: TIKTOK_APP_KEY,
    shop_cipher: connection.shopCipher,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };

  const bodyRaw = method === 'GET' || !body ? '' : JSON.stringify(body);
  query.sign = buildSign(query, normalizedPath, bodyRaw);

  const url = new URL(`${TIKTOK_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIKTOK_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        [TIKTOK_AUTH_HEADER]: String(connection.accessToken),
      },
      body: method === 'GET' ? undefined : bodyRaw,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw badRequest(`TikTok API HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const apiCode = (data as any)?.code;
    if (apiCode !== undefined && apiCode !== null && apiCode !== 0 && apiCode !== '0') {
      throw badRequest(`TikTok API error code=${apiCode}: ${(data as any)?.message || (data as any)?.msg || 'unknown'}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeStatus = (raw: unknown) => {
  const status = asString(raw).toUpperCase();
  if (['CANCELLED', 'CANCELED', 'UNPAID_CANCELLED'].includes(status)) return 'cancelled';
  if (['COMPLETED', 'DELIVERED'].includes(status)) return 'completed';
  if (['SHIPPED', 'IN_TRANSIT', 'AWAITING_COLLECTION'].includes(status)) return 'shipping';
  if (['READY_TO_SHIP', 'AWAITING_SHIPMENT', 'TO_SHIP', 'PROCESSED'].includes(status)) return 'confirmed';
  if (['PACKED'].includes(status)) return 'packed';
  return 'pending';
};

const normalizeAddress = (raw: unknown) => {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const addressLine = [
    extractFirst(obj, ['address_line1', 'addressLine1', 'address_detail', 'addressDetail', 'full_address', 'fullAddress']),
    extractFirst(obj, ['address_line2', 'addressLine2']),
  ]
    .filter(Boolean)
    .join(', ');
  return {
    address: addressLine || extractDeepFirst(raw, ['full_address', 'fullAddress', 'address', 'shipping_address']) || 'Chua co dia chi',
    province: extractDeepFirst(raw, ['state', 'province', 'region']),
    district: extractDeepFirst(raw, ['district', 'city']),
    ward: extractDeepFirst(raw, ['ward', 'town']),
  };
};

export const normalizeOrderPayload = (orderRaw: Record<string, unknown>, lookupCode?: string): NormalizedOrder => {
  const rows = collectRows(orderRaw, ['line_items', 'line_item_list', 'order_line_list', 'items', 'order_items', 'skus']);
  const items = rows.map((row, index): NormalizedOrderItem => {
    const qty = Math.max(1, Math.trunc(asNumber(row.quantity ?? row.qty ?? row.count, 1)));
    const unitPrice = asNumber(row.sale_price ?? row.unit_price ?? row.price ?? row.sku_sale_price, 0);
    const name =
      extractDeepFirst(row, ['product_name', 'productName', 'name', 'title', 'sku_name', 'skuName']) ||
      `San pham ${index + 1}`;
    const sku = extractDeepFirst(row, ['seller_sku', 'sellerSku', 'sku', 'sku_id', 'skuId']);
    return {
      name,
      qty,
      productId: extractDeepFirst(row, ['product_id', 'productId']) || null,
      skuId: extractDeepFirst(row, ['sku_id', 'skuId']) || sku || null,
      sku: sku || null,
      unitPrice,
      totalPrice: asNumber(row.total_price ?? row.item_total ?? row.subtotal, unitPrice * qty),
      imageUrl: extractDeepFirst(row, ['image_url', 'imageUrl', 'thumbnail_url', 'thumbnailUrl']) || null,
    };
  });

  const orderId = extractFirst(orderRaw, ['order_id', 'orderId', 'id']) || asString(lookupCode);
  const trackingCode =
    extractDeepFirst(orderRaw, ['tracking_number', 'trackingNumber', 'tracking_no', 'trackingNo', 'tracking_code', 'trackingCode']) ||
    null;
  const status = extractFirst(orderRaw, ['shipping_status', 'order_status', 'status', 'fulfillment_status', 'delivery_status']);
  const address = normalizeAddress(orderRaw.recipient_address || orderRaw.shipping_address || orderRaw.address);
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalAmount = asNumber(orderRaw.total_amount ?? orderRaw.payment_amount ?? orderRaw.order_amount, subtotal);

  return {
    code: orderId || asString(lookupCode),
    orderId: orderId || asString(lookupCode),
    platform: 'TIKTOK_SHOP',
    status: normalizeStatus(status),
    shippingStatus: asString(status),
    trackingCode,
    customerName:
      extractDeepFirst(orderRaw, ['buyer_name', 'buyerName', 'customer_name', 'customerName', 'recipient_name', 'recipientName']) ||
      'Khach TikTok',
    customerPhone:
      extractDeepFirst(orderRaw, ['phone_number', 'phoneNumber', 'customer_phone', 'customerPhone', 'recipient_phone', 'recipientPhone']) ||
      'N/A',
    customerEmail: extractDeepFirst(orderRaw, ['email', 'customer_email', 'customerEmail']) || null,
    shippingAddress: address.address,
    shippingProvince: address.province || null,
    shippingDistrict: address.district || null,
    shippingWard: address.ward || null,
    subtotal,
    shippingFee: asNumber(orderRaw.shipping_fee ?? orderRaw.shippingFee, 0),
    discountAmount: asNumber(orderRaw.discount_amount ?? orderRaw.discountAmount, 0),
    totalAmount,
    paymentMethod: extractFirst(orderRaw, ['payment_method', 'paymentMethod']) || null,
    items,
  };
};

const findOrderInPayload = (payload: unknown, code: string) => {
  if (!payload || typeof payload !== 'object') return null;
  const direct = (payload as any)?.data?.order || (payload as any)?.order;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, unknown>;

  const rows = collectRows(payload, ['orders', 'order_list', 'orderList', 'list']);
  if (!rows.length) return null;
  const normalizedCode = code.trim();
  return (
    rows.find((row) => {
      const rowId = extractFirst(row, ['id', 'order_id', 'orderId']);
      const tracking = extractDeepFirst(row, ['tracking_number', 'trackingNumber', 'tracking_code', 'trackingCode']);
      return rowId === normalizedCode || tracking === normalizedCode;
    }) || rows[0]
  );
};

export const lookupRemoteOrder = async (connection: TikTokConnection, code: string) => {
  const normalized = code.trim();
  if (!normalized) return null;
  const method = (process.env.ECOHUB_ORDER_API_METHOD || process.env.TIKTOK_ORDER_LOOKUP_METHOD || 'POST').trim().toUpperCase() === 'GET' ? 'GET' : 'POST';
  const query = parseJsonObjectEnv('ECOHUB_ORDER_API_QUERY_PARAMS');
  const bodyTemplate = parseJsonObjectEnv('ECOHUB_ORDER_API_BODY_TEMPLATE');
  const body: Record<string, unknown> = { ...bodyTemplate };
  const lookupField = ORDER_LOOKUP_FIELD || 'order_id_list';

  if (method === 'GET') {
    query[lookupField] = lookupField.endsWith('_list') ? [normalized] : normalized;
  } else {
    body[lookupField] = lookupField.endsWith('_list') ? [normalized] : normalized;
  }

  const payload = await requestTikTok(connection, method, ORDER_LOOKUP_PATH, query, method === 'GET' ? undefined : body);
  const rawOrder = findOrderInPayload(payload, normalized);
  return rawOrder ? normalizeOrderPayload(rawOrder, normalized) : null;
};

const normalizeProductPayload = (raw: Record<string, unknown>, index: number): NormalizedProduct => {
  const sku =
    extractDeepFirst(raw, ['seller_sku', 'sellerSku', 'sku', 'product_id', 'productId', 'id']) ||
    `TIKTOK-PRODUCT-${index + 1}`;
  const image = extractDeepFirst(raw, ['image_url', 'imageUrl', 'thumbnail_url', 'thumbnailUrl']);
  return {
    sku,
    name: extractDeepFirst(raw, ['product_name', 'productName', 'name', 'title']) || sku,
    description: extractDeepFirst(raw, ['description']) || null,
    price: asNumber(raw.price ?? raw.sale_price ?? raw.skus, 0),
    stockQuantity: Math.max(0, Math.trunc(asNumber(raw.stock_quantity ?? raw.stockQuantity ?? raw.quantity ?? raw.inventory, 0))),
    barcode: extractDeepFirst(raw, ['barcode', 'bar_code', 'barCode']) || null,
    images: image ? [image] : undefined,
  };
};

const upsertProductFromItem = async (
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  shopId: string,
  userId: string | null,
  item: NormalizedOrderItem
) => {
  const sku = (item.sku || item.skuId || item.productId || '').trim();
  if (!sku) return null;
  return tx.product.upsert({
    where: { shopId_sku: { shopId, sku } },
    update: {
      name: item.name,
      price: item.unitPrice,
      images: item.imageUrl ? [item.imageUrl] : undefined,
      status: 'active',
    },
    create: {
      shopId,
      sku,
      name: item.name,
      price: item.unitPrice,
      stockQuantity: 0,
      images: item.imageUrl ? [item.imageUrl] : undefined,
      createdBy: userId || undefined,
    },
  });
};

export const upsertNormalizedOrder = async (
  connection: TikTokConnection,
  order: NormalizedOrder,
  userId?: string | null
) => {
  const items = order.items.length
    ? order.items
    : [{ name: 'San pham TikTok', qty: 1, unitPrice: order.totalAmount, totalPrice: order.totalAmount } satisfies NormalizedOrderItem];

  return prisma.$transaction(async (tx) => {
    const productBySku = new Map<string, string>();
    for (const item of items) {
      const product = await upsertProductFromItem(tx, connection.shopId, userId || null, item);
      const sku = (item.sku || item.skuId || item.productId || '').trim();
      if (product && sku) productBySku.set(sku, product.id);
    }

    const existing = await tx.order.findFirst({
      where: {
        OR: [
          { orderCode: order.code },
          { channelOrderId: order.orderId },
          ...(order.trackingCode ? [{ trackingCode: order.trackingCode }] : []),
        ],
      },
      select: { id: true },
    });

    const data = {
      shopId: connection.shopId,
      orderCode: order.code,
      channelId: connection.channelId,
      channelOrderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail || null,
      shippingAddress: order.shippingAddress,
      shippingProvince: order.shippingProvince || null,
      shippingDistrict: order.shippingDistrict || null,
      shippingWard: order.shippingWard || null,
      trackingCode: order.trackingCode || undefined,
      shippingFee: order.shippingFee,
      codAmount: order.totalAmount,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      status: order.status as any,
      paymentMethod: order.paymentMethod || null,
      notes: order.shippingStatus ? `TikTok shipping_status=${order.shippingStatus}` : null,
      createdBy: userId || undefined,
    };

    const saved = existing
      ? await tx.order.update({ where: { id: existing.id }, data })
      : await tx.order.create({ data });

    await tx.orderItem.deleteMany({ where: { orderId: saved.id } });
    await tx.orderItem.createMany({
      data: items.map((item) => {
        const sku = (item.sku || item.skuId || item.productId || '').trim();
        return {
          orderId: saved.id,
          productId: productBySku.get(sku) || undefined,
          productName: item.name,
          productSku: sku || undefined,
          quantity: Math.max(1, Math.trunc(item.qty || 1)),
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        };
      }),
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: saved.id,
        status: String(order.status),
        note: existing ? 'Dong bo lai tu TikTok' : 'Tao tu dong tu TikTok',
        changedBy: userId || undefined,
      },
    });

    return tx.order.findUnique({
      where: { id: saved.id },
      include: { items: true, channel: true, shop: true },
    });
  });
};

export const lookupAndPersistOrder = async (params: { code: string; shopId?: string | null; userId?: string | null }) => {
  const where: any = { status: 'connected', channel: { code: 'tiktok' } };
  if (params.shopId) where.shopId = params.shopId;
  const connections = await prisma.shopChannelConnection.findMany({
    where,
    include: { channel: true },
    orderBy: { createdAt: 'desc' },
  });

  for (const connection of connections) {
    try {
      const remote = await lookupRemoteOrder(connection, params.code);
      if (!remote) continue;
      return upsertNormalizedOrder(connection, remote, params.userId);
    } catch (error) {
      console.warn('[TikTok sync] lookup failed:', error instanceof Error ? error.message : error);
    }
  }
  return null;
};

export const syncOrdersForConnection = async (connection: TikTokConnection, userId: string) => {
  const body = {
    ...parseJsonObjectEnv('ECOHUB_ORDER_SYNC_BODY_TEMPLATE'),
    page_size: Number.parseInt(process.env.TIKTOK_ORDER_SYNC_PAGE_SIZE || process.env.ECOHUB_ORDER_SYNC_PAGE_SIZE || '50', 10),
  };
  const payload = await requestTikTok(connection, 'POST', ORDER_SYNC_PATH, parseJsonObjectEnv('ECOHUB_ORDER_SYNC_QUERY_PARAMS'), body);
  const rows = collectRows(payload, ['orders', 'order_list', 'orderList', 'list']);
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const normalized = normalizeOrderPayload(row);
      const existed = await prisma.order.findFirst({
        where: { OR: [{ orderCode: normalized.code }, { channelOrderId: normalized.orderId }] },
        select: { id: true },
      });
      await upsertNormalizedOrder(connection, normalized, userId);
      if (existed) updated += 1;
      else created += 1;
    } catch (error) {
      failed += 1;
      console.warn('[TikTok sync] order upsert failed:', error instanceof Error ? error.message : error);
    }
  }

  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return { synced: created + updated, created, updated, failed, lastSyncAt: new Date() };
};

export const syncProductsForConnection = async (connection: TikTokConnection, userId: string) => {
  const body = {
    ...parseJsonObjectEnv('ECOHUB_PRODUCT_SYNC_BODY_TEMPLATE'),
    page_size: Number.parseInt(process.env.TIKTOK_PRODUCT_SYNC_PAGE_SIZE || process.env.ECOHUB_PRODUCT_SYNC_PAGE_SIZE || '50', 10),
  };
  const payload = await requestTikTok(connection, 'POST', PRODUCT_SYNC_PATH, parseJsonObjectEnv('ECOHUB_PRODUCT_SYNC_QUERY_PARAMS'), body);
  const rows = collectRows(payload, ['products', 'product_list', 'productList', 'list']);
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const [index, row] of rows.entries()) {
    try {
      const product = normalizeProductPayload(row, index);
      const existed = await prisma.product.findUnique({
        where: { shopId_sku: { shopId: connection.shopId, sku: product.sku } },
        select: { id: true },
      });
      await prisma.product.upsert({
        where: { shopId_sku: { shopId: connection.shopId, sku: product.sku } },
        update: {
          name: product.name,
          description: product.description,
          price: product.price,
          stockQuantity: product.stockQuantity,
          barcode: product.barcode,
          images: product.images,
          status: product.stockQuantity > 0 ? 'active' : 'out_of_stock',
        },
        create: {
          shopId: connection.shopId,
          sku: product.sku,
          name: product.name,
          description: product.description,
          price: product.price,
          stockQuantity: product.stockQuantity,
          barcode: product.barcode,
          images: product.images,
          status: product.stockQuantity > 0 ? 'active' : 'out_of_stock',
          createdBy: userId,
        },
      });
      if (existed) updated += 1;
      else created += 1;
    } catch (error) {
      failed += 1;
      console.warn('[TikTok sync] product upsert failed:', error instanceof Error ? error.message : error);
    }
  }

  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return { synced: created + updated, created, updated, failed, lastSyncAt: new Date() };
};
