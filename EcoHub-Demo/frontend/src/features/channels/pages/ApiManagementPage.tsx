import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  KeyRound,
  Link2,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Store,
  Unplug,
  Wifi,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AdminApiOverview,
  ChannelDebugInfo,
  ChannelOAuthInfo,
  ChannelConnectionSnapshot,
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

type OperatorTab = 'status' | 'api-status' | 'shops' | 'debug' | 'guide';

const operatorTabLabelMap: Record<OperatorTab, string> = {
  status: 'Trạng thái',
  'api-status': 'API status',
  shops: 'Danh sách shop',
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

function AdminApiDashboard({
  overview,
  tiktokChannelId,
  onRefresh,
  onTest,
  onSync,
  onDisconnect,
  refreshing,
  testing,
  syncing,
  disconnecting,
}: {
  overview: AdminApiOverview;
  tiktokChannelId: string | null;
  onRefresh: () => void;
  onTest: (shopId: string) => void;
  onSync: (shopId: string) => void;
  onDisconnect: (shopId: string) => void;
  refreshing: boolean;
  testing: boolean;
  syncing: boolean;
  disconnecting: boolean;
}) {
  const appConfigStatus = [
    overview.appConfig.serviceIdConfigured,
    overview.appConfig.appKeyConfigured,
    overview.appConfig.appSecretConfigured,
  ].every(Boolean);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Quản lý API TikTok</h1>
        <p className="text-sm text-gray-500">
          Góc nhìn quản trị hệ thống cho super admin: cấu hình ứng dụng gốc, theo dõi toàn bộ shop đã
          ủy quyền, kiểm tra sức khỏe kết nối và xử lý sự cố API.
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
          <div className="text-sm font-medium text-gray-500">Đơn TikTok hôm nay</div>
          <div className="mt-2 text-3xl font-bold text-emerald-600">{overview.summary.ordersToday}</div>
        </div>
        <div className={metricCardClass}>
          <div className="text-sm font-medium text-gray-500">Đơn TikTok 7 ngày</div>
          <div className="mt-2 text-3xl font-bold text-blue-600">{overview.summary.ordersThisWeek}</div>
        </div>
        <div className={metricCardClass}>
          <div className="text-sm font-medium text-gray-500">Đơn TikTok 30 ngày</div>
          <div className="mt-2 text-3xl font-bold text-purple-600">{overview.summary.ordersThisMonth}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-slate-500" />
            Danh sách quản lý cửa hàng
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Shop / Chủ sở hữu</th>
                <th className="px-3 py-2">Shop ID TikTok</th>
                <th className="px-3 py-2">Ngày kết nối</th>
                <th className="px-3 py-2">Trạng thái token</th>
                <th className="px-3 py-2">Lần sync gần nhất</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {overview.shops.map((shop) => (
                <tr key={shop.shopId} className="border-t align-top">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-900">{shop.shopName}</div>
                    <div className="text-xs text-gray-500">{shop.shopCode}</div>
                    <div className="mt-2 text-xs text-gray-600">
                      {shop.ownerName} - {shop.ownerEmail}
                    </div>
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
                        disabled={!tiktokChannelId || shop.tokenStatus === 'not_connected'}
                        loading={testing}
                        onClick={() => onTest(shop.shopId)}
                      >
                        <Wifi className="mr-2 h-4 w-4" />
                        Kiểm tra
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!tiktokChannelId || shop.tokenStatus !== 'active'}
                        loading={syncing}
                        onClick={() => onSync(shop.shopId)}
                      >
                        <Zap className="mr-2 h-4 w-4" />
                        Đồng bộ tay
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={!tiktokChannelId || shop.tokenStatus === 'not_connected'}
                        loading={disconnecting}
                        onClick={() => onDisconnect(shop.shopId)}
                      >
                        <Unplug className="mr-2 h-4 w-4" />
                        Ngắt kết nối
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Nhật ký API / Debug vận hành
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Tỷ lệ shop có cảnh báo: <span className="font-semibold">{overview.diagnostics.apiIssueRateLabel}</span>
            </div>
            {overview.diagnostics.issues.length ? (
              <div className="space-y-3">
                {overview.diagnostics.issues.map((issue, index) => (
                  <div
                    key={`${issue.scope}-${index}`}
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      issue.level === 'danger'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : issue.level === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-blue-200 bg-blue-50 text-blue-700'
                    }`}
                  >
                    <div className="font-semibold">{issue.scope}</div>
                    <div className="mt-1">{issue.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Chưa ghi nhận cảnh báo nào trên các shop đang kết nối.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-slate-500" />
              Ghi chú quản trị
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <p>1. Shop tự đi qua OAuth ở giao diện Kết nối API của riêng họ.</p>
            <p>2. Super admin chỉ giám sát App Key/Secret, callback và tình trạng token toàn hệ thống.</p>
            <p>3. Các thao tác “Đồng bộ tay” và “Ngắt kết nối” dùng để xử lý sự cố vận hành.</p>
            <p>4. Chưa có bảng webhook log chuyên dụng. Phần debug hiện đang dựa trên tình trạng token và sync.</p>
          </CardContent>
        </Card>
      </div>
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
  const [oauthInfoByChannel, setOauthInfoByChannel] = useState<Record<string, ChannelOAuthInfo>>({});
  const [formByChannel, setFormByChannel] = useState<
    Record<string, { accessToken: string; refreshToken: string; channelShopId: string }>
  >({});

  const effectiveShopId = selectedShopId || activeShopId;

  const { data: shops = [] } = useQuery({
    queryKey: ['meta', 'shops'],
    queryFn: metaApi.getShops,
    enabled: !activeShopId && canEdit,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsApi.getChannels,
  });

  const { data: connections = [] } = useQuery({
    queryKey: ['channel-connections', effectiveShopId],
    queryFn: () => channelsApi.getShopConnections(effectiveShopId),
    enabled: !!effectiveShopId,
  });

  const { data: overview, isFetching: overviewFetching, refetch: refetchOverview } = useQuery({
    queryKey: ['channel-overview', effectiveShopId],
    queryFn: () => channelsApi.getShopOverview(effectiveShopId),
    enabled: !!effectiveShopId,
  });

  const { data: debugInfo } = useQuery<ChannelDebugInfo>({
    queryKey: ['channel-debug-info', channels.find((channel) => channel.code === 'tiktok')?.id, effectiveShopId],
    queryFn: () => channelsApi.getDebugInfo(channels.find((channel) => channel.code === 'tiktok')!.id, effectiveShopId),
    enabled: !!channels.find((channel) => channel.code === 'tiktok') && !!effectiveShopId,
  });

  useEffect(() => {
    const tiktokState = searchParams.get('tiktok');
    if (!tiktokState) return;

    if (tiktokState === 'success') {
      toast.success('Ủy quyền TikTok thành công. Token đã được lưu vào hệ thống.');
    } else if (tiktokState === 'error') {
      toast.error(searchParams.get('reason') || 'Ủy quyền TikTok thất bại');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tiktok');
    nextParams.delete('reason');
    nextParams.delete('shopId');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

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
        channelShopId: existing?.channelShopId || '',
      };
    });
    setFormByChannel(nextState);
  }, [channels, connections]);

  useEffect(() => {
    const loadOauthInfo = async () => {
      const results = await Promise.all(
        channels
          .filter((channel) => channel.code === 'tiktok')
          .map(async (channel) => {
            try {
              const oauthInfo = await channelsApi.getOAuthInfo(channel.id, effectiveShopId);
              return [channel.id, oauthInfo] as const;
            } catch {
              return null;
            }
          })
      );

      const nextMap: Record<string, ChannelOAuthInfo> = {};
      results.forEach((entry) => {
        if (entry) nextMap[entry[0]] = entry[1];
      });
      setOauthInfoByChannel(nextMap);
    };

    if (channels.length && effectiveShopId) {
      void loadOauthInfo();
    }
  }, [channels, effectiveShopId]);

  const connectionByChannelId = useMemo(
    () => Object.fromEntries(connections.map((item) => [item.channelId, item])),
    [connections]
  );

  const tiktokChannel = useMemo(() => channels.find((channel) => channel.code === 'tiktok') || null, [channels]);
  const tiktokConnection = tiktokChannel
    ? (connectionByChannelId[tiktokChannel.id] as ShopChannelConnection | undefined)
    : undefined;
  const tiktokStatus = tiktokChannel
    ? overview?.apiStatusRecords?.find((item) => item.channelId === tiktokChannel.id)
    : undefined;
  const tiktokOauthInfo = tiktokChannel ? oauthInfoByChannel[tiktokChannel.id] : undefined;
  const tiktokForm = tiktokChannel
    ? formByChannel[tiktokChannel.id] || { accessToken: '', refreshToken: '', channelShopId: '' }
    : { accessToken: '', refreshToken: '', channelShopId: '' };

  const refreshChannelData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] }),
      queryClient.invalidateQueries({ queryKey: ['channel-overview'] }),
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

  const disconnectMutation = useMutation({
    mutationFn: ({ channelId, shopId }: { channelId: string; shopId: string }) =>
      channelsApi.disconnectChannel(channelId, shopId),
    onSuccess: async () => {
      toast.success('Đã ngắt kết nối TikTok');
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
  const isConnected = tiktokConnection?.status === 'connected';
  const snapshotAlerts = sellerSnapshot?.alerts || [];

  const startNativeOAuth = () => {
    if (!tiktokOauthInfo?.oauthConnectUrl) {
      toast.error('OAuth URL chưa sẵn sàng. Kiểm tra lại cấu hình TikTok trên backend.');
      return;
    }
    window.location.href = tiktokOauthInfo.oauthConnectUrl;
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Kết nối API TikTok</h1>
        <p className="text-sm text-gray-500">
          Kết nối shop của bạn với TikTok Shop, kiểm tra trạng thái token và chủ động đồng bộ dữ liệu khi
          cần.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Button
            variant="primary"
            disabled={!tiktokChannel || !effectiveShopId || !canEdit || !tiktokOauthInfo?.oauthConnectUrl}
            onClick={startNativeOAuth}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Kết nối TikTok Shop
          </Button>

          <Button
            variant="outline"
            disabled={!tiktokChannel || !effectiveShopId}
            loading={testApiMutation.isPending}
            onClick={() => tiktokChannel && testApiMutation.mutate({ channelId: tiktokChannel.id, shopId: effectiveShopId })}
          >
            <Wifi className="mr-2 h-4 w-4" />
            Kiểm tra kết nối
          </Button>

          <Button variant="ghost" disabled={!tiktokOauthInfo?.oauthConnectUrl || !canEdit} onClick={startNativeOAuth}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Làm mới ủy quyền
          </Button>

          <Button variant="ghost" onClick={() => setActiveTab('guide')}>
            <BookOpen className="mr-2 h-4 w-4" />
            Hướng dẫn TikTok
          </Button>

          <Button variant="ghost" loading={overviewFetching} onClick={() => void refreshChannelData()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Làm mới
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[280px] flex-1">
              <Select
                label="Shop đang quản lý"
                value={effectiveShopId}
                disabled={!!activeShopId}
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

      <div className="border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-1">
          {(['status', 'api-status', 'shops', 'debug', 'guide'] as OperatorTab[]).map(renderTabButton)}
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

          <div className="grid gap-5 lg:grid-cols-2">
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
                    <th className="px-3 py-2">Access</th>
                    <th className="px-3 py-2">Refresh</th>
                    <th className="px-3 py-2">API status</th>
                    <th className="px-3 py-2">Last sync</th>
                  </tr>
                </thead>
                <tbody>
                  {apiStatusRecords.map((record: ChannelConnectionSnapshot) => (
                    <tr key={record.id} className="border-t">
                      <td className="px-3 py-2 font-medium text-gray-900">{record.channelName}</td>
                      <td className="px-3 py-2 text-gray-600">{record.merchantOrShopId || '-'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{record.accessTokenMasked}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{record.refreshTokenMasked}</td>
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

          {tiktokChannel ? (
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
            loading={syncOrdersMutation.isPending}
            onClick={() => tiktokChannel && syncOrdersMutation.mutate({ channelId: tiktokChannel.id, shopId: effectiveShopId })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Đồng bộ đơn hàng
          </Button>
          <Button
            variant="outline"
            disabled={!tiktokChannel || !effectiveShopId || !isConnected}
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
            disabled={!tiktokChannel || !effectiveShopId || !isConnected || !canEdit}
            loading={disconnectMutation.isPending}
            onClick={() => tiktokChannel && disconnectMutation.mutate({ channelId: tiktokChannel.id, shopId: effectiveShopId })}
          >
            <Unplug className="mr-2 h-4 w-4" />
            Ngắt kết nối
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApiManagementPage() {
  const user = useAuthStore((s) => s.user);
  const activeShopId = user?.activeShop?.id ?? (user as any)?.shopId ?? '';
  const isSuperAdmin = user?.roles?.includes('super_admin') ?? false;
  const canEdit = user?.roles?.some((role) => ['admin', 'staff', 'customer_service'].includes(role)) ?? false;

  const queryClient = useQueryClient();
  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsApi.getChannels,
  });
  const tiktokChannel = useMemo(() => channels.find((channel) => channel.code === 'tiktok') || null, [channels]);

  const { data: adminOverview, isFetching: adminFetching, refetch: refetchAdminOverview } = useQuery({
    queryKey: ['admin-channel-overview'],
    queryFn: channelsApi.getAdminOverview,
    enabled: isSuperAdmin,
  });

  const refreshAdminData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-channel-overview'] });
    await refetchAdminOverview();
  };

  const disconnectMutation = useMutation({
    mutationFn: ({ channelId, shopId }: { channelId: string; shopId: string }) =>
      channelsApi.disconnectChannel(channelId, shopId),
    onSuccess: async () => {
      toast.success('Đã ngắt kết nối TikTok');
      await refreshAdminData();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const syncOrdersMutation = useMutation({
    mutationFn: ({ channelId, shopId }: { channelId: string; shopId: string }) =>
      channelsApi.syncOrders(channelId, shopId),
    onSuccess: async () => {
      toast.success('Đã gửi yêu cầu đồng bộ đơn hàng');
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

  if (isSuperAdmin) {
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
      <AdminApiDashboard
        overview={adminOverview}
        tiktokChannelId={tiktokChannel?.id || null}
        onRefresh={() => void refreshAdminData()}
        onTest={(shopId) => tiktokChannel && testApiMutation.mutate({ channelId: tiktokChannel.id, shopId })}
        onSync={(shopId) => tiktokChannel && syncOrdersMutation.mutate({ channelId: tiktokChannel.id, shopId })}
        onDisconnect={(shopId) => tiktokChannel && disconnectMutation.mutate({ channelId: tiktokChannel.id, shopId })}
        refreshing={adminFetching}
        testing={testApiMutation.isPending}
        syncing={syncOrdersMutation.isPending}
        disconnecting={disconnectMutation.isPending}
      />
    );
  }

  return <OperatorApiView user={user} activeShopId={activeShopId} canEdit={canEdit} />;
}
