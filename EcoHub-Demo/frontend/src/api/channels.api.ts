import api from './axios';

export interface SalesChannel {
  id: string;
  name: string;
  code: string;
  status: string;
  description?: string | null;
}

export interface ShopChannelConnection {
  id: string;
  shopId: string;
  channelId: string;
  status: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  channelShopId?: string | null;
  lastSyncAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  channel: SalesChannel;
}

export interface ChannelConnectionSnapshot {
  id: string;
  channelId: string;
  channelCode: string;
  channelName: string;
  status: string;
  merchantOrShopId?: string | null;
  accessTokenMasked: string;
  refreshTokenMasked: string;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasChannelShopId: boolean;
  apiStatus: 'invalid' | 'partial' | 'ready';
  apiStatusLabel: 'Invalid' | 'Partial' | 'Ready';
  detail: string;
  lastSyncAt?: string | Date | null;
  updatedAt?: string | Date | null;
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
  connectedAt: string | null;
  lastSyncAt: string | null;
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

export const channelsApi = {
  getChannels: async (): Promise<SalesChannel[]> => {
    const res = await api.get('/channels');
    return res.data.data;
  },

  getShopConnections: async (shopId: string): Promise<ShopChannelConnection[]> => {
    const res = await api.get(`/channels/shop/${shopId}/connections`);
    return res.data.data;
  },

  getShopOverview: async (shopId: string): Promise<ShopChannelOverview> => {
    const res = await api.get(`/channels/shop/${shopId}/overview`);
    return res.data.data;
  },

  getAdminOverview: async (): Promise<AdminApiOverview> => {
    const res = await api.get('/channels/admin/overview');
    return res.data.data;
  },

  getOAuthInfo: async (channelId: string, shopId?: string): Promise<ChannelOAuthInfo> => {
    const res = await api.get(`/channels/${channelId}/oauth-info`, { params: shopId ? { shopId } : undefined });
    return res.data.data;
  },

  getDebugInfo: async (channelId: string, shopId: string): Promise<ChannelDebugInfo> => {
    const res = await api.get(`/channels/${channelId}/debug-info`, { params: { shopId } });
    return res.data.data;
  },

  connectChannel: async (
    channelId: string,
    payload: {
      shopId: string;
      accessToken?: string;
      refreshToken?: string;
      channelShopId?: string;
    }
  ): Promise<ShopChannelConnection> => {
    const res = await api.post(`/channels/${channelId}/connect`, payload);
    return res.data.data;
  },

  disconnectChannel: async (channelId: string, shopId: string) => {
    const res = await api.delete(`/channels/${channelId}/disconnect`, { data: { shopId } });
    return res.data.data;
  },

  syncOrders: async (channelId: string, shopId: string) => {
    const res = await api.post(`/channels/${channelId}/sync-orders`, { shopId });
    return res.data.data;
  },

  syncProducts: async (channelId: string, shopId: string) => {
    const res = await api.post(`/channels/${channelId}/sync-products`, { shopId });
    return res.data.data;
  },

  testApi: async (channelId: string, shopId: string) => {
    const res = await api.post(`/channels/${channelId}/test-api`, { shopId });
    return res.data.data as {
      ok: boolean;
      channel: string;
      code: string;
      apiStatus: 'Invalid' | 'Partial' | 'Ready';
      detail: string;
      merchantOrShopId?: string | null;
      checkedAt: string;
      response?: unknown;
    };
  },

  applyMerchantToken: async (
    channelId: string,
    payload: { shopId: string; merchantId: string; accessToken?: string; refreshToken?: string }
  ) => {
    const res = await api.post(`/channels/${channelId}/merchant-token`, payload);
    return res.data.data;
  },
};
