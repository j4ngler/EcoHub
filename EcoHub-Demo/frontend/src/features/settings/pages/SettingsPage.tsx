import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Camera,
  Globe,
  Link2,
  Mail,
  Paintbrush,
  Plus,
  Settings2,
  Truck,
  Cloud,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { settingsApi, ReportSubscription } from '@/api/settings.api';
import { metaApi } from '@/api/meta.api';
import { getErrorMessage } from '@/api/axios';
import { useAuthStore } from '@/store/authStore';

type AppSettings = {
  notifications: boolean;
  compactMode: boolean;
  language: 'vi' | 'en';
};

const STORAGE_KEY = 'ecohub-app-settings';
const DEFAULT_SETTINGS: AppSettings = {
  notifications: true,
  compactMode: false,
  language: 'vi',
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<ReportSubscription | null>(null);
  const [emailForm, setEmailForm] = useState({
    email: '',
    reportType: 'both' as 'financial' | 'operational' | 'both',
  });

  const activeShopId = user?.activeShop?.id ?? (user as any)?.shopId ?? null;
  const isSuperAdmin = user?.roles?.includes('super_admin') ?? false;
  const canManageS3 = user?.roles?.includes('super_admin') ?? false;
  const [selectedShopIdForSettings, setSelectedShopIdForSettings] = useState<string>(activeShopId ?? '');
  const effectiveShopId = activeShopId || selectedShopIdForSettings || null;

  const { data: shops } = useQuery({
    queryKey: ['meta', 'shops'],
    queryFn: metaApi.getShops,
    enabled: isSuperAdmin && !activeShopId,
  });

  const { data: subscriptions, isLoading: loadingSubscriptions } = useQuery({
    queryKey: ['report-subscriptions', effectiveShopId],
    queryFn: () => settingsApi.getReportSubscriptions(effectiveShopId),
    enabled: !!effectiveShopId,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      }
    } catch {
      // Ignore local browser settings parse failures.
    }
  }, []);

  useEffect(() => {
    if (activeShopId) {
      setSelectedShopIdForSettings(activeShopId);
    }
  }, [activeShopId]);

  const createMutation = useMutation({
    mutationFn: settingsApi.createReportSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-subscriptions'] });
      toast.success('Đã thêm email nhận báo cáo');
      setEmailModalOpen(false);
      setEmailForm({ email: '', reportType: 'both' });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { enabled?: boolean; reportType?: 'financial' | 'operational' | 'both' } }) =>
      settingsApi.updateReportSubscription(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-subscriptions'] });
      toast.success('Đã cập nhật cấu hình email');
      setEmailModalOpen(false);
      setEditingSubscription(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: settingsApi.deleteReportSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-subscriptions'] });
      toast.success('Đã xóa email nhận báo cáo');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const [s3Form, setS3Form] = useState({
    endpoint: '',
    accessKey: '',
    secretKey: '',
    bucket: '',
    region: 'hn-2',
    prefix: '',
  });

  const { data: s3Settings, isLoading: loadingS3Settings } = useQuery({
    queryKey: ['s3-settings'],
    queryFn: settingsApi.getS3Settings,
    enabled: canManageS3,
  });

  const updateS3Mutation = useMutation({
    mutationFn: settingsApi.updateS3Settings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['s3-settings'] });
      toast.success('Đã cập nhật cấu hình lưu trữ S3');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  useEffect(() => {
    if (s3Settings) {
      setS3Form({
        endpoint: s3Settings.endpoint || '',
        accessKey: s3Settings.accessKey || '',
        secretKey: s3Settings.secretKey || '',
        bucket: s3Settings.bucket || '',
        region: s3Settings.region || 'hn-2',
        prefix: s3Settings.prefix || '',
      });
    }
  }, [s3Settings]);

  const handleSubmitS3 = (event: React.FormEvent) => {
    event.preventDefault();
    updateS3Mutation.mutate(s3Form);
  };

  const saveUiSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const handleOpenEmailModal = (sub?: ReportSubscription) => {
    if (sub) {
      setEditingSubscription(sub);
      setEmailForm({ email: sub.email, reportType: sub.reportType });
    } else {
      setEditingSubscription(null);
      setEmailForm({ email: '', reportType: 'both' });
    }
    setEmailModalOpen(true);
  };

  const handleSubmitEmail = (event: React.FormEvent) => {
    event.preventDefault();

    if (editingSubscription) {
      updateMutation.mutate({
        id: editingSubscription.id,
        data: {
          enabled: editingSubscription.enabled,
          reportType: emailForm.reportType,
        },
      });
      return;
    }

    if (!effectiveShopId) {
      toast.error('Vui lòng chọn shop trước khi thêm email nhận báo cáo');
      return;
    }

    createMutation.mutate({
      email: emailForm.email,
      reportType: emailForm.reportType,
      shopId: effectiveShopId,
    });
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
          <p className="text-gray-500">Trang tổng hợp cấu hình hệ thống, giao diện và email báo cáo.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved ? <Badge variant="success">Đã lưu</Badge> : null}
          <Button onClick={saveUiSettings}>Lưu giao diện</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Cài đặt giao diện
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Thông báo</p>
                <p className="text-sm text-gray-500">Bật hoặc tắt toast thông báo trong giao diện hiện tại.</p>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={settings.notifications}
                onChange={(e) => setSettings((current) => ({ ...current, notifications: e.target.checked }))}
              />
            </div>

            <div className="flex items-center gap-3">
              <Paintbrush className="h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Chế độ gọn</p>
                <p className="text-sm text-gray-500">Giảm khoảng cách hiển thị để xem được nhiều dữ liệu hơn.</p>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={settings.compactMode}
                onChange={(e) => setSettings((current) => ({ ...current, compactMode: e.target.checked }))}
              />
            </div>

            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Ngôn ngữ</p>
                <p className="text-sm text-gray-500">Tùy chọn hiển thị cục bộ theo trình duyệt.</p>
              </div>
              <select
                className="input w-40"
                value={settings.language}
                onChange={(e) => setSettings((current) => ({ ...current, language: e.target.value as AppSettings['language'] }))}
              >
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Điều hướng cấu hình</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              to="/camera-settings"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <Camera className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium">Cài đặt camera</p>
                <p className="text-xs text-gray-500">USB, RTSP, test camera, preview, ca làm việc.</p>
              </div>
            </Link>

            <Link
              to="/channel-management"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <Link2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium">Quản lý API</p>
                <p className="text-xs text-gray-500">Token, trạng thái kết nối, sync đơn hàng và sản phẩm.</p>
              </div>
            </Link>

            <Link
              to="/settings/shipping"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <Truck className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium">Vận chuyển</p>
                <p className="text-xs text-gray-500">Cấu hình hãng vận chuyển và tracking.</p>
              </div>
            </Link>

            {canManageS3 ? (
              <Link
                to="/settings/s3"
                className="flex items-center gap-3 rounded-lg border px-4 py-3 text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <Cloud className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="font-medium">Lưu trữ S3</p>
                  <p className="text-xs text-gray-500">Endpoint, bucket, region và khóa truy cập.</p>
                </div>
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {canManageS3 && (
        <Card id="s3-storage">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-emerald-600" />
              Cấu hình lưu trữ S3
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingS3Settings ? (
              <p className="text-sm text-gray-500">Đang tải cấu hình S3...</p>
            ) : (
              <form onSubmit={handleSubmitS3} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="S3 Endpoint"
                    placeholder="https://s3.example.com"
                    value={s3Form.endpoint}
                    onChange={(e) => setS3Form({ ...s3Form, endpoint: e.target.value })}
                    required
                  />
                  <Input
                    label="S3 Bucket"
                    placeholder="my-bucket"
                    value={s3Form.bucket}
                    onChange={(e) => setS3Form({ ...s3Form, bucket: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="AWS Region"
                    placeholder="ap-southeast-1"
                    value={s3Form.region}
                    onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
                  />
                  <Input
                    label="Path Prefix (Thư mục chứa)"
                    placeholder="videos"
                    value={s3Form.prefix}
                    onChange={(e) => setS3Form({ ...s3Form, prefix: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Access Key ID"
                    placeholder="AWS Access Key"
                    value={s3Form.accessKey}
                    onChange={(e) => setS3Form({ ...s3Form, accessKey: e.target.value })}
                  />
                  <Input
                    label="Secret Access Key"
                    placeholder="AWS Secret Key"
                    type="password"
                    value={s3Form.secretKey}
                    onChange={(e) => setS3Form({ ...s3Form, secretKey: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" loading={updateS3Mutation.isPending}>
                    Lưu cấu hình S3
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email báo cáo
            </CardTitle>
            <div className="flex items-center gap-3">
              {isSuperAdmin && !activeShopId ? (
                <div className="w-72">
                  <Select
                    label="Shop áp dụng"
                    value={effectiveShopId || ''}
                    onChange={(e) => setSelectedShopIdForSettings(e.target.value)}
                    options={(shops || []).map((shop) => ({
                      value: shop.id,
                      label: `${shop.name} (${shop.code})`,
                    }))}
                  />
                </div>
              ) : null}
              <Button onClick={() => handleOpenEmailModal()} disabled={!effectiveShopId}>
                <Plus className="mr-2 h-4 w-4" />
                Thêm email
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!effectiveShopId ? (
            <p className="text-sm text-amber-600">Chọn shop trước khi cấu hình email báo cáo.</p>
          ) : loadingSubscriptions ? (
            <p className="text-sm text-gray-500">Đang tải cấu hình email...</p>
          ) : (subscriptions || []).length === 0 ? (
            <p className="text-sm text-gray-500">Chưa có email nhận báo cáo cho shop này.</p>
          ) : (
            <div className="space-y-3">
              {(subscriptions || []).map((subscription) => (
                <div key={subscription.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                  <div>
                    <p className="font-medium text-gray-900">{subscription.email}</p>
                    <p className="text-sm text-gray-500">
                      Loại báo cáo: <span className="font-medium">{subscription.reportType}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={subscription.enabled ? 'success' : 'default'}>
                      {subscription.enabled ? 'Đang bật' : 'Đang tắt'}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => handleOpenEmailModal(subscription)}>
                      Sửa
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(subscription.id)}
                    >
                      Xóa
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={emailModalOpen} onClose={() => setEmailModalOpen(false)} title={editingSubscription ? 'Sửa email báo cáo' : 'Thêm email báo cáo'}>
        <form className="space-y-4" onSubmit={handleSubmitEmail}>
          <Input
            label="Email"
            type="email"
            value={emailForm.email}
            disabled={!!editingSubscription}
            onChange={(e) => setEmailForm((current) => ({ ...current, email: e.target.value }))}
          />
          <Select
            label="Loại báo cáo"
            value={emailForm.reportType}
            onChange={(e) => setEmailForm((current) => ({ ...current, reportType: e.target.value as typeof current.reportType }))}
            options={[
              { value: 'financial', label: 'Tài chính' },
              { value: 'operational', label: 'Vận hành' },
              { value: 'both', label: 'Cả hai' },
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEmailModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              Lưu
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
