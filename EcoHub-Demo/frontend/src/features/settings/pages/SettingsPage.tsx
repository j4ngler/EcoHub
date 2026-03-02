import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Globe, Paintbrush, Mail, Plus, Trash2, Edit } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { settingsApi, ReportSubscription } from '@/api/settings.api';
import { metaApi } from '@/api/meta.api';
import { getErrorMessage } from '@/api/axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

type AppSettings = {
  notifications: boolean;
  compactMode: boolean;
  language: 'vi' | 'en';
};

const DEFAULT_SETTINGS: AppSettings = {
  notifications: true,
  compactMode: false,
  language: 'vi',
};

const STORAGE_KEY = 'ecohub-app-settings';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<ReportSubscription | null>(null);
  const [emailForm, setEmailForm] = useState({
    email: '',
    reportType: 'both' as 'financial' | 'operational' | 'both',
  });

  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const activeShopId = user?.activeShop?.id ?? (user as any)?.shopId ?? null;
  const isSuperAdmin = user?.roles?.includes('super_admin') ?? false;
  const isManagingShop = !!activeShopId; // Đang ở chế độ quản lý shop

  // Super Admin có thể chọn shop để xem/sửa cài đặt email mà không cần "Vào shop"
  // Nhưng khi đang assume shop, chỉ được xem shop đó
  const [selectedShopIdForSettings, setSelectedShopIdForSettings] = useState<string>(activeShopId ?? '');
  const effectiveShopId = isManagingShop ? activeShopId : (selectedShopIdForSettings || activeShopId || null);

  const { data: shops } = useQuery({
    queryKey: ['meta', 'shops'],
    queryFn: metaApi.getShops,
    enabled: isSuperAdmin && !isManagingShop, // Chỉ cho phép chọn shop khi Super Admin không assume shop
  });

  const { data: subscriptions, isLoading: loadingSubscriptions } = useQuery({
    queryKey: ['report-subscriptions', effectiveShopId],
    queryFn: () => settingsApi.getReportSubscriptions(effectiveShopId),
    enabled: !!effectiveShopId,
  });

  // Khi user "Vào shop" (assume), đồng bộ dropdown sang shop đó và không cho phép đổi
  useEffect(() => {
    if (activeShopId) {
      setSelectedShopIdForSettings(activeShopId);
    } else {
      // Khi thoát assume shop, reset về empty để Super Admin có thể chọn lại
      setSelectedShopIdForSettings('');
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
    mutationFn: ({ id, data }: { id: string; data: any }) =>
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      }
    } catch {
      // ignore
    }
  }, []);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleOpenEmailModal = (sub?: ReportSubscription) => {
    if (sub) {
      setEditingSubscription(sub);
      setEmailForm({
        email: sub.email,
        reportType: sub.reportType,
      });
    } else {
      setEditingSubscription(null);
      setEmailForm({ email: '', reportType: 'both' });
    }
    setEmailModalOpen(true);
  };

  const handleSubmitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSubscription) {
      updateMutation.mutate({
        id: editingSubscription.id,
        data: {
          enabled: editingSubscription.enabled,
          reportType: emailForm.reportType,
        },
      });
    } else {
      if (!effectiveShopId) {
        toast.error('Vui lòng chọn shop trước khi thêm email nhận báo cáo');
        return;
      }
      createMutation.mutate({
        ...emailForm,
        shopId: effectiveShopId,
      });
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
          <p className="text-gray-500">Cấu hình trải nghiệm sử dụng EcoHub (lưu trên trình duyệt)</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <Badge variant="success">Đã lưu</Badge>}
          <Button onClick={save}>Lưu cài đặt</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Thông báo</p>
              <p className="text-sm text-gray-500">Bật/tắt toast thông báo trong hệ thống</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.notifications}
              onChange={(e) => setSettings({ ...settings, notifications: e.target.checked })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Paintbrush className="w-5 h-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Chế độ gọn</p>
              <p className="text-sm text-gray-500">Giảm khoảng cách hiển thị để xem được nhiều dữ liệu hơn</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.compactMode}
              onChange={(e) => setSettings({ ...settings, compactMode: e.target.checked })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Ngôn ngữ</p>
              <p className="text-sm text-gray-500">Chọn ngôn ngữ hiển thị (demo)</p>
            </div>
            <select
              className="input w-40"
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: e.target.value as AppSettings['language'] })}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Email Report Subscriptions */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Báo cáo định kỳ qua email
            </CardTitle>
            <div className="flex items-center gap-3">
              {isSuperAdmin && !isManagingShop && shops && shops.length > 0 && (
                <Select
                  value={selectedShopIdForSettings}
                  onChange={(e) => setSelectedShopIdForSettings(e.target.value)}
                  className="min-w-[200px]"
                  options={[
                    { value: '', label: '-- Chọn shop để xem/sửa --' },
                    ...shops.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
                  ]}
                />
              )}
              {isManagingShop && activeShopId && user?.activeShop && (
                <Badge variant="success" className="shrink-0">
                  Shop: {user.activeShop.name}
                </Badge>
              )}
              <Button onClick={() => handleOpenEmailModal()} size="sm" disabled={!effectiveShopId}>
                <Plus className="w-4 h-4 mr-2" />
                Thêm email
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-sm text-gray-500 mb-4">
            Cấu hình danh sách email nhận báo cáo tự động hàng ngày lúc 18:00. Mỗi shop có danh sách riêng — chọn shop để xem/sửa đúng cài đặt của shop đó.
          </p>
          {!effectiveShopId ? (
            <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
              {isSuperAdmin && !isManagingShop
                ? 'Chọn một shop ở dropdown trên để xem và thêm email nhận báo cáo theo shop.'
                : isManagingShop
                ? 'Đang ở chế độ quản lý shop. Chỉ có thể xem và sửa email của shop đang quản lý.'
                : 'Vui lòng chọn shop (ngữ cảnh) ở header để xem và thêm email nhận báo cáo theo shop.'}
            </p>
          ) : loadingSubscriptions ? (
            <div className="text-center py-8 text-gray-500">Đang tải...</div>
          ) : subscriptions && subscriptions.length > 0 ? (
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{sub.email}</p>
                      {sub.enabled ? (
                        <Badge variant="success">Đang bật</Badge>
                      ) : (
                        <Badge variant="danger">Đã tắt</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Loại báo cáo:{' '}
                      {sub.reportType === 'financial'
                        ? 'Tài chính'
                        : sub.reportType === 'operational'
                        ? 'Vận hành'
                        : 'Cả hai'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEmailModal(sub)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                      title="Sửa"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Xóa email này khỏi danh sách nhận báo cáo?')) {
                          deleteMutation.mutate(sub.id);
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Mail className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>Chưa có email nào đăng ký nhận báo cáo</p>
              <Button onClick={() => handleOpenEmailModal()} className="mt-4" size="sm">
                Thêm email đầu tiên
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-2">
          <p className="font-medium text-gray-900">Gợi ý dữ liệu mẫu</p>
          <p className="text-sm text-gray-500">
            Hệ thống đã có dữ liệu demo để hiển thị dashboard/báo cáo (đơn hàng, sản phẩm, video).
          </p>
          <div className="text-sm text-gray-700">
            <div>- Admin demo: <b>admin.demo@ecohub.vn</b> / <b>Admin@123</b></div>
            <div>- Staff demo: <b>staff.demo@ecohub.vn</b> / <b>Staff@123</b></div>
            <div>- Customer demo: <b>customer.demo@ecohub.vn</b> / <b>Customer@123</b></div>
          </div>
        </CardContent>
      </Card>

      {/* Email Subscription Modal */}
      <Modal
        open={emailModalOpen}
        onClose={() => {
          setEmailModalOpen(false);
          setEditingSubscription(null);
          setEmailForm({ email: '', reportType: 'both' });
        }}
        title={editingSubscription ? 'Sửa cấu hình email' : 'Thêm email nhận báo cáo'}
        size="md"
      >
        <form onSubmit={handleSubmitEmail} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={emailForm.email}
            onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
            required
            disabled={!!editingSubscription}
            helperText={editingSubscription ? 'Không thể thay đổi email' : 'Email sẽ nhận báo cáo hàng ngày'}
          />
          <Select
            label="Loại báo cáo"
            value={emailForm.reportType}
            onChange={(e) =>
              setEmailForm({
                ...emailForm,
                reportType: e.target.value as 'financial' | 'operational' | 'both',
              })
            }
            options={[
              { value: 'financial', label: 'Báo cáo Tài chính' },
              { value: 'operational', label: 'Báo cáo Vận hành' },
              { value: 'both', label: 'Cả hai loại' },
            ]}
          />
          {editingSubscription && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={editingSubscription.enabled}
                onChange={(e) =>
                  setEditingSubscription({ ...editingSubscription, enabled: e.target.checked })
                }
                className="h-4 w-4"
              />
              <label htmlFor="enabled" className="text-sm text-gray-700">
                Bật nhận báo cáo
              </label>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEmailModalOpen(false);
                setEditingSubscription(null);
                setEmailForm({ email: '', reportType: 'both' });
              }}
            >
              Hủy
            </Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {editingSubscription ? 'Cập nhật' : 'Thêm'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

