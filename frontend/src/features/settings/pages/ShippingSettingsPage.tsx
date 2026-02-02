import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Plus, Settings } from 'lucide-react';
import { shippingApi, ShopCarrierSetting, SaveShopCarrierSettingDto } from '@/api/shipping.api';
import { metaApi } from '@/api/meta.api';
import { getErrorMessage } from '@/api/axios';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useAuthStore } from '@/store/authStore';

export default function ShippingSettingsPage() {
  const { user, hasRole } = useAuthStore();
  const isSuperAdmin = hasRole('super_admin');
  const activeShop = user?.activeShop ?? null;
  const [selectedShopId, setSelectedShopId] = useState<string>(activeShop?.id ?? '');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<ShopCarrierSetting | null>(null);
  const [form, setForm] = useState<SaveShopCarrierSettingDto & { apiKey?: string; apiSecret?: string }>({
    shopId: '',
    carrierId: '',
    apiKey: '',
    apiSecret: '',
    shopCarrierId: '',
    isDefault: false,
  });

  const queryClient = useQueryClient();
  const effectiveShopId = selectedShopId || activeShop?.id;

  const { data: shops } = useQuery({
    queryKey: ['meta', 'shops'],
    queryFn: metaApi.getShops,
    enabled: isSuperAdmin,
  });

  const { data: carriers } = useQuery({
    queryKey: ['shipping', 'carriers'],
    queryFn: shippingApi.getCarriers,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['shipping', 'settings', effectiveShopId],
    queryFn: () => shippingApi.getSettings(effectiveShopId!),
    enabled: !!effectiveShopId,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: SaveShopCarrierSettingDto) => shippingApi.saveSetting(payload),
    onSuccess: () => {
      toast.success('Đã lưu cài đặt vận chuyển');
      queryClient.invalidateQueries({ queryKey: ['shipping', 'settings'] });
      setFormOpen(false);
      setEditingSetting(null);
      setForm({ shopId: '', carrierId: '', apiKey: '', apiSecret: '', shopCarrierId: '', isDefault: false });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const openCreate = () => {
    setEditingSetting(null);
    setForm({
      shopId: effectiveShopId!,
      carrierId: '',
      apiKey: '',
      apiSecret: '',
      shopCarrierId: '',
      isDefault: false,
    });
    setFormOpen(true);
  };

  const openEdit = (s: ShopCarrierSetting) => {
    setEditingSetting(s);
    setForm({
      shopId: s.shopId,
      carrierId: s.carrierId,
      apiKey: (s as any).apiKey ?? '',
      apiSecret: (s as any).apiSecret ?? '',
      shopCarrierId: s.shopCarrierId ?? '',
      isDefault: s.isDefault,
    });
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      shopId: form.shopId,
      carrierId: form.carrierId,
      apiKey: form.apiKey?.trim() || undefined,
      apiSecret: form.apiSecret?.trim() || undefined,
      shopCarrierId: form.shopCarrierId?.trim() || undefined,
      isDefault: form.isDefault,
    });
  };

  if (!effectiveShopId && !isSuperAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Cài đặt vận chuyển</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-500">Vui lòng chọn shop để xem cài đặt vận chuyển.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cài đặt vận chuyển</h1>
          <p className="text-gray-500">Cấu hình hãng vận chuyển theo shop</p>
        </div>
        {effectiveShopId && (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm hãng vận chuyển
          </Button>
        )}
      </div>

      {isSuperAdmin && shops && shops.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Chọn shop</label>
            <select
              className="input w-full max-w-xs"
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
            >
              <option value="">-- Chọn shop --</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Hãng vận chuyển đã cấu hình
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!effectiveShopId ? (
            <p className="text-gray-500">Chọn shop ở trên để xem cài đặt.</p>
          ) : isLoading ? (
            <div className="h-24 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : !settings?.length ? (
            <div className="text-center py-8 text-gray-500">
              <Settings className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>Chưa cấu hình hãng vận chuyển nào.</p>
              <Button className="mt-4" onClick={openCreate}>
                Thêm hãng vận chuyển
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {settings.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <Truck className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{s.carrier?.name ?? s.carrierId}</p>
                      <p className="text-sm text-gray-500">{s.carrier?.code}</p>
                      {s.isDefault && (
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                          Mặc định
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                    Sửa
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingSetting(null); }}
        title={editingSetting ? 'Sửa cài đặt vận chuyển' : 'Thêm hãng vận chuyển'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSuperAdmin && !editingSetting && (
            <Select
              label="Shop"
              value={form.shopId}
              onChange={(e) => setForm({ ...form, shopId: e.target.value })}
              required
              options={[
                { value: '', label: 'Chọn shop...' },
                ...(shops || []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
              ]}
            />
          )}
          <Select
            label="Hãng vận chuyển"
            value={form.carrierId}
            onChange={(e) => setForm({ ...form, carrierId: e.target.value })}
            required
            disabled={!!editingSetting}
            options={[
              { value: '', label: 'Chọn hãng...' },
              ...(carriers || []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
            ]}
          />
          <Input
            label="API Key (tùy chọn)"
            type="password"
            value={form.apiKey ?? ''}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
          <Input
            label="API Secret (tùy chọn)"
            type="password"
            value={form.apiSecret ?? ''}
            onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
          />
          <Input
            label="Shop Carrier ID (tùy chọn)"
            value={form.shopCarrierId ?? ''}
            onChange={(e) => setForm({ ...form, shopCarrierId: e.target.value })}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault ?? false}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-gray-700">Đặt làm mặc định</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { setFormOpen(false); setEditingSetting(null); }}>
              Hủy
            </Button>
            <Button type="submit" loading={saveMutation.isPending}>
              Lưu
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
