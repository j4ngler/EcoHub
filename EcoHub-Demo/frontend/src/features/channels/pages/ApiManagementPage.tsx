import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  KeyRound,
  Link2,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Store,
  Trash2,
  Wifi,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AdminApiOverview,
  ChannelDebugInfo,
  ChannelOAuthInfo,
  ChannelConnectionSnapshot,
  SalesChannel,
  ShopChannelConnection,
  channelsApi,
} from '@/api/channels.api';
import { metaApi } from '@/api/meta.api';
import { getErrorMessage } from '@/api/axios';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';

type OperatorTab = 'status' | 'api-status' | 'shops' | 'debug' | 'guide';

const operatorTabLabelMap: Record<OperatorTab, string> = {
  status: 'Trạng thái',
  'api-status': 'API status',
  shops: 'Danh sách shop',
  debug: 'Debug',
  guide: 'Hướng dẫn',
};

type ShopeeTab = 'status' | 'debug' | 'guide';

const shopeeTabLabelMap: Record<ShopeeTab, string> = {
  status: 'Trạng thái',
  debug: 'Debug',
  guide: 'Hướng dẫn',
};

const apiStatusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  ready: 'success',
  partial: 'warning',
  invalid: 'danger',
};

const tokenStatusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  active: 'success',
  partial: 'warning',
  invalid: 'danger',
  not_connected: 'default',
};

const metricCardClass = 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm';

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return 'Chưa có';
  return new Date(value).toLocaleString('vi-VN');
};

const isTikTokShopCipher = (value?: string | null) => String(value || '').trim().startsWith('ROW_');

const getDisplayShopIdentifier = (connection?: ShopChannelConnection | null) => {
  if (!connection) return '';
  if (connection.merchantId) return connection.merchantId;
  if (connection.shopIdRemote) return connection.shopIdRemote;
  if (connection.channelShopId && !isTikTokShopCipher(connection.channelShopId)) return connection.channelShopId;
  return '';
};

function AdminApiDashboard({
  overview,
  onRefresh,
  onTest,
  onDelete,
  refreshing,
  testing,
  deleting,
}: {
  overview: AdminApiOverview;
  onRefresh: () => void;
  onTest: (channelId: string, shopId: string) => void;
  onDelete: (channelId: string, shopId: string) => void;
  refreshing: boolean;
  testing: boolean;
  deleting: boolean;
}) {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedShopName, setSelectedShopName] = useState<string>('');
  const [showAllocationModal, setShowAllocationModal] = useState(false);

  const appConfigStatus = [
    overview.appConfig.serviceIdConfigured,
    overview.appConfig.appKeyConfigured,
    overview.appConfig.appSecretConfigured,
  ].every(Boolean);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Quản lý API bán hàng</h1>
        <p className="text-sm text-gray-500">
          Theo dõi toàn bộ kết nối TikTok Shop và Shopee, kiểm tra sức khỏe token và xử lý sự cố API.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerCog className="h-5 w-5 text-emerald-600" />
              Cấu hình ứng dụng gốc
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={appConfigStatus ? 'success' : 'warning'}>
                {appConfigStatus ? 'Đã cấu hình ứng dụng gốc' : 'Thiếu cấu hình OAuth'}
              </Badge>
              <Badge variant="default">{overview.appConfig.appType}</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">Service ID</div>
                <div className="mt-2 font-mono">{overview.appConfig.serviceIdMasked}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">App Key</div>
                <div className="mt-2 font-mono">{overview.appConfig.appKeyMasked}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 md:col-span-2">
                <div className="font-semibold text-gray-900">App Secret</div>
                <div className="mt-2 font-mono">{overview.appConfig.appSecretMasked}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 md:col-span-2">
                <div className="font-semibold text-gray-900">Redirect URL (Callback)</div>
                <div className="mt-2 break-all font-mono">{overview.appConfig.callbackUrl}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 md:col-span-2">
                <div className="font-semibold text-gray-900">TikTok Authorize URL</div>
                <div className="mt-2 break-all font-mono">{overview.appConfig.authBaseUrl}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-slate-500" />
              Công cụ quản trị
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" loading={refreshing} onClick={onRefresh} className="w-full justify-center">
              <RefreshCw className="mr-2 h-4 w-4" />
              Làm mới toàn bộ trạng thái
            </Button>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <div className="font-semibold text-gray-900">Auto refresh token</div>
              <p className="mt-2">{overview.diagnostics.autoRefreshDetail}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={overview.diagnostics.autoRefreshEnabled ? 'success' : 'warning'}>
                  {overview.diagnostics.autoRefreshEnabled ? 'Có thể làm mới token' : 'Chưa sẵn sàng'}
                </Badge>
                <Badge variant={overview.diagnostics.refreshUrlConfigured ? 'success' : 'warning'}>
                  {overview.diagnostics.refreshUrlConfigured ? 'Có refresh endpoint' : 'Thiếu refresh endpoint'}
                </Badge>
                <Badge variant={overview.diagnostics.webhookLoggingEnabled ? 'success' : 'default'}>
                  {overview.diagnostics.webhookLoggingEnabled
                    ? 'Đang ghi nhận webhook log'
                    : 'Chưa có module webhook log chuyên dụng'}
                </Badge>
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Super admin không trực tiếp đi qua flow ủy quyền shop. Các thao tác ở đây dùng để quản lý và
              giám sát toàn bộ shop đã kết nối với hệ thống.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={metricCardClass}>
          <div className="text-sm font-medium text-gray-500">Tổng số shop</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{overview.summary.totalShops}</div>
        </div>
        <div className={metricCardClass}>
          <div className="text-sm font-medium text-gray-500">Shop đang hoạt động</div>
          <div className="mt-2 text-3xl font-bold text-emerald-600">{overview.summary.activeConnections}</div>
        </div>
        <div className={metricCardClass}>
          <div className="text-sm font-medium text-gray-500">Token lỗi / hết hạn</div>
          <div className="mt-2 text-3xl font-bold text-red-600">{overview.summary.invalidConnections}</div>
        </div>
        <div className={metricCardClass}>
          <div className="text-sm font-medium text-gray-500">Thiếu cấu hình</div>
          <div className="mt-2 text-3xl font-bold text-amber-600">
            {overview.summary.partiallyConfiguredConnections}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className={metricCardClass}>
          <div className="text-sm font-medium text-gray-500">Đơn đa kênh hôm nay</div>
          <div className="mt-2 text-3xl font-bold text-emerald-600">{overview.summary.ordersToday}</div>
        </div>
        <div className={metricCardClass}>
          <div className="text-sm font-medium text-gray-500">Đơn đa kênh 7 ngày</div>
          <div className="mt-2 text-3xl font-bold text-blue-600">{overview.summary.ordersThisWeek}</div>
        </div>
        <div className={metricCardClass}>
          <div className="text-sm font-medium text-gray-500">Đơn đa kênh 30 ngày</div>
          <div className="mt-2 text-3xl font-bold text-purple-600">{overview.summary.ordersThisMonth}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-slate-500" />
            Danh sách kết nối API cửa hàng
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Shop / Chủ sở hữu</th>
                <th className="px-3 py-2">Nền tảng</th>
                <th className="px-3 py-2">Shop ID kênh</th>
                <th className="px-3 py-2">Ngày kết nối</th>
                <th className="px-3 py-2">Trạng thái token</th>
                <th className="px-3 py-2">Lần sync gần nhất</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {overview.shops.map((shop) => (
                <tr key={shop.channelConnectionId} className="border-t align-top">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-900">{shop.shopName}</div>
                    <div className="text-xs text-gray-500">{shop.shopCode}</div>
                    <div className="mt-2 text-xs text-gray-600">
                      {shop.ownerName} - {shop.ownerEmail}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={shop.channelCode === 'shopee' ? 'warning' : 'default'}>
                      {shop.channelName}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{shop.channelShopId || '-'}</td>
                  <td className="px-3 py-3 text-gray-600">{formatDateTime(shop.connectedAt)}</td>
                  <td className="px-3 py-3">
                    <div className="space-y-2">
                      <Badge variant={tokenStatusVariantMap[shop.tokenStatus] || 'default'}>
                        {shop.tokenStatusLabel}
                      </Badge>
                      <div className="text-xs text-gray-600">{shop.detail}</div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-600">{formatDateTime(shop.lastSyncAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={shop.tokenStatus === 'not_connected'}
                        loading={testing}
                        onClick={() => onTest(shop.channelId, shop.shopId)}
                      >
                        <Wifi className="mr-2 h-4 w-4" />
                        Kiểm tra
                      </Button>
                      {shop.channelConnectionId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (shop.channelConnectionId) {
                              setSelectedConnectionId(shop.channelConnectionId);
                              setSelectedShopName(shop.shopName);
                              setShowAllocationModal(true);
                            }
                          }}
                        >
                          <Link2 className="mr-2 h-4 w-4" />
                          Phân bổ
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={shop.tokenStatus === 'not_connected'}
                        loading={deleting}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Xóa kết nối API ${shop.channelName} của ${shop.shopName}? Token và bản ghi kết nối sẽ bị xóa khỏi hệ thống.`
                            )
                          ) {
                            onDelete(shop.channelId, shop.shopId);
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Xóa kết nối API
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {showAllocationModal && selectedConnectionId && (
        <AllocationModal
          connectionId={selectedConnectionId}
          shopName={selectedShopName}
          onClose={() => {
            setShowAllocationModal(false);
            setSelectedConnectionId(null);
          }}
        />
      )}
    </div>
  );
}

function OperatorApiView({
  user,
  activeShopId,
  canEdit,
}: {
  user: ReturnType<typeof useAuthStore.getState>['user'];
  activeShopId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedShopId, setSelectedShopId] = useState(activeShopId);
  const [activeTab, setActiveTab] = useState<OperatorTab>('status');
  const [shopeeActiveTab, setShopeeActiveTab] = useState<ShopeeTab>('status');
  const [oauthInfoByChannel, setOauthInfoByChannel] = useState<Record<string, ChannelOAuthInfo>>({});
  const [formByChannel, setFormByChannel] = useState<
    Record<string, { accessToken: string; refreshToken: string; channelShopId: string }>
  >({});

  const effectiveShopId = selectedShopId || activeShopId;
  const getOauthInfoKey = (channelId: string, shopId: string) => `${shopId}:${channelId}`;

  const { data: shops = [] } = useQuery({
    queryKey: ['meta', 'shops'],
    queryFn: metaApi.getShops,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsApi.getChannels,
  });

  const { data: connections = [] } = useQuery({
    queryKey: ['channel-connections', effectiveShopId],
    queryFn: () => channelsApi.getShopConnections(effectiveShopId),
    enabled: canEdit && !!effectiveShopId,
  });

  const { data: overview, isFetching: overviewFetching, refetch: refetchOverview } = useQuery({
    queryKey: ['channel-overview', effectiveShopId],
    queryFn: () => channelsApi.getShopOverview(effectiveShopId),
    enabled: !!effectiveShopId,
  });

  const { data: debugInfo } = useQuery<ChannelDebugInfo>({
    queryKey: ['channel-debug-info', channels.find((channel) => channel.code === 'tiktok')?.id, effectiveShopId],
    queryFn: () => channelsApi.getDebugInfo(channels.find((channel) => channel.code === 'tiktok')!.id, effectiveShopId),
    enabled: canEdit && !!channels.find((channel) => channel.code === 'tiktok') && !!effectiveShopId,
  });

  const { data: shopeeDebugInfo } = useQuery<ChannelDebugInfo>({
    queryKey: ['channel-debug-info', channels.find((channel) => channel.code === 'shopee')?.id, effectiveShopId],
    queryFn: () => channelsApi.getDebugInfo(channels.find((channel) => channel.code === 'shopee')!.id, effectiveShopId),
    enabled: canEdit && !!channels.find((channel) => channel.code === 'shopee') && !!effectiveShopId,
  });

  useEffect(() => {
    const tiktokState = searchParams.get('tiktok');
    const shopeeState = searchParams.get('shopee');
    if (!tiktokState && !shopeeState) return;

    if (tiktokState === 'success') {
      toast.success('Ủy quyền TikTok thành công. Token đã được lưu vào hệ thống.');
    } else if (tiktokState === 'error') {
      toast.error(searchParams.get('reason') || 'Ủy quyền TikTok thất bại');
    }
    if (shopeeState === 'success') {
      toast.success(`Ủy quyền Shopee thành công (${searchParams.get('connected') || '1'} shop).`);
      const connectedShopId = searchParams.get('shopId');
      if (connectedShopId) setSelectedShopId(connectedShopId);
      void queryClient.invalidateQueries({ queryKey: ['meta', 'shops'] });
      void queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
    } else if (shopeeState === 'error') {
      toast.error(searchParams.get('reason') || 'Ủy quyền Shopee thất bại');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tiktok');
    nextParams.delete('shopee');
    nextParams.delete('connected');
    nextParams.delete('reason');
    nextParams.delete('shopId');
    setSearchParams(nextParams, { replace: true });
  }, [queryClient, searchParams, setSearchParams]);

  useEffect(() => {
    if (activeShopId && !selectedShopId) {
      setSelectedShopId(activeShopId);
    }
  }, [activeShopId, selectedShopId]);

  useEffect(() => {
    if (!selectedShopId && !activeShopId && shops.length > 0) {
      setSelectedShopId(shops[0].id);
    }
  }, [activeShopId, selectedShopId, shops]);

  useEffect(() => {
    const nextState: Record<string, { accessToken: string; refreshToken: string; channelShopId: string }> = {};
    channels.forEach((channel) => {
      const existing = connections.find((item) => item.channelId === channel.id);
      nextState[channel.id] = {
        accessToken: existing?.accessToken || '',
        refreshToken: existing?.refreshToken || '',
        channelShopId: getDisplayShopIdentifier(existing),
      };
    });
    setFormByChannel(nextState);
  }, [channels, connections]);

  useEffect(() => {
    const loadOauthInfo = async () => {
      const shopIdForRequest = effectiveShopId;
      setOauthInfoByChannel((current) => {
        const next = { ...current };
        channels
          .filter((channel) => ['tiktok', 'shopee'].includes(channel.code))
          .forEach((channel) => {
            delete next[getOauthInfoKey(channel.id, shopIdForRequest)];
          });
        return next;
      });

      const results = await Promise.all(
        channels
          .filter((channel) => ['tiktok', 'shopee'].includes(channel.code))
          .map(async (channel) => {
            try {
              const oauthInfo = await channelsApi.getOAuthInfo(channel.id, shopIdForRequest);
              return [channel.id, oauthInfo] as const;
            } catch (error) {
              toast.error(`Không lấy được URL uỷ quyền ${channel.name}: ${getErrorMessage(error)}`);
              return null;
            }
          })
      );

      const nextMap: Record<string, ChannelOAuthInfo> = {};
      results.forEach((entry) => {
        if (entry) nextMap[getOauthInfoKey(entry[0], shopIdForRequest)] = entry[1];
      });
      setOauthInfoByChannel((current) => ({ ...current, ...nextMap }));
    };

    if (canEdit && channels.length && effectiveShopId) {
      void loadOauthInfo();
    }
  }, [canEdit, channels, effectiveShopId]);

  const connectionByChannelId = useMemo(
    () => Object.fromEntries(connections.map((item) => [item.channelId, item])),
    [connections]
  );

  const tiktokChannel = useMemo(() => channels.find((channel) => channel.code === 'tiktok') || null, [channels]);
  const shopeeChannel = useMemo(() => channels.find((channel) => channel.code === 'shopee') || null, [channels]);
  const tiktokConnection = tiktokChannel
    ? (connectionByChannelId[tiktokChannel.id] as ShopChannelConnection | undefined)
    : undefined;
  const tiktokStatus = tiktokChannel
    ? overview?.apiStatusRecords?.find((item) => item.channelId === tiktokChannel.id)
    : undefined;
  const tiktokOauthInfo =
    tiktokChannel && effectiveShopId ? oauthInfoByChannel[getOauthInfoKey(tiktokChannel.id, effectiveShopId)] : undefined;
  const tiktokForm = tiktokChannel
    ? formByChannel[tiktokChannel.id] || { accessToken: '', refreshToken: '', channelShopId: '' }
    : { accessToken: '', refreshToken: '', channelShopId: '' };
  const shopeeConnection = shopeeChannel
    ? (connectionByChannelId[shopeeChannel.id] as ShopChannelConnection | undefined)
    : undefined;
  const shopeeStatus = shopeeChannel
    ? overview?.apiStatusRecords?.find((item) => item.channelId === shopeeChannel.id)
    : undefined;
  const shopeeOauthInfo =
    shopeeChannel && effectiveShopId
      ? oauthInfoByChannel[getOauthInfoKey(shopeeChannel.id, effectiveShopId)]
      : undefined;

  const refreshChannelData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] }),
      queryClient.invalidateQueries({ queryKey: ['channel-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['meta', 'shops'] }),
    ]);
    await refetchOverview();
  };

  const connectMutation = useMutation({
    mutationFn: ({
      channelId,
      payload,
    }: {
      channelId: string;
      payload: { shopId: string; accessToken?: string; refreshToken?: string; channelShopId?: string };
    }) => channelsApi.connectChannel(channelId, payload),
    onSuccess: async () => {
      toast.success('Đã lưu cấu hình kênh');
      await refreshChannelData();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: ({ channelId, shopId }: { channelId: string; shopId: string }) =>
      channelsApi.deleteChannelConnection(channelId, shopId),
    onSuccess: async () => {
      toast.success('Đã xóa kết nối API');
      await refreshChannelData();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const syncOrdersMutation = useMutation({
    mutationFn: ({ channelId, shopId }: { channelId: string; shopId: string }) =>
      channelsApi.syncOrders(channelId, shopId),
    onSuccess: async (data: any) => {
      toast.success(`Đã đồng bộ ${data.synced || 0} đơn hàng`);
      await refreshChannelData();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const syncProductsMutation = useMutation({
    mutationFn: ({ channelId, shopId }: { channelId: string; shopId: string }) =>
      channelsApi.syncProducts(channelId, shopId),
    onSuccess: async (data: any) => {
      toast.success(`Đã đồng bộ ${data.synced || 0} sản phẩm`);
      await refreshChannelData();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const testApiMutation = useMutation({
    mutationFn: ({ channelId, shopId }: { channelId: string; shopId: string }) =>
      channelsApi.testApi(channelId, shopId),
    onSuccess: (data) => {
      if (data.ok) toast.success(`${data.channel}: API sẵn sàng`);
      else toast.error(`${data.channel}: ${data.detail}`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const merchantTokenMutation = useMutation({
    mutationFn: ({
      channelId,
      payload,
    }: {
      channelId: string;
      payload: { shopId: string; merchantId: string; accessToken?: string; refreshToken?: string };
    }) => channelsApi.applyMerchantToken(channelId, payload),
    onSuccess: async () => {
      toast.success('Đã áp dụng merchant token fallback');
      await refreshChannelData();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const summary = overview?.summary || {
    totalChannels: channels.length,
    connectedChannels: 0,
    readyChannels: 0,
    needAttentionChannels: 0,
  };
  const sellerSnapshot = overview?.sellerSnapshot;
  const apiStatusRecords = overview?.apiStatusRecords || [];
  const isConnected = tiktokConnection?.status === 'connected' || tiktokStatus?.status === 'connected';
  const snapshotAlerts = sellerSnapshot?.alerts || [];

  const startNativeOAuth = () => {
    if (!tiktokOauthInfo?.oauthConnectUrl) {
      toast.error('OAuth URL chưa sẵn sàng. Kiểm tra lại cấu hình TikTok trên backend.');
      return;
    }
    window.location.href = tiktokOauthInfo.oauthConnectUrl;
  };

  const startShopeeOAuth = () => {
    if (!shopeeOauthInfo?.oauthConnectUrl) {
      toast.error('OAuth Shopee chưa sẵn sàng. Kiểm tra Partner ID và Redirect URL trên backend.');
      return;
    }
    window.location.href = shopeeOauthInfo.oauthConnectUrl;
  };

  const updateTikTokForm = (field: 'accessToken' | 'refreshToken' | 'channelShopId', value: string) => {
    if (!tiktokChannel) return;
    setFormByChannel((current) => ({
      ...current,
      [tiktokChannel.id]: { ...tiktokForm, [field]: value },
    }));
  };

  const renderTabButton = (tab: OperatorTab) => (
    <button
      key={tab}
      type="button"
      onClick={() => setActiveTab(tab)}
      className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
        activeTab === tab
          ? 'border-emerald-600 text-emerald-700'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {operatorTabLabelMap[tab]}
    </button>
  );

  const visibleTabs: OperatorTab[] = canEdit
    ? ['status', 'api-status', 'shops', 'debug', 'guide']
    : ['status', 'api-status', 'shops', 'guide'];

  const renderShopeeTabButton = (tab: ShopeeTab) => (
    <button
      key={tab}
      type="button"
      onClick={() => setShopeeActiveTab(tab)}
      className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
        shopeeActiveTab === tab
          ? 'border-emerald-600 text-emerald-700'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {shopeeTabLabelMap[tab]}
    </button>
  );

  const visibleShopeeTabs: ShopeeTab[] = canEdit ? ['status', 'debug', 'guide'] : ['status', 'guide'];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Kết nối API bán hàng</h1>
        <p className="text-sm text-gray-500">
          Theo dõi trạng thái kết nối TikTok Shop và Shopee, kiểm tra token và chủ động đồng bộ dữ liệu.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">TikTok Shop</div>
              <div className="mt-1 text-sm text-gray-500">
                {tiktokConnection ? getDisplayShopIdentifier(tiktokConnection) || 'Đã nhận diện shop' : 'Chưa có shop'}
              </div>
            </div>
            <Badge variant={isConnected ? 'success' : 'warning'}>
              {isConnected ? 'Đã kết nối' : 'Chưa kết nối'}
            </Badge>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">Shopee</div>
              <div className="mt-1 text-sm text-gray-500">
                {shopeeConnection?.shopIdRemote ? `Shop ID: ${shopeeConnection.shopIdRemote}` : 'Chưa có shop'}
              </div>
            </div>
            <Badge variant={shopeeConnection?.status === 'connected' ? 'success' : 'warning'}>
              {shopeeConnection?.status === 'connected' ? 'Đã kết nối' : 'Chưa kết nối'}
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[280px] flex-1">
              <Select
                label="Shop đang quản lý"
                value={effectiveShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                options={shops.map((shop) => ({
                  value: shop.id,
                  label: `${shop.name} (${shop.code})`,
                }))}
              />
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <div>
                <b>Kênh:</b> {tiktokChannel?.name || 'TikTok Shop'}
              </div>
              <div>
                <b>Trạng thái:</b> {tiktokStatus?.apiStatusLabel || 'Chưa có dữ liệu'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-emerald-600" />
              TikTok Shop
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={!tiktokChannel || !effectiveShopId || !canEdit || !tiktokOauthInfo?.oauthConnectUrl}
            className={!canEdit ? 'hidden' : undefined}
            onClick={startNativeOAuth}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Kết nối TikTok Shop
          </Button>

          <Button
            variant="outline"
            disabled={!tiktokChannel || !effectiveShopId || !canEdit}
            className={!canEdit ? 'hidden' : undefined}
            loading={testApiMutation.isPending}
            onClick={() => tiktokChannel && testApiMutation.mutate({ channelId: tiktokChannel.id, shopId: effectiveShopId })}
          >
            <Wifi className="mr-2 h-4 w-4" />
            Kiểm tra kết nối
          </Button>

          <Button
            variant="ghost"
            disabled={!tiktokOauthInfo?.oauthConnectUrl || !canEdit}
            className={!canEdit ? 'hidden' : undefined}
            onClick={startNativeOAuth}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Làm mới ủy quyền
          </Button>

          <Button variant="ghost" onClick={() => setActiveTab('guide')}>
            <BookOpen className="mr-2 h-4 w-4" />
            Hướng dẫn TikTok
          </Button>
        </CardContent>
      </Card>

      <div className="border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-1">
          {visibleTabs.map(renderTabButton)}
        </div>
      </div>

      {activeTab === 'status' ? (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-emerald-600" />
                Kết nối TikTok
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Badge variant={isConnected ? 'success' : 'warning'}>
                {isConnected ? 'Đã liên kết' : 'Chưa liên kết'}
              </Badge>
              <p className="text-sm text-gray-600">
                {sellerSnapshot?.detail || 'Trạng thái kết nối và hoạt động kênh của shop hiện tại sẽ hiển thị tại đây.'}
              </p>
              {snapshotAlerts.length ? (
                <div className="space-y-2">
                  {snapshotAlerts.map((alert, index) => (
                    <div
                      key={`${alert.level}-${index}`}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        alert.level === 'danger'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : alert.level === 'warning'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-blue-200 bg-blue-50 text-blue-700'
                      }`}
                    >
                      {alert.text}
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5 text-slate-500" />
                  Cửa hàng
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-700">
                <div>
                  <span className="font-semibold">Tên hiển thị:</span>{' '}
                  {sellerSnapshot?.shopName || overview?.shop?.name || 'Chưa xác định'}
                </div>
                <div>
                  <span className="font-semibold">Shop ID:</span>{' '}
                  {tiktokStatus?.merchantOrShopId || tiktokForm.channelShopId || '-'}
                </div>
                <div>
                  <span className="font-semibold">Mã merchant:</span> {sellerSnapshot?.merchantShort || '-'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Trạng thái phiên kết nối</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  <div className={metricCardClass}>
                    <div className="text-3xl font-bold text-emerald-600">{summary.connectedChannels}</div>
                    <div className="mt-1 text-sm text-gray-500">Kênh đã kết nối</div>
                  </div>
                  <div className={metricCardClass}>
                    <div className="text-3xl font-bold text-blue-600">{summary.readyChannels}</div>
                    <div className="mt-1 text-sm text-gray-500">Kênh sẵn sàng</div>
                  </div>
                  <div className={metricCardClass}>
                    <div className="text-3xl font-bold text-amber-600">{summary.needAttentionChannels}</div>
                    <div className="mt-1 text-sm text-gray-500">Cần chú ý</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {activeTab === 'api-status' ? (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>API status</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Kênh</th>
                    <th className="px-3 py-2">Merchant / Shop ID</th>
                    {canEdit ? <th className="px-3 py-2">Access</th> : null}
                    {canEdit ? <th className="px-3 py-2">Refresh</th> : null}
                    <th className="px-3 py-2">API status</th>
                    <th className="px-3 py-2">Last sync</th>
                  </tr>
                </thead>
                <tbody>
                  {apiStatusRecords.map((record: ChannelConnectionSnapshot) => (
                    <tr key={record.id} className="border-t">
                      <td className="px-3 py-2 font-medium text-gray-900">{record.channelName}</td>
                      <td className="px-3 py-2 text-gray-600">{record.merchantOrShopId || '-'}</td>
                      {canEdit ? <td className="px-3 py-2 font-mono text-xs text-gray-600">{record.accessTokenMasked}</td> : null}
                      {canEdit ? <td className="px-3 py-2 font-mono text-xs text-gray-600">{record.refreshTokenMasked}</td> : null}
                      <td className="px-3 py-2">
                        <Badge variant={apiStatusVariantMap[record.apiStatus] || 'default'}>{record.apiStatusLabel}</Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{formatDateTime(record.lastSyncAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {canEdit && tiktokChannel ? (
            <Card>
              <CardHeader>
                <CardTitle>Cấu hình TikTok</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Merchant / Shop ID"
                    value={tiktokForm.channelShopId}
                    disabled={!canEdit}
                    onChange={(e) => updateTikTokForm('channelShopId', e.target.value)}
                  />
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    <div>
                      <b>Code:</b> {tiktokChannel.code}
                    </div>
                    <div>
                      <b>Access:</b> {tiktokStatus?.accessTokenMasked || 'Chưa có'}
                    </div>
                    <div>
                      <b>Refresh:</b> {tiktokStatus?.refreshTokenMasked || 'Chưa có'}
                    </div>
                    <div>
                      <b>Shop Cipher:</b> {tiktokStatus?.shopCipherMasked || 'Chưa có'}
                    </div>
                  </div>
                </div>

                <Input
                  label="Access Token"
                  value={tiktokForm.accessToken}
                  disabled={!canEdit}
                  onChange={(e) => updateTikTokForm('accessToken', e.target.value)}
                />
                <Input
                  label="Refresh Token"
                  value={tiktokForm.refreshToken}
                  disabled={!canEdit}
                  onChange={(e) => updateTikTokForm('refreshToken', e.target.value)}
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    disabled={!effectiveShopId || !canEdit}
                    loading={connectMutation.isPending}
                    onClick={() =>
                      connectMutation.mutate({
                        channelId: tiktokChannel.id,
                        payload: {
                          shopId: effectiveShopId,
                          accessToken: tiktokForm.accessToken || undefined,
                          refreshToken: tiktokForm.refreshToken || undefined,
                          channelShopId: tiktokForm.channelShopId || undefined,
                        },
                      })
                    }
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Lưu token thủ công
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!effectiveShopId || !canEdit || !tiktokForm.channelShopId}
                    loading={merchantTokenMutation.isPending}
                    onClick={() =>
                      merchantTokenMutation.mutate({
                        channelId: tiktokChannel.id,
                        payload: {
                          shopId: effectiveShopId,
                          merchantId: tiktokForm.channelShopId,
                          accessToken: tiktokForm.accessToken || undefined,
                          refreshToken: tiktokForm.refreshToken || undefined,
                        },
                      })
                    }
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    Lưu merchant token fallback
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'shops' ? (
        <Card>
          <CardHeader>
            <CardTitle>Danh sách shop ủy quyền</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {apiStatusRecords.map((record) => (
                <div key={record.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{record.channelName}</div>
                      <div className="text-sm text-gray-500">{record.merchantOrShopId || 'Chưa có shop ID'}</div>
                    </div>
                    <Badge variant={apiStatusVariantMap[record.apiStatus] || 'default'}>{record.apiStatusLabel}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">{record.detail}</p>
                  <div className="mt-4 text-xs text-gray-500">Cập nhật: {formatDateTime(record.updatedAt)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'debug' ? (
        <Card>
          <CardHeader>
            <CardTitle>Debug TikTok OAuth</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <div>
              <b>Auth mode:</b> {debugInfo?.authMode || '-'}
            </div>
            <div>
              <b>Callback URL:</b> {debugInfo?.callbackUrl || '-'}
            </div>
            <div>
              <b>Connect URL:</b> {debugInfo?.oauthConnectUrl || '-'}
            </div>
            <div>
              <b>Service ID:</b> {debugInfo?.serviceIdConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
            </div>
            <div>
              <b>App Key:</b> {debugInfo?.appKeyConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
            </div>
            <div>
              <b>App Secret:</b> {debugInfo?.appSecretConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
            </div>
            <div>
              <b>Token exchange:</b> {debugInfo?.tokenExchangeConfigured ? 'Sẵn sàng' : 'Chưa cấu hình'}
            </div>
            <div>
              <b>Kết nối hiện tại:</b> {debugInfo?.connection?.apiStatusLabel || 'Chưa có'}
            </div>
            <div>
              <b>Shop đang debug:</b> {debugInfo?.selectedShopId || '-'}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'guide' ? (
        <Card>
          <CardHeader>
            <CardTitle>Hướng dẫn TikTok</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <p>1. Chọn đúng shop bạn đang vận hành.</p>
            <p>2. Bấm “Kết nối TikTok Shop” để đi qua trang ủy quyền OAuth của TikTok.</p>
            <p>3. Sau khi quay lại trang, bấm “Kiểm tra kết nối” để xác nhận access token và merchant/shop ID.</p>
            <p>4. Chỉ dùng “Lưu token thủ công” hoặc “merchant token fallback” khi cần xử lý sự cố đặc biệt.</p>
            <a
              href={sellerSnapshot?.helpUrl || 'https://services.tiktokshop.com/'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 font-medium text-emerald-700 hover:text-emerald-800"
            >
              <BookOpen className="h-4 w-4" />
              Mở hướng dẫn TikTok Shop
            </a>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Thao tác nhanh</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={!tiktokChannel || !effectiveShopId || !isConnected}
            className={!canEdit ? 'hidden' : undefined}
            loading={syncOrdersMutation.isPending}
            onClick={() => tiktokChannel && syncOrdersMutation.mutate({ channelId: tiktokChannel.id, shopId: effectiveShopId })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Đồng bộ đơn hàng
          </Button>
          <Button
            variant="outline"
            disabled={!tiktokChannel || !effectiveShopId || !isConnected}
            className={!canEdit ? 'hidden' : undefined}
            loading={syncProductsMutation.isPending}
            onClick={() =>
              tiktokChannel && syncProductsMutation.mutate({ channelId: tiktokChannel.id, shopId: effectiveShopId })
            }
          >
            <Zap className="mr-2 h-4 w-4" />
            Đồng bộ sản phẩm
          </Button>
          <Button
            variant="danger"
            disabled={!tiktokChannel || !effectiveShopId || !tiktokConnection || !canEdit}
            className={!canEdit ? 'hidden' : undefined}
            loading={deleteConnectionMutation.isPending}
            onClick={() => {
              if (!tiktokChannel) return;
              if (
                window.confirm(
                  'Xóa kết nối API TikTok? Token và bản ghi kết nối sẽ bị xóa khỏi hệ thống.'
                )
              ) {
                deleteConnectionMutation.mutate({ channelId: tiktokChannel.id, shopId: effectiveShopId });
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Xóa kết nối API
          </Button>
        </CardContent>
      </Card>
        </div>

        <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-emerald-600" />
              Kết nối Shopee
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={!shopeeChannel || !canEdit || !shopeeOauthInfo?.oauthConnectUrl}
                className={!canEdit ? 'hidden' : undefined}
                onClick={startShopeeOAuth}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Kết nối Shopee
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!shopeeOauthInfo?.oauthConnectUrl || !canEdit}
                className={!canEdit ? 'hidden' : undefined}
                onClick={startShopeeOAuth}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Làm mới ủy quyền
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge variant={shopeeConnection?.status === 'connected' ? 'success' : 'warning'}>
            {shopeeConnection?.status === 'connected' ? 'Đã liên kết' : 'Chưa liên kết'}
          </Badge>
          <p className="text-sm text-gray-600">
            {overview?.shopeeSnapshot?.detail ||
              'Trạng thái kết nối và hoạt động Shopee của shop hiện tại sẽ hiển thị tại đây.'}
          </p>
          {(overview?.shopeeSnapshot?.alerts || []).length ? (
            <div className="space-y-2">
              {(overview?.shopeeSnapshot?.alerts || []).map((alert, index) => (
                <div
                  key={`${alert.level}-${index}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    alert.level === 'danger'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : alert.level === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-blue-200 bg-blue-50 text-blue-700'
                  }`}
                >
                  {alert.text}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-slate-500" />
              Cửa hàng
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <div>
              <span className="font-semibold">Tên hiển thị:</span>{' '}
              {overview?.shopeeSnapshot?.shopName || overview?.shop?.name || 'Chưa xác định'}
            </div>
            <div>
              <span className="font-semibold">Shop ID:</span>{' '}
              {shopeeStatus?.merchantOrShopId || shopeeConnection?.shopIdRemote || '-'}
            </div>
            <div>
              <span className="font-semibold">Trạng thái API:</span>{' '}
              {shopeeStatus?.apiStatusLabel || 'Chưa có dữ liệu'}
            </div>
            <div>
              <span className="font-semibold">Đồng bộ gần nhất:</span>{' '}
              {shopeeConnection?.lastSyncAt
                ? new Date(shopeeConnection.lastSyncAt).toLocaleString('vi-VN')
                : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thao tác nhanh</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={!shopeeChannel || !shopeeConnection || !canEdit}
              loading={testApiMutation.isPending}
              onClick={() =>
                shopeeChannel &&
                testApiMutation.mutate({ channelId: shopeeChannel.id, shopId: effectiveShopId })
              }
            >
              Kiểm tra Shopee
            </Button>
            <Button
              variant="outline"
              disabled={!shopeeChannel || !shopeeConnection || !canEdit}
              loading={syncOrdersMutation.isPending}
              onClick={() =>
                shopeeChannel &&
                syncOrdersMutation.mutate({ channelId: shopeeChannel.id, shopId: effectiveShopId })
              }
            >
              Đồng bộ đơn Shopee
            </Button>
            <Button
              variant="outline"
              disabled={!shopeeChannel || !shopeeConnection || !canEdit}
              loading={syncProductsMutation.isPending}
              onClick={() =>
                shopeeChannel &&
                syncProductsMutation.mutate({ channelId: shopeeChannel.id, shopId: effectiveShopId })
              }
            >
              Đồng bộ sản phẩm Shopee
            </Button>
            <Button
              variant="danger"
              disabled={!shopeeChannel || !shopeeConnection || !canEdit}
              loading={deleteConnectionMutation.isPending}
              onClick={() => {
                if (
                  shopeeChannel &&
                  window.confirm(
                    'Xóa kết nối API Shopee? Token và bản ghi kết nối sẽ bị xóa khỏi hệ thống.'
                  )
                ) {
                  deleteConnectionMutation.mutate({
                    channelId: shopeeChannel.id,
                    shopId: effectiveShopId,
                  });
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Xóa kết nối API
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-1">{visibleShopeeTabs.map(renderShopeeTabButton)}</div>
      </div>

      {shopeeActiveTab === 'status' ? (
        <Card>
          <CardHeader>
            <CardTitle>Chi tiết kết nối Shopee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <div>
              <b>Access:</b> {shopeeStatus?.accessTokenMasked || 'Chưa có'}
            </div>
            <div>
              <b>Refresh:</b> {shopeeStatus?.refreshTokenMasked || 'Chưa có'}
            </div>
            <div>
              <b>Cập nhật:</b> {formatDateTime(shopeeStatus?.updatedAt)}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {shopeeActiveTab === 'debug' ? (
        <Card>
          <CardHeader>
            <CardTitle>Debug Shopee OAuth</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <div>
              <b>Auth mode:</b> {shopeeDebugInfo?.authMode || '-'}
            </div>
            <div>
              <b>Callback URL:</b> {shopeeDebugInfo?.callbackUrl || '-'}
            </div>
            <div>
              <b>Connect URL:</b> {shopeeDebugInfo?.oauthConnectUrl || '-'}
            </div>
            <div>
              <b>Partner ID:</b> {shopeeDebugInfo?.serviceIdConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
            </div>
            <div>
              <b>Partner Key:</b> {shopeeDebugInfo?.appSecretConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
            </div>
            <div>
              <b>Token exchange:</b> {shopeeDebugInfo?.tokenExchangeConfigured ? 'Sẵn sàng' : 'Chưa cấu hình'}
            </div>
            <div>
              <b>Kết nối hiện tại:</b> {shopeeDebugInfo?.connection?.apiStatusLabel || 'Chưa có'}
            </div>
            <div>
              <b>Shop đang debug:</b> {shopeeDebugInfo?.selectedShopId || '-'}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {shopeeActiveTab === 'guide' ? (
        <Card>
          <CardHeader>
            <CardTitle>Hướng dẫn Shopee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <p>1. Chọn đúng shop bạn đang vận hành.</p>
            <p>2. Bấm "Kết nối Shopee" để đi qua trang ủy quyền Open Platform của Shopee.</p>
            <p>3. Sau khi quay lại trang, bấm "Kiểm tra Shopee" để xác nhận access token và Shop ID.</p>
            <p>4. Dùng "Đồng bộ đơn Shopee" / "Đồng bộ sản phẩm Shopee" để chủ động lấy dữ liệu mới nhất.</p>
            <a
              href={overview?.shopeeSnapshot?.helpUrl || 'https://open.shopee.com/'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 font-medium text-emerald-700 hover:text-emerald-800"
            >
              <BookOpen className="h-4 w-4" />
              Mở Shopee Open Platform
            </a>
          </CardContent>
        </Card>
      ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ApiManagementPage() {
  const user = useAuthStore((s) => s.user);
  const activeShopId = user?.activeShop?.id ?? (user as any)?.shopId ?? '';
  const canEdit = user?.roles?.some((role) => ['super_admin', 'admin'].includes(role)) ?? false;
  const showAdminDashboard = user?.roles?.includes('super_admin') ?? false;

  const queryClient = useQueryClient();
  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsApi.getChannels,
  });
  const shopeeChannel = useMemo(() => channels.find((channel) => channel.code === 'shopee') || null, [channels]);

  const { data: adminOverview, isFetching: adminFetching, refetch: refetchAdminOverview } = useQuery({
    queryKey: ['admin-channel-overview'],
    queryFn: channelsApi.getAdminOverview,
    enabled: showAdminDashboard,
  });

  const refreshAdminData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-channel-overview'] });
    await refetchAdminOverview();
  };

  const deleteConnectionMutation = useMutation({
    mutationFn: ({ channelId, shopId }: { channelId: string; shopId: string }) =>
      channelsApi.deleteChannelConnection(channelId, shopId),
    onSuccess: async () => {
      toast.success('Đã xóa kết nối API');
      await refreshAdminData();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const testApiMutation = useMutation({
    mutationFn: ({ channelId, shopId }: { channelId: string; shopId: string }) =>
      channelsApi.testApi(channelId, shopId),
    onSuccess: (data) => {
      if (data.ok) toast.success(`${data.channel}: API sẵn sàng`);
      else toast.error(`${data.channel}: ${data.detail}`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (showAdminDashboard) {
    if (!adminOverview) {
      return (
        <div className="mx-auto max-w-7xl">
          <Card>
            <CardContent className="p-6 text-sm text-gray-500">Đang tải dữ liệu quản lý API...</CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <ShopeeGlobalPanel channel={shopeeChannel} />
        <AdminApiDashboard
          overview={adminOverview}
          onRefresh={() => void refreshAdminData()}
          onTest={(channelId, shopId) => testApiMutation.mutate({ channelId, shopId })}
          onDelete={(channelId, shopId) => deleteConnectionMutation.mutate({ channelId, shopId })}
          refreshing={adminFetching}
          testing={testApiMutation.isPending}
          deleting={deleteConnectionMutation.isPending}
        />
      </div>
    );
  }

  return <OperatorApiView user={user} activeShopId={activeShopId} canEdit={canEdit} />;
}

function ShopeeGlobalPanel({ channel }: { channel: SalesChannel | null }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: oauthInfo } = useQuery({
    queryKey: ['shopee-oauth-info', channel?.id],
    queryFn: () => channelsApi.getOAuthInfo(channel!.id),
    enabled: !!channel,
  });
  const { data: connections = [], isFetching } = useQuery({
    queryKey: ['shopee-connections', channel?.id],
    queryFn: () => channelsApi.getChannelConnections(channel!.id),
    enabled: !!channel,
  });

  useEffect(() => {
    const state = searchParams.get('shopee');
    if (!state) return;
    if (state === 'success') {
      toast.success(`Ủy quyền Shopee thành công (${searchParams.get('connected') || '1'} shop).`);
    } else {
      toast.error(searchParams.get('reason') || 'Ủy quyền Shopee thất bại');
    }
    const next = new URLSearchParams(searchParams);
    ['shopee', 'connected', 'reason', 'shopId'].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
    void queryClient.invalidateQueries({ queryKey: ['shopee-connections'] });
  }, [queryClient, searchParams, setSearchParams]);

  const actionMutation = useMutation({
    mutationFn: async ({
      action,
      shopId,
    }: {
      action: 'test' | 'orders' | 'products';
      shopId: string;
    }) => {
      if (!channel) throw new Error('Không tìm thấy kênh Shopee');
      if (action === 'test') return channelsApi.testApi(channel.id, shopId);
      if (action === 'orders') return channelsApi.syncOrders(channel.id, shopId);
      return channelsApi.syncProducts(channel.id, shopId);
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === 'test'
          ? 'Kết nối Shopee sẵn sàng'
          : variables.action === 'orders'
            ? 'Đã đồng bộ đơn Shopee'
            : 'Đã đồng bộ sản phẩm Shopee'
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (shopId: string) => {
      if (!channel) throw new Error('Không tìm thấy kênh Shopee');
      return channelsApi.deleteChannelConnection(channel.id, shopId);
    },
    onSuccess: async () => {
      toast.success('Đã xóa kết nối API Shopee');
      await queryClient.invalidateQueries({ queryKey: ['shopee-connections'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-channel-overview'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span>Shopee Open Platform</span>
          <Button
            variant="primary"
            disabled={!oauthInfo?.oauthConnectUrl}
            onClick={() => {
              if (oauthInfo?.oauthConnectUrl) window.location.href = oauthInfo.oauthConnectUrl;
            }}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Kết nối thêm shop Shopee
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500">
          Mỗi shop Shopee được lưu thành một kết nối độc lập. Main Account có thể cấp quyền nhiều shop trong một lần.
        </p>
        {isFetching ? <p className="text-sm text-gray-500">Đang tải kết nối Shopee...</p> : null}
        {!isFetching && !connections.length ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
            Chưa có shop Shopee nào được ủy quyền.
          </p>
        ) : null}
        {connections.map((connection) => (
          <div
            key={connection.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4"
          >
            <div className="text-sm">
              <div className="font-semibold text-gray-900">{connection.shop?.name || 'Shopee Shop'}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-gray-500">
                <span>Shop ID: {connection.shopIdRemote || '-'}</span>
                <Badge variant={connection.status === 'connected' ? 'success' : 'warning'}>
                  {connection.status === 'connected' ? 'Đã kết nối' : 'Chưa kết nối'}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => actionMutation.mutate({ action: 'test', shopId: connection.shopId })}
              >
                Kiểm tra
              </Button>
              <Button
                variant="outline"
                onClick={() => actionMutation.mutate({ action: 'orders', shopId: connection.shopId })}
              >
                Đồng bộ đơn
              </Button>
              <Button
                variant="outline"
                onClick={() => actionMutation.mutate({ action: 'products', shopId: connection.shopId })}
              >
                Đồng bộ sản phẩm
              </Button>
              <Button
                variant="danger"
                loading={deleteMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Xóa kết nối API Shopee của ${connection.shop?.name || 'shop này'}? Token và bản ghi kết nối sẽ bị xóa.`
                    )
                  ) {
                    deleteMutation.mutate(connection.shopId);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Xóa kết nối API
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AllocationModal({
  connectionId,
  shopName,
  onClose,
}: {
  connectionId: string;
  shopName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<Array<{ id: string; username: string; fullName: string; email: string; roles: string[] }>>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [users, currentAllocations] = await Promise.all([
          channelsApi.getEligibleUsersForAllocation(connectionId),
          channelsApi.getConnectionAllocations(connectionId),
        ]);
        setEligibleUsers(users);
        setSelectedUserIds(currentAllocations.map(u => u.id));
      } catch (err) {
        toast.error('Không thể tải danh sách tài khoản: ' + getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [connectionId]);

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await channelsApi.saveConnectionAllocations(connectionId, selectedUserIds);
      toast.success('Phân bổ API thành công!');
      onClose();
    } catch (err) {
      toast.error('Không thể lưu phân bổ: ' + getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = eligibleUsers.filter(
    (u) =>
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Modal open={true} onClose={onClose} title={`Phân bổ API - ${shopName}`} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Chọn các tài khoản nhân viên được phép thực hiện đóng gói đơn hàng thuộc kết nối API này. Số lượng phân bổ là không giới hạn.
        </p>

        <Input
          placeholder="Tìm kiếm nhân viên (Tên, username, email)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">Đang tải danh sách nhân viên...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">Không tìm thấy tài khoản nhân viên nào khả dụng.</div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {filteredUsers.map((user) => {
              const isChecked = selectedUserIds.includes(user.id);
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleToggleUser(user.id)}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900">{user.fullName}</span>
                    <span className="text-xs text-gray-500">
                      @{user.username} ({user.email})
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role} variant="default" className="text-[10px] px-1 py-0">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4.5 w-4.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    checked={isChecked}
                    onChange={() => {}}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={loading}>
            Lưu thay đổi
          </Button>
        </div>
      </div>
    </Modal>
  );
}
