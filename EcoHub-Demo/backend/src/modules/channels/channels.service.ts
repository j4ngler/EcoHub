import jwt from 'jsonwebtoken';
import prisma from '../../config/database';
import { badRequest, notFound } from '../../middlewares/error.middleware';

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
  channelConnectionId: string | null;
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
  shopId: string;
  channelId: string;
  userId: string;
  issuedAt: string;
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
const TIKTOK_APP_TYPE = (
  process.env.TIKTOK_APP_TYPE ||
  process.env.ECOHUB_TIKTOK_APP_TYPE ||
  'Cross-border App'
).trim();

const maskSecret = (value?: string | null, keep = 6) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Chua co';
  return `****${raw.slice(-keep)}`;
};

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
  const merchantOrShopId =
    connection.shopCipher || connection.shopIdRemote || connection.merchantId || connection.channelShopId || null;
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

const getSellerSnapshot = (records: ChannelConnectionSnapshot[]) => {
  const noAlerts: Array<{ level: 'warning' | 'danger' | 'info'; text: string }> = [];
  const tiktok = records.find((item) => item.channelCode === 'tiktok') || records[0];

  if (!tiktok) {
    return {
      headline: 'Chua lien ket API',
      detail: 'Hay luu token hoac ket noi kenh ban de dong bo don hang va san pham.',
      badgeVariant: 'default' as const,
      helpUrl: 'https://partner.tiktokshop.com/',
      shopName: '-',
      merchantShort: '-',
      alerts: noAlerts,
    };
  }

  if (tiktok.apiStatus === 'ready') {
    return {
      headline: `Da lien ket ${tiktok.channelName}`,
      detail: 'Ket noi on dinh. Co the chay sync thu cong hoac scheduler dinh ky.',
      badgeVariant: 'success' as const,
      helpUrl: 'https://partner.tiktokshop.com/',
      shopName: tiktok.channelName,
      merchantShort: tiktok.merchantOrShopId ? maskSecret(tiktok.merchantOrShopId, 5) : '-',
      alerts: noAlerts,
    };
  }

  if (tiktok.apiStatus === 'partial') {
    return {
      headline: `${tiktok.channelName} chua day du`,
      detail: 'Dang co token nhung thieu mot so truong bat buoc de sync on dinh.',
      badgeVariant: 'warning' as const,
      helpUrl: 'https://partner.tiktokshop.com/',
      shopName: tiktok.channelName,
      merchantShort: tiktok.merchantOrShopId ? maskSecret(tiktok.merchantOrShopId, 5) : '-',
      alerts: [{ level: 'warning' as const, text: tiktok.detail }],
    };
  }

  return {
    headline: `Chua lien ket ${tiktok.channelName}`,
    detail: 'Chua co access token dung API. Hay ket noi TikTok de cap quyen.',
    badgeVariant: 'danger' as const,
    helpUrl: 'https://partner.tiktokshop.com/',
    shopName: tiktok.channelName,
    merchantShort: '-',
    alerts: [{ level: 'danger' as const, text: 'Kenh chua co access token / refresh token hop le.' }],
  };
};

const buildTikTokCallbackUrl = () => `${BACKEND_PUBLIC_URL}/api/channels/tiktok/callback`;

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
  const bodyRaw = method === 'GET' || !body ? '' : JSON.stringify(body);
  query.sign = buildTikTokSign(query, requestPath, bodyRaw);

  try {
    const url = new URL(`${TIKTOK_BASE_URL.replace(/\/+$/, '')}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value != null) url.searchParams.set(key, String(value));
    });

    const response = await fetch(url.toString(), {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': method === 'GET' ? 'application/json' : 'application/json',
        'x-tts-access-token': accessToken,
      },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
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

const extractTikTokShopMetadataFields = (payload: unknown) => {
  const result: Record<string, string> = {};
  if (!payload || typeof payload !== 'object') return result;

  const tokenLike = extractFirstString(payload, ['merchant_id', 'merchantId', 'shop_id', 'shopId', 'shop_cipher', 'shopCipher', 'cipher']);
  void tokenLike;

  const scan = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const merchantId = extractFirstString(obj, ['merchant_id', 'merchantId', 'seller_id', 'sellerId']);
    const shopId = extractFirstString(obj, ['shop_id', 'shopId']);
    const shopCipher = extractFirstString(obj, ['shop_cipher', 'shopCipher', 'cipher']);
    if (merchantId && !result.merchant_id) result.merchant_id = merchantId;
    if (shopId && !result.shop_id) result.shop_id = shopId;
    if (shopCipher && !result.shop_cipher) result.shop_cipher = shopCipher;
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        value.forEach(scan);
      } else if (value && typeof value === 'object') {
        scan(value);
      }
    }
  };

  scan(payload);
  return result;
};

const normalizeTikTokIdentity = (input?: {
  channelShopId?: string | null;
  merchantId?: string | null;
  shopIdRemote?: string | null;
  shopCipher?: string | null;
}) => {
  const merchantId = String(input?.merchantId || '').trim();
  const shopIdRemote = String(input?.shopIdRemote || '').trim();
  const shopCipher = String(input?.shopCipher || '').trim();
  const channelShopId = String(input?.channelShopId || '').trim();

  return {
    merchantId: merchantId || null,
    shopIdRemote: shopIdRemote || null,
    shopCipher: shopCipher || null,
    channelShopId: merchantId || shopIdRemote || shopCipher || channelShopId || null,
  };
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
      { method: 'GET', path: `/authorization/${version}/shops`, label: 'authorization_shops' },
    ];

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
  accessToken: string | null;
  refreshToken: string | null;
  channelShopId: string | null;
  merchantId?: string | null;
  shopIdRemote?: string | null;
  shopCipher?: string | null;
}) => {
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

  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
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

  return {
    accessToken,
    refreshToken,
    merchantId: identity.merchantId,
    shopIdRemote: identity.shopIdRemote,
    shopCipher: identity.shopCipher,
    identifier: identity.channelShopId,
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
      detail: 'Shop chưa ủy quyền TikTok Shop cho EcoHub.',
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
    where: { shopId },
    include: { channel: true },
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
    sellerSnapshot: getSellerSnapshot(records),
    apiStatusRecords: records,
  };
};

export const getAdminApiOverview = async (): Promise<AdminApiOverview> => {
  const [shops, tiktokChannel] = await Promise.all([
    prisma.shop.findMany({
      where: { status: 'active' },
      include: {
        owner: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.salesChannel.findFirst({
      where: { code: 'tiktok' },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const tiktokChannelId = tiktokChannel?.id || null;
  const [connections, ordersToday, ordersThisWeek, ordersThisMonth] = tiktokChannelId
    ? await Promise.all([
        prisma.shopChannelConnection.findMany({
          where: { channelId: tiktokChannelId },
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
            channelId: tiktokChannelId,
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
        prisma.order.count({
          where: {
            channelId: tiktokChannelId,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        prisma.order.count({
          where: {
            channelId: tiktokChannelId,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ])
    : [[], 0, 0, 0];

  const connectionByShopId = new Map(connections.map((connection) => [connection.shopId, connection]));
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

  const rows = shops.map((shop) => {
    const connection = connectionByShopId.get(shop.id) || null;
    const snapshot = connection ? toConnectionSnapshot(connection) : null;
    const tokenStatus = getConnectionTokenStatus(connection, snapshot);

    if (tokenStatus.tokenStatus === 'invalid') {
      issues.push({
        level: 'danger',
        scope: shop.name,
        message: tokenStatus.detail,
      });
    } else if (tokenStatus.tokenStatus === 'partial') {
      issues.push({
        level: 'warning',
        scope: shop.name,
        message: tokenStatus.detail,
      });
    }

    if (connection?.lastSyncAt && connection.lastSyncAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      issues.push({
        level: 'warning',
        scope: shop.name,
        message: 'Kết nối đã quá 24 giờ chưa đồng bộ. Cần kiểm tra scheduler hoặc token.',
      });
    }

    return {
      shopId: shop.id,
      shopName: shop.name,
      shopCode: shop.code,
      ownerName: shop.owner.fullName,
      ownerEmail: shop.owner.email,
      channelConnectionId: connection?.id || null,
      channelShopId: connection?.channelShopId || null,
      connectedAt: connection?.createdAt || null,
      lastSyncAt: connection?.lastSyncAt || null,
      tokenStatus: tokenStatus.tokenStatus,
      tokenStatusLabel: tokenStatus.tokenStatusLabel,
      apiStatusLabel: snapshot?.apiStatusLabel || 'Invalid',
      detail: tokenStatus.detail,
    } satisfies AdminShopDirectoryRow;
  });

  const activeConnections = rows.filter((row) => row.tokenStatus === 'active').length;
  const invalidConnections = rows.filter((row) => row.tokenStatus === 'invalid').length;
  const partiallyConfiguredConnections = rows.filter((row) => row.tokenStatus === 'partial').length;
  const totalManaged = rows.filter((row) => row.tokenStatus !== 'not_connected').length;
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

  const identity = normalizeTikTokIdentity({
    channelShopId: params.channelShopId,
    merchantId: params.merchantId,
    shopIdRemote: params.shopIdRemote,
    shopCipher: params.shopCipher,
  });

  return prisma.shopChannelConnection.upsert({
    where: {
      shopId_channelId: {
        shopId: params.shopId,
        channelId: params.channelId,
      },
    },
    update: {
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      channelShopId: identity.channelShopId,
      merchantId: identity.merchantId,
      shopIdRemote: identity.shopIdRemote,
      shopCipher: identity.shopCipher,
      tokenExpiresAt: params.tokenExpiresAt ?? undefined,
      status: 'connected',
      lastSyncAt: new Date(),
    },
    create: {
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
    if (accessToken) {
      metadataResponse = await fetchTikTokShopMetadata(accessToken);
      const fields = (metadataResponse as any).fields || {};
      merchantId = String(fields.merchant_id || merchantId || '').trim();
      remoteShopId = String(fields.shop_id || remoteShopId || '').trim();
      shopCipher = String(fields.shop_cipher || shopCipher || '').trim();
    }

    const identity = normalizeTikTokIdentity({
      channelShopId: merchantId || remoteShopId || null,
      merchantId,
      shopIdRemote: remoteShopId,
      shopCipher,
    });

    await connectChannel({
      channelId: statePayload.channelId,
      shopId: statePayload.shopId,
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
        shopId: statePayload.shopId,
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

export const disconnectChannel = async (channelId: string, shopId: string) => {
  const connection = await prisma.shopChannelConnection.findUnique({
    where: {
      shopId_channelId: {
        shopId,
        channelId,
      },
    },
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

export const testChannelApi = async (channelId: string, shopId: string) => {
  const connection = await prisma.shopChannelConnection.findUnique({
    where: {
      shopId_channelId: {
        shopId,
        channelId,
      },
    },
    include: { channel: true },
  });
  if (!connection) throw notFound('Khong tim thay ket noi API cho shop nay');

  let refreshed = null;
  if (connection.channel.code === 'tiktok') {
    refreshed = await enrichConnectionFromRemote(connection);
  }

  const latest = await prisma.shopChannelConnection.findUnique({
    where: { id: connection.id },
    include: { channel: true },
  });
  const snapshot = toConnectionSnapshot(latest || connection);
  return {
    ok: snapshot.apiStatus === 'ready' || Boolean(refreshed?.accessToken),
    channel: snapshot.channelName,
    code: snapshot.channelCode,
    apiStatus: snapshot.apiStatusLabel,
    detail: snapshot.detail,
    merchantOrShopId: snapshot.merchantOrShopId,
    checkedAt: new Date(),
    response: refreshed,
  };
};

export const getChannelDebugInfo = async (channelId: string, shopId: string): Promise<ChannelDebugInfo> => {
  const channel = await prisma.salesChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw notFound('Khong tim thay kenh ban hang');

  const connection = await prisma.shopChannelConnection.findUnique({
    where: {
      shopId_channelId: {
        shopId,
        channelId,
      },
    },
    include: { channel: true },
  });

  const oauthInfo =
    channel.code === 'tiktok' && shopId
      ? await getChannelOAuthInfo(channelId, undefined, shopId).catch(() => ({
          channelCode: channel.code,
          oauthConnectUrl: null,
          callbackUrl: buildTikTokCallbackUrl(),
          authMode: 'native-oauth' as const,
        }))
      : {
          channelCode: channel.code,
          oauthConnectUrl: null,
          callbackUrl: null,
          authMode: 'manual' as const,
        };

  const sellerSnapshot = connection ? getSellerSnapshot([toConnectionSnapshot(connection)]) : null;

  return {
    channelCode: channel.code,
    authMode: channel.code === 'tiktok' ? 'native-oauth' : 'manual',
    callbackUrl: channel.code === 'tiktok' ? buildTikTokCallbackUrl() : null,
    oauthConnectUrl: oauthInfo.oauthConnectUrl,
    serviceIdConfigured: Boolean(TIKTOK_SERVICE_ID),
    appKeyConfigured: Boolean(TIKTOK_APP_KEY),
    appSecretConfigured: Boolean(TIKTOK_APP_SECRET),
    tokenExchangeConfigured: Boolean(getTokenExchangeUrls().length),
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
  let accessToken = params.accessToken;
  let refreshToken = params.refreshToken;
  const exchange = await exchangeTikTokMerchantToken(params.merchantId, refreshToken || '');
  if (!(exchange as any)._error) {
    accessToken = extractFirstString(exchange, ['access_token', 'accessToken']) || accessToken;
    refreshToken = extractFirstString(exchange, ['refresh_token', 'refreshToken']) || refreshToken;
  }

  const metadata = accessToken ? await fetchTikTokShopMetadata(accessToken) : null;
  const fields = (metadata as any)?.fields || {};
  const identity = normalizeTikTokIdentity({
    channelShopId: params.merchantId,
    merchantId: String(fields.merchant_id || params.merchantId || '').trim(),
    shopIdRemote: String(fields.shop_id || '').trim(),
    shopCipher: String(fields.shop_cipher || '').trim(),
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
  const connection = await prisma.shopChannelConnection.findUnique({
    where: {
      shopId_channelId: {
        shopId,
        channelId,
      },
    },
    include: { channel: true },
  });

  if (!connection || connection.status !== 'connected') {
    throw badRequest('Kenh chua duoc ket noi');
  }

  void channelId;
  void shopId;
  void userId;
  throw badRequest(`Chưa hỗ trợ đồng bộ đơn hàng tự động cho kênh ${connection.channel.name}`);
};

export const syncProducts = async (channelId: string, shopId: string, _userId: string) => {
  const connection = await prisma.shopChannelConnection.findUnique({
    where: {
      shopId_channelId: {
        shopId,
        channelId,
      },
    },
    include: { channel: true },
  });

  if (!connection || connection.status !== 'connected') {
    throw badRequest('Kenh chua duoc ket noi');
  }

  await prisma.shopChannelConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return {
    channel: connection.channel.name,
    synced: 0,
    created: 0,
    updated: 0,
    failed: 0,
    lastSyncAt: new Date(),
  };
};
