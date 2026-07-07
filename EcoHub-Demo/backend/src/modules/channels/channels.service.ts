import jwt from 'jsonwebtoken';
import { createHmac } from 'crypto';
import { RoleName } from '@prisma/client';
import prisma from '../../config/database';
import { badRequest, forbidden, notFound } from '../../middlewares/error.middleware';
import { syncOrdersForConnection, syncProductsForConnection, syncReturnsForConnection } from './tiktok-sync.service';
import {
  syncShopeeOrdersForConnection,
  syncShopeeProductsForConnection,
  syncShopeeReturnsForConnection,
} from './shopee-sync.service';

type ConnectionHealth = 'invalid' | 'partial' | 'ready';

export interface ChannelConnectionSnapshot {
  id: string;
  channelId: string;
  channelCode: string;
  channelName: string;
  status: string;
  merchantOrShopId: string | null;
  merchantId: string | null;
  shopIdRemote: string | null;
  shopCipherMasked: string | null;
  accessTokenMasked: string;
  refreshTokenMasked: string;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasChannelShopId: boolean;
  hasMerchantId: boolean;
  hasShopIdRemote: boolean;
  hasShopCipher: boolean;
  apiStatus: ConnectionHealth;
  apiStatusLabel: 'Invalid' | 'Partial' | 'Ready';
  detail: string;
  lastSyncAt: Date | null;
  updatedAt: Date | null;
}

export interface ShopChannelOverview {
  shop: {
    id: string;
    name: string;
    code: string;
  };
  summary: {
    totalChannels: number;
    connectedChannels: number;
    readyChannels: number;
    needAttentionChannels: number;
  };
  sellerSnapshot: {
    headline: string;
    detail: string;
    badgeVariant: 'default' | 'success' | 'warning' | 'danger';
    helpUrl: string;
    shopName: string;
    merchantShort: string;
    alerts: Array<{ level: 'warning' | 'danger' | 'info'; text: string }>;
  };
  shopeeSnapshot: {
    headline: string;
    detail: string;
    badgeVariant: 'default' | 'success' | 'warning' | 'danger';
    helpUrl: string;
    shopName: string;
    merchantShort: string;
    alerts: Array<{ level: 'warning' | 'danger' | 'info'; text: string }>;
  };
  apiStatusRecords: ChannelConnectionSnapshot[];
}

export interface ChannelOAuthInfo {
  channelCode: string;
  oauthConnectUrl: string | null;
  callbackUrl: string | null;
  authMode: 'manual' | 'native-oauth';
}

export interface ChannelDebugInfo {
  channelCode: string;
  authMode: 'manual' | 'native-oauth';
  callbackUrl: string | null;
  oauthConnectUrl: string | null;
  serviceIdConfigured: boolean;
  appKeyConfigured: boolean;
  appSecretConfigured: boolean;
  tokenExchangeConfigured: boolean;
  selectedShopId: string | null;
  sellerSnapshot: ShopChannelOverview['sellerSnapshot'] | null;
  connection: ChannelConnectionSnapshot | null;
}

export interface AdminApiIssue {
  level: 'warning' | 'danger' | 'info';
  scope: string;
  message: string;
}

export interface AdminShopDirectoryRow {
  shopId: string;
  shopName: string;
  shopCode: string;
  ownerName: string;
  ownerEmail: string;
  channelConnectionId: string;
  channelId: string;
  channelCode: string;
  channelName: string;
  channelShopId: string | null;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  tokenStatus: 'active' | 'partial' | 'invalid' | 'not_connected';
  tokenStatusLabel: string;
  apiStatusLabel: string;
  detail: string;
}

export interface AdminApiOverview {
  appConfig: {
    serviceIdConfigured: boolean;
    appKeyConfigured: boolean;
    appSecretConfigured: boolean;
    appKeyMasked: string;
    appSecretMasked: string;
    serviceIdMasked: string;
    callbackUrl: string;
    authBaseUrl: string;
    appType: string;
  };
  summary: {
    totalShops: number;
    activeConnections: number;
    invalidConnections: number;
    partiallyConfiguredConnections: number;
    ordersToday: number;
    ordersThisWeek: number;
    ordersThisMonth: number;
    apiIssueCount: number;
  };
  shops: AdminShopDirectoryRow[];
  diagnostics: {
    autoRefreshEnabled: boolean;
    autoRefreshDetail: string;
    refreshUrlConfigured: boolean;
    webhookLoggingEnabled: boolean;
    apiIssueRateLabel: string;
    issues: AdminApiIssue[];
  };
}

interface ConnectChannelParams {
  channelId: string;
  shopId: string;
  accessToken?: string;
  refreshToken?: string;
  channelShopId?: string;
  merchantId?: string;
  shopIdRemote?: string;
  shopCipher?: string;
  tokenExpiresAt?: Date | null;
}

interface OAuthStatePayload {
  shopId?: string;
  channelId: string;
  userId: string;
  issuedAt: string;
}

interface TikTokIdentity {
  channelShopId: string | null;
  merchantId: string | null;
  shopIdRemote: string | null;
  shopCipher: string | null;
}

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const TIKTOK_SERVICE_ID =
  (process.env.TIKTOK_SERVICE_ID || process.env.ECOHUB_TIKTOK_SERVICE_ID || '').trim();
const TIKTOK_APP_KEY = (process.env.TIKTOK_APP_KEY || process.env.ECOHUB_TIKTOK_APP_KEY || '').trim();
const TIKTOK_APP_SECRET = (
  process.env.TIKTOK_APP_SECRET ||
  process.env.ECOHUB_TIKTOK_APP_SECRET ||
  ''
).trim();
const TIKTOK_AUTH_BASE_URL = (
  process.env.TIKTOK_AUTH_BASE_URL ||
  process.env.ECOHUB_TIKTOK_AUTH_BASE_URL ||
  'https://services.tiktokshop.com/open/authorize'
).trim();
const TIKTOK_TOKEN_EXCHANGE_URL = (
  process.env.TIKTOK_TOKEN_EXCHANGE_URL ||
  process.env.ECOHUB_TIKTOK_TOKEN_EXCHANGE_URL ||
  ''
).trim();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
const TIKTOK_BASE_URL = (
  process.env.TIKTOK_BASE_URL ||
  process.env.ECOHUB_TIKTOK_BASE_URL ||
  'https://open-api.tiktokglobalshop.com'
).trim();
const TIKTOK_TIMEOUT_SEC = Number.parseFloat(process.env.TIKTOK_TIMEOUT_SEC || process.env.ECOHUB_TIKTOK_TIMEOUT_SEC || '20');
const TIKTOK_REFRESH_URL = (
  process.env.TIKTOK_REFRESH_URL ||
  process.env.ECOHUB_TIKTOK_REFRESH_URL ||
  'https://auth.tiktok-shops.com/api/v2/token/refresh'
).trim();
const TIKTOK_AUTH_HEADER = (
  process.env.TIKTOK_AUTH_HEADER ||
  process.env.ECOHUB_TIKTOK_AUTH_HEADER ||
  'x-tts-access-token'
).trim() || 'x-tts-access-token';
const TIKTOK_AUTH_SCHEME = (
  process.env.TIKTOK_AUTH_SCHEME ||
  process.env.ECOHUB_TIKTOK_AUTH_SCHEME ||
  ''
).trim();
const TIKTOK_INCLUDE_ACCESS_TOKEN_QUERY = (
  process.env.TIKTOK_INCLUDE_ACCESS_TOKEN_QUERY ||
  process.env.ECOHUB_TIKTOK_INCLUDE_ACCESS_TOKEN_QUERY ||
  'false'
)
  .trim()
  .toLowerCase();
const TIKTOK_EXTRA_HEADERS = (
  process.env.TIKTOK_EXTRA_HEADERS ||
  process.env.ECOHUB_TIKTOK_EXTRA_HEADERS ||
  ''
).trim();
const TIKTOK_APP_TYPE = (
  process.env.TIKTOK_APP_TYPE ||
  process.env.ECOHUB_TIKTOK_APP_TYPE ||
  'Cross-border App'
).trim();

const SHOPEE_ENV = (process.env.SHOPEE_ENV || 'test').trim().toLowerCase();
const SHOPEE_PARTNER_ID = (
  (SHOPEE_ENV === 'live'
    ? process.env.SHOPEE_LIVE_PARTNER_ID || process.env.SHOPEE_PARTNER_ID
    : process.env.SHOPEE_PARTNER_ID) || ''
).trim();
const SHOPEE_PARTNER_KEY = (
  (SHOPEE_ENV === 'live'
    ? process.env.SHOPEE_LIVE_PARTNER_KEY || process.env.SHOPEE_PARTNER_KEY
    : process.env.SHOPEE_PARTNER_KEY) || ''
).trim();
const SHOPEE_API_BASE_URL = (
  (SHOPEE_ENV === 'live'
    ? process.env.SHOPEE_LIVE_API_BASE_URL
    : process.env.SHOPEE_TEST_API_BASE_URL) ||
  process.env.SHOPEE_API_BASE_URL ||
  (SHOPEE_ENV === 'live'
    ? 'https://partner.shopeemobile.com'
    : 'https://openplatform.sandbox.test-stable.shopee.sg')
).trim();
const SHOPEE_AUTH_BASE_URL = (
  (SHOPEE_ENV === 'live'
    ? process.env.SHOPEE_LIVE_AUTH_BASE_URL
    : process.env.SHOPEE_TEST_AUTH_BASE_URL) ||
  process.env.SHOPEE_AUTH_BASE_URL ||
  (SHOPEE_ENV === 'live'
    ? 'https://open.shopee.com/auth'
    : 'https://open.sandbox.test-stable.shopee.com/auth')
).trim();
const SHOPEE_REDIRECT_URL = (
  (SHOPEE_ENV === 'live'
    ? process.env.SHOPEE_LIVE_REDIRECT_URL
    : process.env.SHOPEE_TEST_REDIRECT_URL) ||
  process.env.SHOPEE_REDIRECT_URL ||
  `${BACKEND_PUBLIC_URL}/api/auth/shopee/callback`
).trim();

const assertShopeeEnvironmentConfig = () => {
  if (SHOPEE_ENV !== 'live') return;
  if (!SHOPEE_REDIRECT_URL.startsWith('https://')) {
    throw badRequest('Shopee live yêu cầu Redirect URL dùng HTTPS');
  }
  if (/sandbox|test-stable/i.test(`${SHOPEE_API_BASE_URL} ${SHOPEE_AUTH_BASE_URL}`)) {
    throw badRequest('Cấu hình Shopee live đang trỏ nhầm endpoint sandbox');
  }
};

const maskSecret = (value?: string | null, keep = 6) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Chua co';
  return `****${raw.slice(-keep)}`;
};
const isTikTokShopCipher = (value?: string | null) => String(value || '').trim().startsWith('ROW_');

const getConnectionHealth = (connection?: {
  accessToken?: string | null;
  refreshToken?: string | null;
  channelShopId?: string | null;
  merchantId?: string | null;
  shopIdRemote?: string | null;
  shopCipher?: string | null;
}) => {
  const hasAccessToken = Boolean(String(connection?.accessToken || '').trim());
  const hasRefreshToken = Boolean(String(connection?.refreshToken || '').trim());
  const hasMerchantId = Boolean(String(connection?.merchantId || '').trim());
  const hasShopIdRemote = Boolean(String(connection?.shopIdRemote || '').trim());
  const hasShopCipher = Boolean(String(connection?.shopCipher || '').trim());
  const hasChannelShopId =
    Boolean(String(connection?.channelShopId || '').trim()) || hasMerchantId || hasShopIdRemote || hasShopCipher;
  const hasStrongRemoteIdentity = hasShopCipher || hasShopIdRemote || hasMerchantId;

  if (!hasAccessToken && !hasRefreshToken) {
    return {
      apiStatus: 'invalid' as const,
      apiStatusLabel: 'Invalid' as const,
      detail: 'Chua co access token / refresh token.',
      hasAccessToken,
      hasRefreshToken,
      hasChannelShopId,
      hasMerchantId,
      hasShopIdRemote,
      hasShopCipher,
    };
  }

  if (hasAccessToken && hasRefreshToken && hasStrongRemoteIdentity) {
    return {
      apiStatus: 'ready' as const,
      apiStatusLabel: 'Ready' as const,
      detail: 'Ket noi day du, san sang sync API.',
      hasAccessToken,
      hasRefreshToken,
      hasChannelShopId,
      hasMerchantId,
      hasShopIdRemote,
      hasShopCipher,
    };
  }

  return {
    apiStatus: 'partial' as const,
    apiStatusLabel: 'Partial' as const,
    detail: hasAccessToken
      ? 'Da co access token nhung thieu merchant id, shop id, shop cipher hoac refresh token.'
      : 'Da luu mot phan thong tin xac thuc, can hoan thien token.',
    hasAccessToken,
    hasRefreshToken,
    hasChannelShopId,
    hasMerchantId,
    hasShopIdRemote,
    hasShopCipher,
  };
};

const toConnectionSnapshot = (connection: any): ChannelConnectionSnapshot => {
  const health = getConnectionHealth(connection);
  const channelShopId = isTikTokShopCipher(connection.channelShopId) ? null : connection.channelShopId;
  const merchantOrShopId =
    connection.merchantId ||
    connection.shopIdRemote ||
    channelShopId ||
    (connection.shopCipher ? maskSecret(connection.shopCipher, 6) : null);
  return {
    id: connection.id,
    channelId: connection.channelId,
    channelCode: connection.channel.code,
    channelName: connection.channel.name,
    status: connection.status,
    merchantOrShopId,
    merchantId: connection.merchantId || null,
    shopIdRemote: connection.shopIdRemote || null,
    shopCipherMasked: connection.shopCipher ? maskSecret(connection.shopCipher, 5) : null,
    accessTokenMasked: maskSecret(connection.accessToken),
    refreshTokenMasked: maskSecret(connection.refreshToken),
    hasAccessToken: health.hasAccessToken,
    hasRefreshToken: health.hasRefreshToken,
    hasChannelShopId: health.hasChannelShopId,
    hasMerchantId: health.hasMerchantId,
    hasShopIdRemote: health.hasShopIdRemote,
    hasShopCipher: health.hasShopCipher,
    apiStatus: health.apiStatus,
    apiStatusLabel: health.apiStatusLabel,
    detail: health.detail,
    lastSyncAt: connection.lastSyncAt ?? null,
    updatedAt: connection.updatedAt ?? null,
  };
};

const CHANNEL_HELP_URL: Record<string, string> = {
  tiktok: 'https://partner.tiktokshop.com/',
  shopee: 'https://open.shopee.com/',
};

const getSellerSnapshot = (records: ChannelConnectionSnapshot[], channelCode?: string) => {
  const noAlerts: Array<{ level: 'warning' | 'danger' | 'info'; text: string }> = [];
  const target = channelCode
    ? records.find((item) => item.channelCode === channelCode)
    : records.find((item) => item.channelCode === 'tiktok') || records[0];
  const helpUrl = CHANNEL_HELP_URL[channelCode || target?.channelCode || 'tiktok'] || CHANNEL_HELP_URL.tiktok;

  if (!target) {
    return {
      headline: 'Chua lien ket API',
      detail: 'Hay luu token hoac ket noi kenh ban de dong bo don hang va san pham.',
      badgeVariant: 'default' as const,
      helpUrl,
      shopName: '-',
      merchantShort: '-',
      alerts: noAlerts,
    };
  }

  if (target.apiStatus === 'ready') {
    return {
      headline: `Da lien ket ${target.channelName}`,
      detail: 'Ket noi on dinh. Co the chay sync thu cong hoac scheduler dinh ky.',
      badgeVariant: 'success' as const,
      helpUrl,
      shopName: target.channelName,
      merchantShort: target.merchantOrShopId ? maskSecret(target.merchantOrShopId, 5) : '-',
      alerts: noAlerts,
    };
  }

  if (target.apiStatus === 'partial') {
    return {
      headline: `${target.channelName} chua day du`,
      detail: 'Dang co token nhung thieu mot so truong bat buoc de sync on dinh.',
      badgeVariant: 'warning' as const,
      helpUrl,
      shopName: target.channelName,
      merchantShort: target.merchantOrShopId ? maskSecret(target.merchantOrShopId, 5) : '-',
      alerts: [{ level: 'warning' as const, text: target.detail }],
    };
  }

  return {
    headline: `Chua lien ket ${target.channelName}`,
    detail: `Chua co access token dung API. Hay ket noi ${target.channelName} de cap quyen.`,
    badgeVariant: 'danger' as const,
    helpUrl,
    shopName: target.channelName,
    merchantShort: '-',
    alerts: [{ level: 'danger' as const, text: 'Kenh chua co access token / refresh token hop le.' }],
  };
};

const buildTikTokCallbackUrl = () => `${BACKEND_PUBLIC_URL}/api/auth/tiktok/callback`;

// ============================================
// SHOPEE OAUTH (Shop Authorization flow)
// ============================================

const buildShopeeSign = (path: string, timestamp: number, extra = '') => {
  const baseString = `${SHOPEE_PARTNER_ID}${path}${timestamp}${extra}`;
  return createHmac('sha256', SHOPEE_PARTNER_KEY).update(baseString).digest('hex');
};

const buildShopeeAuthUrl = (state: string) => {
  assertShopeeEnvironmentConfig();
  if (!SHOPEE_PARTNER_ID) {
    throw badRequest('Chưa cấu hình Partner ID Shopee trong backend');
  }

  const url = new URL(SHOPEE_AUTH_BASE_URL);
  url.searchParams.set('partner_id', SHOPEE_PARTNER_ID);
  url.searchParams.set('auth_type', 'seller');
  url.searchParams.set('redirect_uri', SHOPEE_REDIRECT_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
};

type ShopeeAuthorizationIdentity =
  | { shopId: string; mainAccountId?: never }
  | { shopId?: never; mainAccountId: string };

const getShopeePublicRequestUrl = (path: string) => {
  assertShopeeEnvironmentConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const url = new URL(`${SHOPEE_API_BASE_URL}${path}`);
  url.searchParams.set('partner_id', SHOPEE_PARTNER_ID);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', buildShopeeSign(path, timestamp));
  return url;
};

const getShopeeShopRequestUrl = (path: string, accessToken: string, shopId: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const url = new URL(`${SHOPEE_API_BASE_URL}${path}`);
  url.searchParams.set('partner_id', SHOPEE_PARTNER_ID);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('shop_id', shopId);
  url.searchParams.set('sign', buildShopeeSign(path, timestamp, `${accessToken}${shopId}`));
  return url;
};

const parseShopeeResponse = async (response: Response, requestUrl: string) => {
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return { _error: `Shopee trả về dữ liệu không hợp lệ (HTTP ${response.status})`, _raw: text.slice(0, 500) };
  }
  if (!response.ok || data.error) {
    return {
      ...data,
      _error: String(data.message || data.error || `HTTP ${response.status}`),
      _raw: text.slice(0, 500),
      _url: requestUrl,
    };
  }
  return { ...data, _url: requestUrl };
};

const exchangeShopeeCode = async (code: string, identity: ShopeeAuthorizationIdentity) => {
  if (!SHOPEE_PARTNER_ID || !SHOPEE_PARTNER_KEY) {
    return { _error: 'Thiếu Partner ID hoặc Partner Key Shopee' };
  }

  const path = '/api/v2/auth/token/get';
  const url = getShopeePublicRequestUrl(path);

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        code,
        partner_id: Number(SHOPEE_PARTNER_ID),
        ...(identity.shopId ? { shop_id: Number(identity.shopId) } : {}),
        ...(identity.mainAccountId ? { main_account_id: Number(identity.mainAccountId) } : {}),
      }),
    });
    return await parseShopeeResponse(response, url.toString());
  } catch (error) {
    return { _error: error instanceof Error ? error.message : String(error), _url: url.toString() };
  }
};

const refreshShopeeAccessToken = async (
  refreshToken: string,
  identity: ShopeeAuthorizationIdentity
) => {
  if (!SHOPEE_PARTNER_ID || !SHOPEE_PARTNER_KEY) {
    return { _error: 'Thiếu Partner ID hoặc Partner Key Shopee' };
  }

  const path = '/api/v2/auth/access_token/get';
  const url = getShopeePublicRequestUrl(path);

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
        partner_id: Number(SHOPEE_PARTNER_ID),
        ...(identity.shopId ? { shop_id: Number(identity.shopId) } : {}),
        ...(identity.mainAccountId ? { main_account_id: Number(identity.mainAccountId) } : {}),
      }),
    });
    return await parseShopeeResponse(response, url.toString());
  } catch (error) {
    return { _error: error instanceof Error ? error.message : String(error), _url: url.toString() };
  }
};

const fetchShopeeShopMetadata = async (accessToken: string, shopeeShopId: string) => {
  const path = '/api/v2/shop/get_shop_info';
  const url = getShopeeShopRequestUrl(path, accessToken, shopeeShopId);
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return await parseShopeeResponse(response, url.toString());
  } catch (error) {
    return { _error: error instanceof Error ? error.message : String(error), _url: url.toString() };
  }
};

const refreshShopeeConnection = async (connection: {
  id: string;
  channelId: string;
  shopIdRemote: string | null;
  mainAccountId: string | null;
  refreshToken: string | null;
}) => {
  const refreshToken = String(connection.refreshToken || '').trim();
  const remoteShopId = String(connection.shopIdRemote || '').trim();
  const mainAccountId = String(connection.mainAccountId || '').trim();
  if (!refreshToken || (!remoteShopId && !mainAccountId)) {
    return { _error: 'Kết nối Shopee thiếu refresh token hoặc ID tài khoản' };
  }

  const identity: ShopeeAuthorizationIdentity = mainAccountId
    ? { mainAccountId }
    : { shopId: remoteShopId };
  const refreshed = await refreshShopeeAccessToken(refreshToken, identity);
  const accessToken = extractFirstString(refreshed, ['access_token']);
  const newRefreshToken = extractFirstString(refreshed, ['refresh_token']);
  const expiresInSec = extractFirstNumber(refreshed, ['expire_in']);

  if (!accessToken) {
    await prisma.shopChannelConnection.update({
      where: { id: connection.id },
      data: { status: 'error' },
    });
    return refreshed;
  }

  const updateData = {
    accessToken,
    refreshToken: newRefreshToken || refreshToken,
    tokenExpiresAt: expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null,
    status: 'connected' as const,
    lastSyncAt: new Date(),
  };

  if (mainAccountId) {
    await prisma.shopChannelConnection.updateMany({
      where: {
        channelId: connection.channelId,
        mainAccountId,
      },
      data: updateData,
    });
  } else {
    await prisma.shopChannelConnection.update({
      where: { id: connection.id },
      data: updateData,
    });
  }

  return refreshed;
};

export const refreshExpiringShopeeConnections = async () => {
  const refreshBefore = new Date(Date.now() + 30 * 60 * 1000);
  const connections = await prisma.shopChannelConnection.findMany({
    where: {
      channel: { code: 'shopee' },
      status: 'connected',
      refreshToken: { not: null },
      OR: [{ tokenExpiresAt: null }, { tokenExpiresAt: { lte: refreshBefore } }],
    },
    orderBy: { createdAt: 'asc' },
  });

  const processedAccounts = new Set<string>();
  let refreshed = 0;
  let failed = 0;
  for (const connection of connections) {
    const accountKey = connection.mainAccountId
      ? `main:${connection.mainAccountId}`
      : `shop:${connection.shopIdRemote || connection.id}`;
    if (processedAccounts.has(accountKey)) continue;
    processedAccounts.add(accountKey);

    const result = await refreshShopeeConnection(connection);
    if ((result as any)._error) failed += 1;
    else refreshed += 1;
  }
  return { checked: connections.length, refreshed, failed };
};

const getShopeeAutoShopCode = (shopeeShopId: string) => `SHOPEE_${shopeeShopId}`;

const ensureShopeeShopForShopId = async (params: {
  userId: string;
  shopeeShopId: string;
  remoteShopName?: string;
}) => {
  const shopeeChannel = await prisma.salesChannel.findUnique({
    where: { code: 'shopee' },
    select: { id: true },
  });
  if (shopeeChannel) {
    const existingConnection = await prisma.shopChannelConnection.findFirst({
      where: { channelId: shopeeChannel.id, shopIdRemote: params.shopeeShopId },
      select: { shopId: true },
    });
    if (existingConnection) return existingConnection.shopId;
  }

  const code = getShopeeAutoShopCode(params.shopeeShopId);
  const existing = await prisma.shop.findUnique({ where: { code }, select: { id: true } });
  if (existing?.id) return existing.id;

  const shop = await prisma.shop.create({
    data: {
      name: params.remoteShopName || `Shopee Shop ${params.shopeeShopId}`,
      code,
      ownerId: params.userId,
      status: 'active',
    },
    select: { id: true },
  });

  const adminRole = await prisma.role.findUnique({ where: { name: RoleName.admin }, select: { id: true } });
  if (adminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId_shopId: { userId: params.userId, roleId: adminRole.id, shopId: shop.id } },
      update: {},
      create: { userId: params.userId, roleId: adminRole.id, shopId: shop.id },
    });
  }

  return shop.id;
};

const signOAuthState = (payload: OAuthStatePayload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
};

const verifyOAuthState = (state: string): OAuthStatePayload => {
  const decoded = jwt.verify(state, JWT_SECRET) as OAuthStatePayload;
  if (!decoded?.shopId || !decoded?.channelId || !decoded?.userId) {
    throw badRequest('State OAuth khong hop le');
  }
  return decoded;
};

const getTokenExchangeUrls = () => {
  const urls = [TIKTOK_TOKEN_EXCHANGE_URL, 'https://auth.tiktok-shops.com/api/v2/token/get', 'https://auth.tiktok-p.com/api/v2/token/get']
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(urls));
};

const buildTikTokSign = (params: Record<string, unknown>, path: string, bodyRaw = '') => {
  const signParams = Object.keys(params)
    .filter((key) => key !== 'sign' && key !== 'access_token')
    .sort()
    .map((key) => `${key}${String(params[key] ?? '')}`)
    .join('');
  const payload = `${TIKTOK_APP_SECRET}${path}${signParams}${bodyRaw}${TIKTOK_APP_SECRET}`;
  return require('crypto').createHmac('sha256', TIKTOK_APP_SECRET).update(payload).digest('hex');
};

const shouldIncludeTikTokAccessTokenQuery = () =>
  ['1', 'true', 'yes', 'on'].includes(TIKTOK_INCLUDE_ACCESS_TOKEN_QUERY);

const parseTikTokExtraHeaders = () => {
  if (!TIKTOK_EXTRA_HEADERS) return {};
  try {
    const parsed = JSON.parse(TIKTOK_EXTRA_HEADERS);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
  } catch {
    return {};
  }
};

const requestTikTokMetadataEndpoint = async (
  method: 'GET' | 'POST',
  requestPath: string,
  accessToken: string,
  queryParams?: Record<string, unknown>,
  body?: Record<string, unknown>
) => {
  if (!TIKTOK_APP_KEY || !TIKTOK_APP_SECRET) {
    return { _error: 'Thiếu TIKTOK_APP_KEY hoặc TIKTOK_APP_SECRET', _url: `${TIKTOK_BASE_URL}${requestPath}` };
  }
  if (!accessToken) {
    return { _error: 'Thiếu access_token', _url: `${TIKTOK_BASE_URL}${requestPath}` };
  }

  const query: Record<string, unknown> = {
    ...(queryParams || {}),
    app_key: TIKTOK_APP_KEY,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  if (shouldIncludeTikTokAccessTokenQuery()) {
    query.access_token = accessToken;
  }
  const bodyRaw = method === 'GET' || !body ? '' : JSON.stringify(body, undefined, 0);
  query.sign = buildTikTokSign(query, requestPath, bodyRaw);

  try {
    const url = new URL(`${TIKTOK_BASE_URL.replace(/\/+$/, '')}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value != null) url.searchParams.set(key, String(value));
    });

    const headers: Record<string, string> = {
      Accept: 'application/json',
      [TIKTOK_AUTH_HEADER]: TIKTOK_AUTH_SCHEME ? `${TIKTOK_AUTH_SCHEME} ${accessToken}`.trim() : accessToken,
      ...parseTikTokExtraHeaders(),
    };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: method === 'GET' ? undefined : bodyRaw,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      return { _error: `HTTP ${response.status}`, _raw: text.slice(0, 500), _url: url.toString() };
    }
    if (typeof data !== 'object' || !data) {
      return { _error: 'Unexpected response type', _raw: String(data).slice(0, 500), _url: url.toString() };
    }
    return { ...(data as Record<string, unknown>), _url: url.toString() };
  } catch (error) {
    return {
      _error: error instanceof Error ? error.message : String(error),
      _url: `${TIKTOK_BASE_URL}${requestPath}`,
    };
  }
};

const extractDirectString = (input: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = input[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
};

const extractTikTokTokenLikeFields = (payload: unknown, depth = 0): Record<string, string> => {
  if (!payload || typeof payload !== 'object' || depth > 10) return {};
  const objectValue = payload as Record<string, unknown>;
  const result: Record<string, string> = {};
  const aliases: Array<[string, string[]]> = [
    ['access_token', ['access_token', 'accessToken', 'seller_access_token']],
    ['refresh_token', ['refresh_token', 'refreshToken']],
    ['shop_cipher', ['shop_cipher', 'shopCipher', 'cipher']],
    ['shop_id', ['shop_id', 'shopId']],
    ['merchant_id', ['merchant_id', 'merchantId', 'seller_id', 'sellerId']],
    ['shop_name', ['shop_name', 'shopName', 'seller_name', 'sellerName', 'display_name', 'displayName', 'name']],
  ];

  for (const [canonical, keys] of aliases) {
    const value = extractDirectString(objectValue, keys);
    if (value) result[canonical] = value;
  }

  for (const value of Object.values(objectValue)) {
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const item of value) {
          const nested = extractTikTokTokenLikeFields(item, depth + 1);
          for (const [key, nestedValue] of Object.entries(nested)) {
            if (!result[key] && nestedValue) result[key] = nestedValue;
          }
        }
      } else {
        const nested = extractTikTokTokenLikeFields(value, depth + 1);
        for (const [key, nestedValue] of Object.entries(nested)) {
          if (!result[key] && nestedValue) result[key] = nestedValue;
        }
      }
    }
  }

  return result;
};

const extractTikTokShopMetadataFields = (payload: unknown) => {
  const result: Record<string, string> = {};
  if (!payload || typeof payload !== 'object') return result;

  Object.entries(extractTikTokTokenLikeFields(payload)).forEach(([key, value]) => {
    if (value) result[key] = value;
  });

  const data = (payload as Record<string, unknown>).data;
  const candidates: Array<{ row: Record<string, unknown>; kind: 'shop' | 'merchant' }> = [];

  const pushRows = (rows: unknown, kind: 'shop' | 'merchant') => {
    if (!Array.isArray(rows)) return;
    rows.forEach((item) => {
      if (item && typeof item === 'object') candidates.push({ row: item as Record<string, unknown>, kind });
    });
  };

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const dataObj = data as Record<string, unknown>;
    ([
      ['shop', 'shop'],
      ['seller', 'shop'],
      ['authorized_shop', 'shop'],
      ['merchant', 'merchant'],
    ] as const).forEach(([key, kind]) => {
      const value = dataObj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        candidates.push({ row: value as Record<string, unknown>, kind });
      }
    });
    ([
      ['shops', 'shop'],
      ['shop_list', 'shop'],
      ['shop_infos', 'shop'],
      ['active_shops', 'shop'],
      ['authorized_shops', 'shop'],
      ['seller_shops', 'shop'],
      ['merchants', 'merchant'],
      ['merchant_list', 'merchant'],
      ['seller_list', 'merchant'],
    ] as const).forEach(([key, kind]) => pushRows(dataObj[key], kind));
  } else if (Array.isArray(data)) {
    pushRows(data, 'shop');
  }

  const firstFrom = (row: Record<string, unknown>, keys: string[]) => extractDirectString(row, keys);

  for (const { row, kind } of candidates) {
    if (kind === 'merchant') {
      if (!result.merchant_id) result.merchant_id = firstFrom(row, ['merchant_id', 'merchantId', 'seller_id', 'sellerId', 'code', 'id']);
      if (!result.shop_id) result.shop_id = firstFrom(row, ['shop_id', 'shopId']);
      if (!result.shop_cipher) result.shop_cipher = firstFrom(row, ['shop_cipher', 'shopCipher', 'cipher']);
      if (!result.shop_name) result.shop_name = firstFrom(row, ['shop_name', 'shopName', 'seller_name', 'sellerName', 'display_name', 'displayName', 'name']);
    } else {
      if (!result.shop_id) result.shop_id = firstFrom(row, ['shop_id', 'shopId', 'id']);
      if (!result.shop_cipher) result.shop_cipher = firstFrom(row, ['shop_cipher', 'shopCipher', 'cipher']);
      if (!result.merchant_id) result.merchant_id = firstFrom(row, ['merchant_id', 'merchantId', 'seller_id', 'sellerId', 'code']);
      if (!result.shop_name) result.shop_name = firstFrom(row, ['shop_name', 'shopName', 'seller_name', 'sellerName', 'display_name', 'displayName', 'name']);
    }
    if (result.merchant_id && result.shop_id && result.shop_cipher && result.shop_name) break;
  }

  return Object.fromEntries(Object.entries(result).filter(([, value]) => String(value || '').trim()));
};

const normalizeTikTokIdentity = (input?: {
  channelShopId?: string | null;
  merchantId?: string | null;
  shopIdRemote?: string | null;
  shopCipher?: string | null;
}): TikTokIdentity => {
  const merchantId = String(input?.merchantId || '').trim();
  const shopIdRemote = String(input?.shopIdRemote || '').trim();
  const rawChannelShopId = String(input?.channelShopId || '').trim();
  const shopCipher = String(input?.shopCipher || '').trim() || (isTikTokShopCipher(rawChannelShopId) ? rawChannelShopId : '');
  const channelShopId = isTikTokShopCipher(rawChannelShopId) ? '' : rawChannelShopId;

  return {
    merchantId: merchantId || null,
    shopIdRemote: shopIdRemote || null,
    shopCipher: shopCipher || null,
    channelShopId: merchantId || shopIdRemote || channelShopId || null,
  };
};

const getTikTokAutoShopBaseCode = (identity: TikTokIdentity) => {
  const source =
    identity.merchantId ||
    identity.shopIdRemote ||
    identity.channelShopId ||
    identity.shopCipher ||
    `SHOP_${Date.now()}`;
  const normalized = source
    .replace(/^ROW_/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return `TIKTOK_${(normalized || 'SHOP').slice(-18)}`;
};

const buildTikTokAutoShopCode = async (identity: TikTokIdentity) => {
  const base = getTikTokAutoShopBaseCode(identity);
  let code = base;
  let suffix = 1;

  while (await prisma.shop.findUnique({ where: { code }, select: { id: true } })) {
    suffix += 1;
    code = `${base}_${suffix}`;
  }

  return code;
};

const buildTikTokAutoShopName = (identity: TikTokIdentity, remoteShopName?: string | null) => {
  const name = String(remoteShopName || '').trim();
  if (name) return name;

  if (identity.merchantId) return `TikTok Shop ${identity.merchantId}`;
  if (identity.shopIdRemote) return `TikTok Shop ${identity.shopIdRemote}`;
  if (identity.channelShopId) return `TikTok Shop ${identity.channelShopId}`;
  if (identity.shopCipher) return `TikTok Shop ${maskSecret(identity.shopCipher, 6)}`;
  return 'TikTok Shop';
};

const findTikTokConnectionByIdentity = async (channelId: string, identity: TikTokIdentity) => {
  const or: Array<Record<string, string>> = [];
  if (identity.shopCipher) or.push({ shopCipher: identity.shopCipher });
  if (identity.shopIdRemote) or.push({ shopIdRemote: identity.shopIdRemote });
  if (identity.merchantId) or.push({ merchantId: identity.merchantId });
  if (identity.channelShopId) or.push({ channelShopId: identity.channelShopId });

  if (!or.length) return null;

  return prisma.shopChannelConnection.findFirst({
    where: {
      channelId,
      OR: or,
    },
    include: { shop: true, channel: true },
    orderBy: { createdAt: 'desc' },
  });
};

const ensureTikTokShopForIdentity = async (params: {
  channelId: string;
  userId: string;
  identity: TikTokIdentity;
  remoteShopName?: string | null;
}) => {
  const baseCode = getTikTokAutoShopBaseCode(params.identity);
  const existingAutoShop = await prisma.shop.findUnique({
    where: { code: baseCode },
    select: { id: true },
  });
  if (existingAutoShop?.id) {
    return existingAutoShop.id;
  }

  const existingConnection = await findTikTokConnectionByIdentity(params.channelId, params.identity);
  if (
    existingConnection?.shopId &&
    existingConnection.shop?.code !== 'ECOHUB_DEMO' &&
    existingConnection.shop?.name !== 'EcoHub Demo Shop'
  ) {
    return existingConnection.shopId;
  }

  const code = await buildTikTokAutoShopCode(params.identity);
  const shop = await prisma.shop.create({
    data: {
      name: buildTikTokAutoShopName(params.identity, params.remoteShopName),
      code,
      ownerId: params.userId,
      status: 'active',
    },
    select: { id: true },
  });

  const adminRole = await prisma.role.findUnique({
    where: { name: RoleName.admin },
    select: { id: true },
  });

  if (adminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId_shopId: {
          userId: params.userId,
          roleId: adminRole.id,
          shopId: shop.id,
        },
      },
      update: {},
      create: {
        userId: params.userId,
        roleId: adminRole.id,
        shopId: shop.id,
      },
    });
  }

  return shop.id;
};

const fetchTikTokShopMetadata = async (accessToken: string) => {
  const attempts: Array<Record<string, unknown>> = [];
  const mergedFields: Record<string, string> = {};
  const versions = Array.from(new Set([(process.env.TIKTOK_VERSION || process.env.ECOHUB_TIKTOK_VERSION || '').trim(), '202309', '202306'].filter(Boolean)));

  for (const version of versions) {
    const specs: Array<{ method: 'GET'; path: string; query?: Record<string, unknown>; label: string }> = [
      { method: 'GET', path: `/seller/${version}/shops`, label: 'shops' },
      { method: 'GET', path: `/seller/${version}/active_shops`, label: 'active_shops' },
      { method: 'GET', path: `/seller/global/${version}/merchants`, label: 'merchants' },
    ];
    if (mergedFields.shop_id) {
      specs.push({
        method: 'GET',
        path: `/authorization/${version}/shops`,
        query: { shop_id: mergedFields.shop_id },
        label: 'authorization_shops_by_id',
      });
    }
    specs.push({ method: 'GET', path: `/authorization/${version}/shops`, label: 'authorization_shops' });

    for (const spec of specs) {
      const response = await requestTikTokMetadataEndpoint(spec.method, spec.path, accessToken, spec.query);
      const fields = extractTikTokShopMetadataFields(response);
      for (const [key, value] of Object.entries(fields)) {
        if (value && !mergedFields[key]) mergedFields[key] = value;
      }
      attempts.push({
        label: spec.label,
        path: spec.path,
        fields,
        error: (response as any)._error || '',
        url: (response as any)._url || '',
      });
    }
  }

  return {
    ok: Boolean(Object.keys(mergedFields).length),
    fields: mergedFields,
    attempts,
    _error: Object.keys(mergedFields).length ? '' : 'Khong lay duoc metadata shop tu TikTok API',
  };
};

const refreshTikTokAccessToken = async (refreshToken: string) => {
  if (!TIKTOK_APP_KEY || !TIKTOK_APP_SECRET) {
    return { _error: 'Thiếu TIKTOK_APP_KEY hoặc TIKTOK_APP_SECRET', _url: TIKTOK_REFRESH_URL };
  }
  if (!refreshToken) {
    return { _error: 'Thiếu refresh_token để làm mới access_token', _url: TIKTOK_REFRESH_URL };
  }

  const params = new URLSearchParams({
    app_key: TIKTOK_APP_KEY,
    app_secret: TIKTOK_APP_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  try {
    const response = await fetch(`${TIKTOK_REFRESH_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      return { _error: `HTTP ${response.status}`, _raw: text.slice(0, 500), _url: TIKTOK_REFRESH_URL };
    }
    return {
      ...(data as Record<string, unknown>),
      _token_fields: {
        access_token: extractFirstString(data, ['access_token', 'accessToken']),
        refresh_token: extractFirstString(data, ['refresh_token', 'refreshToken']),
        merchant_id: extractFirstString(data, ['merchant_id', 'merchantId']),
        shop_id: extractFirstString(data, ['shop_id', 'shopId']),
        shop_cipher: extractFirstString(data, ['shop_cipher', 'shopCipher', 'cipher']),
      },
      _url: TIKTOK_REFRESH_URL,
    };
  } catch (error) {
    return { _error: error instanceof Error ? error.message : String(error), _url: TIKTOK_REFRESH_URL };
  }
};

const exchangeTikTokMerchantToken = async (merchantId: string, refreshToken = '') => {
  if (!TIKTOK_APP_KEY || !TIKTOK_APP_SECRET) {
    return { _error: 'Thiếu TIKTOK_APP_KEY hoặc TIKTOK_APP_SECRET' };
  }
  if (!merchantId) {
    return { _error: 'Thiếu merchant_id' };
  }

  const body = new URLSearchParams({
    client_key: TIKTOK_APP_KEY,
    client_secret: TIKTOK_APP_SECRET,
    merchant_id: merchantId,
    grant_type: refreshToken ? 'refresh_token' : 'access_token',
  });
  if (refreshToken) body.set('refresh_token', refreshToken);

  const url = 'https://open.tiktokapis.com/merchant/oauth/token/';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'x-tt-target-idc': 'alisg',
      },
      body: body.toString(),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      return { _error: `HTTP ${response.status}`, _raw: text.slice(0, 500), _url: url };
    }
    return { ...(data as Record<string, unknown>), _url: url };
  } catch (error) {
    return { _error: error instanceof Error ? error.message : String(error), _url: url };
  }
};

const enrichConnectionFromRemote = async (connection: {
  id: string;
  channelId: string;
  shopId: string;
  accessToken: string | null;
  refreshToken: string | null;
  channelShopId: string | null;
  merchantId?: string | null;
  shopIdRemote?: string | null;
  shopCipher?: string | null;
}, userId?: string) => {
  let accessToken = String(connection.accessToken || '').trim();
  let refreshToken = String(connection.refreshToken || '').trim();
  let merchantId = String(connection.merchantId || '').trim();
  let shopIdRemote = String(connection.shopIdRemote || '').trim();
  let shopCipher = String(connection.shopCipher || '').trim();
  let channelShopId = String(connection.channelShopId || '').trim();
  let tokenExpiresAt: Date | null = null;

  let refreshResponse: Record<string, unknown> | null = null;
  if (!accessToken && refreshToken) {
    refreshResponse = await refreshTikTokAccessToken(refreshToken);
    if (!(refreshResponse as any)._error) {
      accessToken = extractFirstString(refreshResponse, ['access_token', 'accessToken']) || accessToken;
      refreshToken = extractFirstString(refreshResponse, ['refresh_token', 'refreshToken']) || refreshToken;
      merchantId = extractFirstString(refreshResponse, ['merchant_id', 'merchantId']) || merchantId;
      shopIdRemote = extractFirstString(refreshResponse, ['shop_id', 'shopId']) || shopIdRemote;
      shopCipher = extractFirstString(refreshResponse, ['shop_cipher', 'shopCipher', 'cipher']) || shopCipher;
      const expiresInSec = extractFirstNumber(refreshResponse, ['expires_in', 'access_token_expire_in']);
      if (expiresInSec) tokenExpiresAt = new Date(Date.now() + expiresInSec * 1000);
    }
  }

  let metadataResponse: Record<string, unknown> | null = null;
  if (accessToken) {
    metadataResponse = await fetchTikTokShopMetadata(accessToken);
    const fields = (metadataResponse as any).fields || {};
    merchantId = String(fields.merchant_id || merchantId || '').trim();
    shopIdRemote = String(fields.shop_id || shopIdRemote || '').trim();
    shopCipher = String(fields.shop_cipher || shopCipher || '').trim();
  }

  const identity = normalizeTikTokIdentity({
    channelShopId,
    merchantId,
    shopIdRemote,
    shopCipher,
  });
  const targetShopId =
    userId && (identity.merchantId || identity.shopIdRemote || identity.channelShopId || identity.shopCipher)
      ? await ensureTikTokShopForIdentity({
          channelId: connection.channelId,
          userId,
          identity,
          remoteShopName: String((metadataResponse as any)?.fields?.shop_name || '').trim(),
        })
      : connection.shopId;

  const existingTargetConnection =
    targetShopId !== connection.shopId
      ? await prisma.shopChannelConnection.findFirst({
          where: {
            shopId: targetShopId,
            channelId: connection.channelId,
            status: 'connected',
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
      : null;

  if (existingTargetConnection?.id) {
    await prisma.shopChannelConnection.update({
      where: { id: existingTargetConnection.id },
      data: {
        accessToken: accessToken || null,
        refreshToken: refreshToken || null,
        channelShopId: identity.channelShopId,
        merchantId: identity.merchantId,
        shopIdRemote: identity.shopIdRemote,
        shopCipher: identity.shopCipher,
        tokenExpiresAt,
        status: accessToken ? 'connected' : 'error',
        lastSyncAt: accessToken ? new Date() : undefined,
      },
    });
    await prisma.shopChannelConnection.update({
      where: { id: connection.id },
      data: {
        status: 'disconnected',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
      },
    });
  } else {
    await prisma.shopChannelConnection.update({
      where: { id: connection.id },
      data: {
        shopId: targetShopId,
        accessToken: accessToken || null,
        refreshToken: refreshToken || null,
        channelShopId: identity.channelShopId,
        merchantId: identity.merchantId,
        shopIdRemote: identity.shopIdRemote,
        shopCipher: identity.shopCipher,
        tokenExpiresAt,
        status: accessToken ? 'connected' : 'error',
        lastSyncAt: accessToken ? new Date() : undefined,
      },
    });
  }

  return {
    accessToken,
    refreshToken,
    merchantId: identity.merchantId,
    shopIdRemote: identity.shopIdRemote,
    shopCipher: identity.shopCipher,
    identifier: identity.channelShopId,
    targetShopId,
    refreshResponse,
    metadataResponse,
  };
};

const extractFirstString = (input: unknown, keys: string[]): string => {
  if (!input || typeof input !== 'object') return '';
  const objectValue = input as Record<string, unknown>;

  for (const key of keys) {
    const direct = objectValue[key];
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }
  }

  for (const value of Object.values(objectValue)) {
    if (value && typeof value === 'object') {
      const nested = extractFirstString(value, keys);
      if (nested) return nested;
    }
  }

  return '';
};

const extractFirstNumber = (input: unknown, keys: string[]): number | null => {
  if (!input || typeof input !== 'object') return null;
  const objectValue = input as Record<string, unknown>;

  for (const key of keys) {
    const direct = objectValue[key];
    if (typeof direct === 'number' && Number.isFinite(direct)) {
      return direct;
    }
    if (typeof direct === 'string' && direct.trim() && !Number.isNaN(Number(direct))) {
      return Number(direct);
    }
  }

  for (const value of Object.values(objectValue)) {
    if (value && typeof value === 'object') {
      const nested = extractFirstNumber(value, keys);
      if (nested != null) return nested;
    }
  }

  return null;
};

const exchangeTikTokAuthorizedCode = async (code: string) => {
  if (!TIKTOK_APP_KEY || !TIKTOK_APP_SECRET) {
    throw badRequest('Chua cau hinh TIKTOK_APP_KEY / TIKTOK_APP_SECRET trong backend');
  }
  if (!TIKTOK_SERVICE_ID) {
    throw badRequest('Chua cau hinh TIKTOK_SERVICE_ID trong backend');
  }

  const payload = new URLSearchParams({
    app_key: TIKTOK_APP_KEY,
    app_secret: TIKTOK_APP_SECRET,
    auth_code: code,
    grant_type: 'authorized_code',
  });

  let lastError = 'Khong doi duoc auth code sang token';
  for (const url of getTokenExchangeUrls()) {
    try {
      const response = await fetch(`${url}?${payload.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        lastError = typeof data?.message === 'string' ? data.message : `HTTP ${response.status}`;
        continue;
      }

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw badRequest(`Doi token TikTok that bai: ${lastError}`);
};

const buildFrontendRedirect = (params: Record<string, string>) => {
  const search = new URLSearchParams(params).toString();
  return `${FRONTEND_URL}/channel-management${search ? `?${search}` : ''}`;
};

const getConnectionTokenStatus = (
  connection: {
    status: string;
    tokenExpiresAt?: Date | null;
  } | null,
  snapshot?: ChannelConnectionSnapshot | null
) => {
  if (!connection || !snapshot) {
    return {
      tokenStatus: 'not_connected' as const,
      tokenStatusLabel: 'Chưa kết nối',
      detail: 'Shop chưa ủy quyền kênh bán hàng cho EcoHub.',
    };
  }

  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() < Date.now()) {
    return {
      tokenStatus: 'invalid' as const,
      tokenStatusLabel: 'Hết hạn / Invalid',
      detail: 'Access token đã hết hạn. Cần kiểm tra và ủy quyền lại.',
    };
  }

  if (snapshot.apiStatus === 'ready' && connection.status === 'connected') {
    return {
      tokenStatus: 'active' as const,
      tokenStatusLabel: 'Đang hoạt động',
      detail: 'Token và metadata đã đầy đủ, có thể đồng bộ ổn định.',
    };
  }

  if (snapshot.apiStatus === 'partial') {
    return {
      tokenStatus: 'partial' as const,
      tokenStatusLabel: 'Thiếu cấu hình',
      detail: snapshot.detail,
    };
  }

  return {
    tokenStatus: 'invalid' as const,
    tokenStatusLabel: 'Lỗi / Invalid',
    detail: snapshot.detail,
  };
};

export const getChannels = async () => {
  return prisma.salesChannel.findMany({
    where: { status: 'active' },
    orderBy: { name: 'asc' },
  });
};

export const getChannelById = async (id: string) => {
  const channel = await prisma.salesChannel.findUnique({ where: { id } });
  if (!channel) throw notFound('Khong tim thay kenh ban hang');
  return channel;
};

export const getShopConnections = async (shopId: string) => {
  return prisma.shopChannelConnection.findMany({
    where: { shopId, status: { not: 'disconnected' } },
    include: { channel: true },
  });
};

export const getChannelConnections = async (channelId: string) => {
  return prisma.shopChannelConnection.findMany({
    where: { channelId, status: { not: 'disconnected' } },
    include: {
      channel: true,
      shop: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getShopChannelOverview = async (shopId: string): Promise<ShopChannelOverview> => {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, name: true, code: true },
  });
  if (!shop) throw notFound('Khong tim thay shop');

  const [channels, connections] = await Promise.all([
    prisma.salesChannel.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
    }),
    prisma.shopChannelConnection.findMany({
      where: { shopId },
      include: { channel: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const records = connections.map(toConnectionSnapshot);
  const readyChannels = records.filter((item) => item.apiStatus === 'ready').length;
  const connectedChannels = connections.filter((item) => item.status === 'connected').length;

  return {
    shop,
    summary: {
      totalChannels: channels.length,
      connectedChannels,
      readyChannels,
      needAttentionChannels: Math.max(0, connectedChannels - readyChannels),
    },
    sellerSnapshot: getSellerSnapshot(records, 'tiktok'),
    shopeeSnapshot: getSellerSnapshot(records, 'shopee'),
    apiStatusRecords: records,
  };
};

export const getAdminApiOverview = async (): Promise<AdminApiOverview> => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [shops, connections, ordersToday, ordersThisWeek, ordersThisMonth] = await Promise.all([
    prisma.shop.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shopChannelConnection.findMany({
      where: { status: { not: 'disconnected' } },
      include: {
        shop: {
          include: {
            owner: {
              select: {
                fullName: true,
                email: true,
              },
            },
          },
        },
        channel: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({
      where: {
        channelId: { not: null },
        createdAt: { gte: startOfToday },
      },
    }),
    prisma.order.count({
      where: {
        channelId: { not: null },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.order.count({
      where: {
        channelId: { not: null },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const issues: AdminApiIssue[] = [];

  if (!TIKTOK_SERVICE_ID) {
    issues.push({
      level: 'danger',
      scope: 'Ứng dụng gốc',
      message: 'Thiếu TIKTOK_SERVICE_ID trong cấu hình hệ thống.',
    });
  }
  if (!TIKTOK_APP_KEY || !TIKTOK_APP_SECRET) {
    issues.push({
      level: 'danger',
      scope: 'Ứng dụng gốc',
      message: 'Thiếu App Key hoặc App Secret, không thể hoàn tất OAuth TikTok Shop.',
    });
  }
  if (!TIKTOK_REFRESH_URL) {
    issues.push({
      level: 'warning',
      scope: 'Auto refresh token',
      message: 'Chưa cấu hình refresh URL. Hệ thống sẽ khó tự làm mới access token.',
    });
  }

  const rows = connections.map((connection) => {
    const { shop, channel } = connection;
    const snapshot = toConnectionSnapshot(connection);
    const tokenStatus = getConnectionTokenStatus(connection, snapshot);
    const issueScope = `${shop.name} / ${channel.name}`;

    if (tokenStatus.tokenStatus === 'invalid') {
      issues.push({
        level: 'danger',
        scope: issueScope,
        message: tokenStatus.detail,
      });
    } else if (tokenStatus.tokenStatus === 'partial') {
      issues.push({
        level: 'warning',
        scope: issueScope,
        message: tokenStatus.detail,
      });
    }

    return {
      shopId: shop.id,
      shopName: shop.name,
      shopCode: shop.code,
      ownerName: shop.owner.fullName,
      ownerEmail: shop.owner.email,
      channelConnectionId: connection.id,
      channelId: channel.id,
      channelCode: channel.code,
      channelName: channel.name,
      channelShopId: snapshot.merchantOrShopId || null,
      connectedAt: connection.createdAt,
      lastSyncAt: connection.lastSyncAt,
      tokenStatus: tokenStatus.tokenStatus,
      tokenStatusLabel: tokenStatus.tokenStatusLabel,
      apiStatusLabel: snapshot.apiStatusLabel,
      detail: tokenStatus.detail,
    } satisfies AdminShopDirectoryRow;
  });

  const activeConnections = rows.filter((row) => row.tokenStatus === 'active').length;
  const invalidConnections = rows.filter((row) => row.tokenStatus === 'invalid').length;
  const partiallyConfiguredConnections = rows.filter((row) => row.tokenStatus === 'partial').length;
  const totalManaged = rows.length;
  const apiIssueCount = issues.length;
  const apiIssueRateLabel = totalManaged
    ? `${Math.round((apiIssueCount / Math.max(totalManaged, 1)) * 100)}% shop đang có cảnh báo`
    : 'Chưa có shop nào kết nối API';

  return {
    appConfig: {
      serviceIdConfigured: Boolean(TIKTOK_SERVICE_ID),
      appKeyConfigured: Boolean(TIKTOK_APP_KEY),
      appSecretConfigured: Boolean(TIKTOK_APP_SECRET),
      appKeyMasked: maskSecret(TIKTOK_APP_KEY),
      appSecretMasked: maskSecret(TIKTOK_APP_SECRET),
      serviceIdMasked: maskSecret(TIKTOK_SERVICE_ID),
      callbackUrl: buildTikTokCallbackUrl(),
      authBaseUrl: TIKTOK_AUTH_BASE_URL,
      appType: TIKTOK_APP_TYPE,
    },
    summary: {
      totalShops: shops.length,
      activeConnections,
      invalidConnections,
      partiallyConfiguredConnections,
      ordersToday,
      ordersThisWeek,
      ordersThisMonth,
      apiIssueCount,
    },
    shops: rows,
    diagnostics: {
      autoRefreshEnabled: Boolean(TIKTOK_REFRESH_URL && TIKTOK_APP_KEY && TIKTOK_APP_SECRET),
      autoRefreshDetail: TIKTOK_REFRESH_URL
        ? 'Đã có refresh endpoint. Có thể làm mới token khi chạy job hoặc test API.'
        : 'Chưa có refresh endpoint để tự động làm mới token.',
      refreshUrlConfigured: Boolean(TIKTOK_REFRESH_URL),
      webhookLoggingEnabled: false,
      apiIssueRateLabel,
      issues,
    },
  };
};

export const connectChannel = async (params: ConnectChannelParams) => {
  const channel = await prisma.salesChannel.findUnique({ where: { id: params.channelId } });
  if (!channel) throw notFound('Khong tim thay kenh ban hang');

  let remoteIdentity: Partial<ConnectChannelParams> = {};
  const isTikTokManualTokenUpdate = channel.code === 'tiktok' && params.accessToken !== undefined;
  if (isTikTokManualTokenUpdate && params.accessToken) {
    const metadata = await fetchTikTokShopMetadata(params.accessToken);
    const fields = (metadata as any)?.fields || {};
    if (!(metadata as any)?._error) {
      remoteIdentity = {
        merchantId: String(fields.merchant_id || '').trim() || undefined,
        shopIdRemote: String(fields.shop_id || '').trim() || undefined,
        shopCipher: String(fields.shop_cipher || '').trim() || undefined,
      };
    }
  }

  const identity = normalizeTikTokIdentity({
    channelShopId: params.channelShopId,
    merchantId: remoteIdentity.merchantId || params.merchantId,
    shopIdRemote: remoteIdentity.shopIdRemote || params.shopIdRemote,
    shopCipher: remoteIdentity.shopCipher || params.shopCipher,
  });

  const existing = identity.shopIdRemote
    ? await prisma.shopChannelConnection.findFirst({
        where: { channelId: params.channelId, shopIdRemote: identity.shopIdRemote },
      })
    : await prisma.shopChannelConnection.findFirst({
        where: {
          shopId: params.shopId,
          channelId: params.channelId,
          ...(identity.channelShopId ? { channelShopId: identity.channelShopId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });

  const updateData = {
      accessToken: params.accessToken ?? undefined,
      refreshToken: params.refreshToken ?? undefined,
      channelShopId: identity.channelShopId ?? undefined,
      merchantId: identity.merchantId ?? (isTikTokManualTokenUpdate ? null : undefined),
      shopIdRemote: identity.shopIdRemote ?? (isTikTokManualTokenUpdate ? null : undefined),
      shopCipher: identity.shopCipher ?? (isTikTokManualTokenUpdate ? null : undefined),
      tokenExpiresAt: params.tokenExpiresAt ?? undefined,
      status: 'connected',
      lastSyncAt: new Date(),
  } as const;

  if (existing) {
    return prisma.shopChannelConnection.update({
      where: { id: existing.id },
      data: updateData,
      include: { channel: true },
    });
  }

  return prisma.shopChannelConnection.create({
    data: {
      shopId: params.shopId,
      channelId: params.channelId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      channelShopId: identity.channelShopId,
      merchantId: identity.merchantId,
      shopIdRemote: identity.shopIdRemote,
      shopCipher: identity.shopCipher,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
      status: 'connected',
    },
    include: { channel: true },
  });
};

export const getChannelOAuthInfo = async (
  channelId: string,
  userId?: string,
  shopId?: string | null
): Promise<ChannelOAuthInfo> => {
  const channel = await prisma.salesChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw notFound('Khong tim thay kenh ban hang');

  if (channel.code === 'shopee') {
    if (!userId) {
      throw badRequest('Cần đăng nhập để bắt đầu OAuth Shopee');
    }
    const state = signOAuthState({
      userId,
      ...(shopId ? { shopId } : {}),
      channelId,
      issuedAt: new Date().toISOString(),
    });
    return {
      channelCode: channel.code,
      oauthConnectUrl: buildShopeeAuthUrl(state),
      callbackUrl: SHOPEE_REDIRECT_URL,
      authMode: 'native-oauth',
    };
  }

  if (channel.code !== 'tiktok') {
    return {
      channelCode: channel.code,
      oauthConnectUrl: null,
      callbackUrl: null,
      authMode: 'manual',
    };
  }

  if (!TIKTOK_SERVICE_ID) {
    throw badRequest('Chua cau hinh TIKTOK_SERVICE_ID trong backend');
  }
  if (!userId || !shopId) {
    throw badRequest('Can co ngu canh user/shop de bat dau OAuth TikTok');
  }

  const state = signOAuthState({
    userId,
    shopId,
    channelId,
    issuedAt: new Date().toISOString(),
  });

  const url = new URL(TIKTOK_AUTH_BASE_URL);
  url.searchParams.set('service_id', TIKTOK_SERVICE_ID);
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', buildTikTokCallbackUrl());

  return {
    channelCode: channel.code,
    oauthConnectUrl: url.toString(),
    callbackUrl: buildTikTokCallbackUrl(),
    authMode: 'native-oauth',
  };
};

export const handleTikTokOAuthCallback = async (params: {
  state: string;
  code?: string;
  authCode?: string;
  merchantId?: string;
  shopId?: string;
}) => {
  let statePayload: OAuthStatePayload;
  try {
    statePayload = verifyOAuthState(params.state);
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TokenExpiredError' ? 'oauth_state_expired' : 'invalid_oauth_state';
    return {
      redirectUrl: buildFrontendRedirect({
        tiktok: 'error',
        reason,
      }),
    };
  }
  const authCode = String(params.code || params.authCode || '').trim();
  if (!authCode) {
    return {
      redirectUrl: buildFrontendRedirect({
        tiktok: 'error',
        reason: 'missing_code',
      }),
    };
  }

  const channel = await prisma.salesChannel.findUnique({
    where: { id: statePayload.channelId },
  });
  if (!channel || channel.code !== 'tiktok') {
    throw badRequest('OAuth TikTok khong tim thay channel hop le');
  }

  try {
    const exchange = await exchangeTikTokAuthorizedCode(authCode);
    const accessToken = extractFirstString(exchange, ['access_token', 'accessToken']);
    const refreshToken = extractFirstString(exchange, ['refresh_token', 'refreshToken']);
    let merchantId =
      String(params.merchantId || '').trim() || extractFirstString(exchange, ['merchant_id', 'merchantId']);
    let remoteShopId =
      String(params.shopId || '').trim() || extractFirstString(exchange, ['shop_id', 'shopId']);
    let shopCipher = extractFirstString(exchange, ['shop_cipher', 'shopCipher', 'cipher']);
    const expiresInSec = extractFirstNumber(exchange, ['expires_in', 'access_token_expire_in']);

    if (!accessToken && !refreshToken) {
      return {
        redirectUrl: buildFrontendRedirect({
          tiktok: 'error',
          reason: 'missing_token',
        }),
      };
    }

    let metadataResponse: Record<string, unknown> | null = null;
    let remoteShopName = '';
    if (accessToken) {
      metadataResponse = await fetchTikTokShopMetadata(accessToken);
      const fields = (metadataResponse as any).fields || {};
      merchantId = String(fields.merchant_id || merchantId || '').trim();
      remoteShopId = String(fields.shop_id || remoteShopId || '').trim();
      shopCipher = String(fields.shop_cipher || shopCipher || '').trim();
      remoteShopName = String(fields.shop_name || '').trim();
    }

    const identity = normalizeTikTokIdentity({
      channelShopId: merchantId || remoteShopId || null,
      merchantId,
      shopIdRemote: remoteShopId,
      shopCipher,
    });

    const targetShopId = await ensureTikTokShopForIdentity({
      channelId: statePayload.channelId,
      userId: statePayload.userId,
      identity,
      remoteShopName,
    });

    await connectChannel({
      channelId: statePayload.channelId,
      shopId: targetShopId,
      accessToken: accessToken || undefined,
      refreshToken: refreshToken || undefined,
      channelShopId: identity.channelShopId || undefined,
      merchantId: identity.merchantId || undefined,
      shopIdRemote: identity.shopIdRemote || undefined,
      shopCipher: identity.shopCipher || undefined,
      tokenExpiresAt: expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null,
    });

    return {
      redirectUrl: buildFrontendRedirect({
        tiktok: 'success',
        shopId: targetShopId,
      }),
    };
  } catch (error) {
    return {
      redirectUrl: buildFrontendRedirect({
        tiktok: 'error',
        reason: error instanceof Error ? error.message.slice(0, 80) : 'oauth_failed',
      }),
    };
  }
};

export const handleShopeeOAuthCallback = async (params: {
  code?: string;
  shopId?: string;
  mainAccountId?: string;
  state?: string;
}) => {
  if (!params.state) {
    return { redirectUrl: buildFrontendRedirect({ shopee: 'error', reason: 'missing_oauth_state' }) };
  }

  let statePayload: OAuthStatePayload;
  try {
    statePayload = verifyOAuthState(params.state);
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TokenExpiredError' ? 'oauth_state_expired' : 'invalid_oauth_state';
    return { redirectUrl: buildFrontendRedirect({ shopee: 'error', reason }) };
  }

  const code = String(params.code || '').trim();
  const shopeeShopId = String(params.shopId || '').trim();
  const mainAccountId = String(params.mainAccountId || '').trim();
  if (!code || (!shopeeShopId && !mainAccountId)) {
    return {
      redirectUrl: buildFrontendRedirect({
        shopee: 'error',
        reason: 'missing_code_or_authorized_account',
      }),
    };
  }

  const channel = await prisma.salesChannel.findFirst({ where: { code: 'shopee' } });
  if (!channel) {
    return { redirectUrl: buildFrontendRedirect({ shopee: 'error', reason: 'channel_not_seeded' }) };
  }
  if (statePayload.channelId !== channel.id || !statePayload.userId) {
    return { redirectUrl: buildFrontendRedirect({ shopee: 'error', reason: 'oauth_state_mismatch' }) };
  }

  const authorizationIdentity: ShopeeAuthorizationIdentity = shopeeShopId
    ? { shopId: shopeeShopId }
    : { mainAccountId };
  const exchange = await exchangeShopeeCode(code, authorizationIdentity);
  const accessToken = extractFirstString(exchange, ['access_token']);
  const refreshToken = extractFirstString(exchange, ['refresh_token']);
  const expiresInSec = extractFirstNumber(exchange, ['expire_in']);

  if (!accessToken) {
    return {
      redirectUrl: buildFrontendRedirect({
        shopee: 'error',
        reason: (exchange as any)?._error ? String((exchange as any)._error).slice(0, 80) : 'token_exchange_failed',
      }),
    };
  }

  const responseShopIds = Array.isArray((exchange as any).shop_id_list)
    ? (exchange as any).shop_id_list.map((value: unknown) => String(value || '').trim()).filter(Boolean)
    : [];
  const authorizedShopIds = [...new Set([shopeeShopId, ...responseShopIds].filter(Boolean))];
  if (authorizedShopIds.length === 0) {
    return {
      redirectUrl: buildFrontendRedirect({
        shopee: 'error',
        reason: 'token_response_missing_shop_ids',
      }),
    };
  }

  const internalShopIds: string[] = [];
  for (const remoteShopId of authorizedShopIds) {
    const metadata = await fetchShopeeShopMetadata(accessToken, remoteShopId);
    const remoteShopName = extractFirstString(metadata, ['shop_name', 'shopName']);
    const targetShopId = await ensureShopeeShopForShopId({
      userId: statePayload.userId,
      shopeeShopId: remoteShopId,
      remoteShopName,
    });
    internalShopIds.push(targetShopId);

    const existingConnection = await prisma.shopChannelConnection.findFirst({
      where: { channelId: channel.id, shopIdRemote: remoteShopId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const connectionData = {
        shopId: targetShopId,
        accessToken,
        refreshToken: refreshToken || null,
        mainAccountId: mainAccountId || null,
        shopIdRemote: remoteShopId,
        channelShopId: remoteShopId,
        tokenExpiresAt: expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null,
        status: 'connected',
        lastSyncAt: new Date(),
    } as const;

    if (existingConnection) {
      await prisma.shopChannelConnection.update({
        where: { id: existingConnection.id },
        data: connectionData,
      });
    } else {
      await prisma.shopChannelConnection.create({
        data: {
        shopId: targetShopId,
        channelId: channel.id,
        accessToken,
        refreshToken: refreshToken || null,
        mainAccountId: mainAccountId || null,
        shopIdRemote: remoteShopId,
        channelShopId: remoteShopId,
        tokenExpiresAt: expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null,
        status: 'connected',
        lastSyncAt: new Date(),
      },
      });
    }
  }

  return {
    redirectUrl: buildFrontendRedirect({
      shopee: 'success',
      shopId: internalShopIds[0],
      connected: String(internalShopIds.length),
    }),
  };
};

export const disconnectChannel = async (channelId: string, shopId: string) => {
  const connection = await prisma.shopChannelConnection.findFirst({
    where: { shopId, channelId, status: 'connected' },
    orderBy: { createdAt: 'desc' },
  });
  if (!connection) throw notFound('Khong tim thay ket noi');

  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
    data: {
      status: 'disconnected',
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    },
  });
};

export const deleteChannelConnection = async (channelId: string, shopId: string) => {
  const result = await prisma.shopChannelConnection.deleteMany({
    where: { shopId, channelId },
  });
  if (!result.count) throw notFound('Không tìm thấy kết nối API');

  return { deleted: true, deletedCount: result.count };
};

export const testChannelApi = async (channelId: string, shopId: string, userId?: string) => {
  const connection = await prisma.shopChannelConnection.findFirst({
    where: { shopId, channelId, status: 'connected' },
    orderBy: { createdAt: 'desc' },
    include: { channel: true },
  });
  if (!connection) throw notFound('Khong tim thay ket noi API cho shop nay');

  let refreshed: Record<string, unknown> | null = null;
  if (connection.channel.code === 'tiktok') {
    refreshed = await enrichConnectionFromRemote(connection, userId);
  } else if (connection.channel.code === 'shopee') {
    if (
      connection.refreshToken &&
      (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() <= Date.now() + 30 * 60 * 1000)
    ) {
      refreshed = await refreshShopeeConnection(connection);
    }

    const latestShopeeConnection = await prisma.shopChannelConnection.findUnique({
      where: { id: connection.id },
    });
    const accessToken = String(latestShopeeConnection?.accessToken || '').trim();
    const remoteShopId = String(latestShopeeConnection?.shopIdRemote || '').trim();
    if (accessToken && remoteShopId) {
      refreshed = await fetchShopeeShopMetadata(accessToken, remoteShopId);
      if (!(refreshed as any)._error) {
        await prisma.shopChannelConnection.update({
          where: { id: connection.id },
          data: { status: 'connected', lastSyncAt: new Date() },
        });
      }
    }
  }

  const latest =
    (refreshed as any)?.targetShopId
      ? await prisma.shopChannelConnection.findFirst({
          where: {
            shopId: (refreshed as any).targetShopId,
            channelId,
            status: 'connected',
          },
          orderBy: { createdAt: 'desc' },
          include: { channel: true },
        })
      : await prisma.shopChannelConnection.findUnique({
          where: { id: connection.id },
          include: { channel: true },
        });
  const snapshot = toConnectionSnapshot(latest || connection);
  return {
    ok:
      !(refreshed as any)?._error &&
      (snapshot.apiStatus === 'ready' || Boolean((refreshed as any)?.accessToken)),
    channel: snapshot.channelName,
    code: snapshot.channelCode,
    apiStatus: snapshot.apiStatusLabel,
    detail: snapshot.detail,
    merchantOrShopId: snapshot.merchantOrShopId,
    checkedAt: new Date(),
    response: refreshed,
  };
};

export const getChannelDebugInfo = async (
  channelId: string,
  shopId: string,
  userId?: string
): Promise<ChannelDebugInfo> => {
  const channel = await prisma.salesChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw notFound('Khong tim thay kenh ban hang');

  const connection = await prisma.shopChannelConnection.findFirst({
    where: { shopId, channelId, status: 'connected' },
    orderBy: { createdAt: 'desc' },
    include: { channel: true },
  });

  const isTikTok = channel.code === 'tiktok';
  const isShopee = channel.code === 'shopee';

  const oauthInfo =
    (isTikTok || isShopee) && shopId
      ? await getChannelOAuthInfo(channelId, userId, shopId).catch(() => ({
          channelCode: channel.code,
          oauthConnectUrl: null,
          callbackUrl: isTikTok ? buildTikTokCallbackUrl() : isShopee ? SHOPEE_REDIRECT_URL : null,
          authMode: 'native-oauth' as const,
        }))
      : {
          channelCode: channel.code,
          oauthConnectUrl: null,
          callbackUrl: null,
          authMode: 'manual' as const,
        };

  const sellerSnapshot = connection ? getSellerSnapshot([toConnectionSnapshot(connection)], channel.code) : null;

  return {
    channelCode: channel.code,
    authMode: isTikTok || isShopee ? 'native-oauth' : 'manual',
    callbackUrl: isTikTok ? buildTikTokCallbackUrl() : isShopee ? SHOPEE_REDIRECT_URL : null,
    oauthConnectUrl: oauthInfo.oauthConnectUrl,
    serviceIdConfigured: isTikTok ? Boolean(TIKTOK_SERVICE_ID) : isShopee ? Boolean(SHOPEE_PARTNER_ID) : false,
    appKeyConfigured: isTikTok ? Boolean(TIKTOK_APP_KEY) : isShopee ? Boolean(SHOPEE_PARTNER_ID) : false,
    appSecretConfigured: isTikTok ? Boolean(TIKTOK_APP_SECRET) : isShopee ? Boolean(SHOPEE_PARTNER_KEY) : false,
    tokenExchangeConfigured: isTikTok
      ? Boolean(getTokenExchangeUrls().length)
      : isShopee
        ? Boolean(SHOPEE_PARTNER_ID && SHOPEE_PARTNER_KEY)
        : false,
    selectedShopId: shopId || null,
    sellerSnapshot,
    connection: connection ? toConnectionSnapshot(connection) : null,
  };
};

export const applyMerchantTokenFallback = async (params: {
  channelId: string;
  shopId: string;
  merchantId: string;
  accessToken?: string;
  refreshToken?: string;
}) => {
  if (!params.merchantId.trim()) {
    throw badRequest('Merchant / Shop ID khong duoc de trong');
  }

  const existing = await prisma.shopChannelConnection.findFirst({
    where: { shopId: params.shopId, channelId: params.channelId, status: 'connected' },
    orderBy: { createdAt: 'desc' },
  });

  let accessToken = params.accessToken || existing?.accessToken || undefined;
  let refreshToken = params.refreshToken || existing?.refreshToken || undefined;
  const exchange = await exchangeTikTokMerchantToken(params.merchantId, refreshToken || '');
  if (!(exchange as any)._error) {
    accessToken = extractFirstString(exchange, ['access_token', 'accessToken']) || accessToken;
    refreshToken = extractFirstString(exchange, ['refresh_token', 'refreshToken']) || refreshToken;
  }

  if (!accessToken && !refreshToken) {
    throw badRequest('Fallback khong lay duoc token moi va ket noi hien tai chua co token de giu lai');
  }

  const metadata = accessToken ? await fetchTikTokShopMetadata(accessToken) : null;
  const fields = (metadata as any)?.fields || {};
  const identity = normalizeTikTokIdentity({
    channelShopId: params.merchantId,
    merchantId: String(fields.merchant_id || existing?.merchantId || params.merchantId || '').trim(),
    shopIdRemote: String(fields.shop_id || existing?.shopIdRemote || '').trim(),
    shopCipher: String(fields.shop_cipher || existing?.shopCipher || '').trim(),
  });

  const connection = await connectChannel({
    channelId: params.channelId,
    shopId: params.shopId,
    accessToken,
    refreshToken,
    channelShopId: identity.channelShopId || undefined,
    merchantId: identity.merchantId || undefined,
    shopIdRemote: identity.shopIdRemote || undefined,
    shopCipher: identity.shopCipher || undefined,
  });
  return {
    ...connection,
    exchange,
    metadata,
  };
};

export const syncOrders = async (channelId: string, shopId: string, userId: string) => {
  const connection = await prisma.shopChannelConnection.findFirst({
    where: { shopId, channelId, status: 'connected' },
    orderBy: { createdAt: 'desc' },
    include: { channel: true },
  });

  if (!connection || connection.status !== 'connected') {
    throw badRequest('Kenh chua duoc ket noi');
  }

  const result =
    connection.channel.code === 'tiktok'
      ? await syncOrdersForConnection(connection, userId)
      : connection.channel.code === 'shopee'
        ? await syncShopeeOrdersForConnection(connection, userId)
        : (() => {
            throw badRequest(`Chưa hỗ trợ đồng bộ đơn hàng cho kênh ${connection.channel.name}`);
          })();
  return {
    channel: connection.channel.name,
    ...result,
  };
};

export const syncReturns = async (channelId: string, shopId: string, userId: string) => {
  const connection = await prisma.shopChannelConnection.findFirst({
    where: { shopId, channelId, status: 'connected' },
    orderBy: { createdAt: 'desc' },
    include: { channel: true },
  });

  if (!connection || connection.status !== 'connected') {
    throw badRequest('Kenh chua duoc ket noi');
  }

  const result =
    connection.channel.code === 'tiktok'
      ? await syncReturnsForConnection(connection, userId)
      : connection.channel.code === 'shopee'
        ? await syncShopeeReturnsForConnection(connection, userId)
        : (() => {
            throw badRequest(`Chưa hỗ trợ đồng bộ hoàn hàng cho kênh ${connection.channel.name}`);
          })();
  return {
    channel: connection.channel.name,
    ...result,
  };
};

export const syncProducts = async (channelId: string, shopId: string, userId: string) => {
  const connection = await prisma.shopChannelConnection.findFirst({
    where: { shopId, channelId, status: 'connected' },
    orderBy: { createdAt: 'desc' },
    include: { channel: true },
  });

  if (!connection || connection.status !== 'connected') {
    throw badRequest('Kenh chua duoc ket noi');
  }

  const result =
    connection.channel.code === 'tiktok'
      ? await syncProductsForConnection(connection, userId)
      : connection.channel.code === 'shopee'
        ? await syncShopeeProductsForConnection(connection, userId)
        : (() => {
            throw badRequest(`Chưa hỗ trợ đồng bộ sản phẩm cho kênh ${connection.channel.name}`);
          })();

  return {
    channel: connection.channel.name,
    ...result,
  };
};

export const getEligibleUsersForAllocation = async (connectionId: string, currentUser?: { userId: string; roles: RoleName[]; shopId?: string | null }) => {
  const connection = await prisma.shopChannelConnection.findUnique({
    where: { id: connectionId }
  });
  if (!connection) throw notFound('Không tìm thấy kết nối API');

  if (currentUser) {
    const isGlobalApiManager =
      currentUser.roles.includes(RoleName.super_admin) || currentUser.roles.includes(RoleName.admin);
    if (!isGlobalApiManager) {
      const shop = await prisma.shop.findUnique({
        where: { id: connection.shopId }
      });
      const isOwner = shop?.ownerId === currentUser.userId;

      const hasRoleInShop = await prisma.userRole.findFirst({
        where: {
          userId: currentUser.userId,
          shopId: connection.shopId
        }
      });

      if (!isOwner && !hasRoleInShop) {
        throw forbidden('Bạn không có quyền xem danh sách tài khoản của cửa hàng này');
      }
    }
  }

  const users = await prisma.user.findMany({
    where: {
      status: 'active',
      userRoles: {
        some: {
          role: {
            name: {
              in: [RoleName.staff, RoleName.customer_service]
            }
          }
        }
      }
    },
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      userRoles: {
        where: {
          role: {
            name: {
              in: [RoleName.staff, RoleName.customer_service]
            }
          }
        },
        include: { role: true }
      }
    }
  });

  return users.map(u => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    roles: u.userRoles.map(ur => ur.role.name)
  }));
};

export const getConnectionAllocations = async (connectionId: string, currentUser?: { userId: string; roles: RoleName[]; shopId?: string | null }) => {
  const connection = await prisma.shopChannelConnection.findUnique({
    where: { id: connectionId }
  });
  if (!connection) throw notFound('Không tìm thấy kết nối API');

  if (currentUser) {
    const isGlobalApiManager =
      currentUser.roles.includes(RoleName.super_admin) || currentUser.roles.includes(RoleName.admin);
    if (!isGlobalApiManager) {
      const shop = await prisma.shop.findUnique({
        where: { id: connection.shopId }
      });
      const isOwner = shop?.ownerId === currentUser.userId;

      const hasRoleInShop = await prisma.userRole.findFirst({
        where: {
          userId: currentUser.userId,
          shopId: connection.shopId
        }
      });

      if (!isOwner && !hasRoleInShop) {
        throw forbidden('Bạn không có quyền xem phân bổ của cửa hàng này');
      }
    }
  }

  const allocations = await prisma.userApiAllocation.findMany({
    where: { connectionId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true
        }
      }
    }
  });

  return allocations.map(a => a.user);
};

export const saveConnectionAllocations = async (
  connectionId: string,
  userIds: string[],
  currentUser?: { userId: string; roles: RoleName[]; shopId?: string | null }
) => {
  const connection = await prisma.shopChannelConnection.findUnique({
    where: { id: connectionId }
  });
  if (!connection) throw notFound('Không tìm thấy kết nối API');

  if (currentUser) {
    const isGlobalApiManager =
      currentUser.roles.includes(RoleName.super_admin) || currentUser.roles.includes(RoleName.admin);
    if (!isGlobalApiManager) {
      const shop = await prisma.shop.findUnique({
        where: { id: connection.shopId }
      });
      const isOwner = shop?.ownerId === currentUser.userId;

      const hasRoleInShop = await prisma.userRole.findFirst({
        where: {
          userId: currentUser.userId,
          shopId: connection.shopId
        }
      });

      if (!isOwner && !hasRoleInShop) {
        throw forbidden('Bạn không có quyền phân bổ API của cửa hàng này');
      }
    }
  }

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  await prisma.$transaction(async (tx) => {
    // Delete existing allocations for this connection
    await tx.userApiAllocation.deleteMany({
      where: { connectionId }
    });

    if (uniqueUserIds.length > 0) {
      // Create new allocations
      await tx.userApiAllocation.createMany({
        data: uniqueUserIds.map(userId => ({
          userId,
          connectionId
        }))
      });

      const staffRole = await tx.role.findUnique({
        where: { name: RoleName.staff }
      });
      if (!staffRole) throw notFound('Khong tim thay role staff');

      const existingAssignableRoles = await tx.userRole.findMany({
        where: {
          userId: { in: uniqueUserIds },
          role: {
            name: {
              in: [RoleName.staff, RoleName.customer_service]
            }
          }
        },
        include: { role: true },
        orderBy: { assignedAt: 'desc' }
      });

      for (const userId of uniqueUserIds) {
        const existingRole = existingAssignableRoles.find((userRole) => userRole.userId === userId);
        const roleId = existingRole?.roleId || staffRole.id;

        await tx.userRole.upsert({
          where: {
            userId_roleId_shopId: {
              userId,
              roleId,
              shopId: connection.shopId
            }
          },
          update: {},
          create: {
            userId,
            roleId,
            shopId: connection.shopId,
            assignedBy: currentUser?.userId
          }
        });
      }
    }
  });

  return { success: true };
};
