import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Search, ArrowRightCircle, LogOut, Phone, Globe, MapPin, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { shopsApi } from '@/api/shops.api';
import { authApi } from '@/api/auth.api';
import { getErrorMessage } from '@/api/axios';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { usersApi } from '@/api/users.api';

export default function ShopsPage() {
  const navigate = useNavigate();
  const { user, setAuth } = useAuthStore();
  const [q, setQ] = useState('');
  const activeShopId = user?.activeShop?.id || null;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    adminUsername: '',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
    adminPhone: '',
    phone: '',
    email: '',
    address: '',
  });

  const { data: shops, isLoading } = useQuery({
    queryKey: ['shops'],
    queryFn: shopsApi.list,
  });

  const filtered = useMemo(() => {
    const list = shops || [];
    const keyword = q.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((s) =>
      (s.name + ' ' + s.code + ' ' + (s.phone || '') + ' ' + (s.email || '') + ' ' + (s.address || ''))
        .toLowerCase()
        .includes(keyword)
    );
  }, [shops, q]);

  const assumeMutation = useMutation({
    mutationFn: (shopId: string | null) => authApi.assumeShop(shopId),
    onSuccess: (data) => {
      // Backend trả cả `activeShop` (top-level) và `user.activeShop` (đã đồng bộ), ưu tiên user.activeShop
      setAuth(data.user as any, data.accessToken, data.refreshToken);
      toast.success(data.user.activeShop ? `Đang quản lý: ${data.user.activeShop.name}` : 'Đã thoát quản lý shop');
      navigate('/dashboard');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const createShopMutation = useMutation({
    mutationFn: () =>
      shopsApi.create({
        name: createForm.name.trim(),
        code: createForm.code.trim(),
        adminUsername: createForm.adminUsername.trim(),
        adminEmail: createForm.adminEmail.trim(),
        adminPassword: createForm.adminPassword,
        adminFullName: createForm.adminFullName.trim(),
        adminPhone: createForm.adminPhone.trim() || null,
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
        address: createForm.address.trim() || null,
      }),
    onSuccess: async () => {
      toast.success('Tạo shop thành công');
      setCreateOpen(false);
      setCreateForm({
        name: '',
        code: '',
        adminUsername: '',
        adminFullName: '',
        adminEmail: '',
        adminPassword: '',
        adminPhone: '',
        phone: '',
        email: '',
        address: '',
      });
      queryClient.invalidateQueries({ queryKey: ['shops'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const isSuperAdmin = user?.roles?.includes('super_admin');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [shopToDelete, setShopToDelete] = useState<Shop | null>(null);

  const deleteShopMutation = useMutation({
    mutationFn: () => shopsApi.delete(shopToDelete!.id, deletePassword),
    onSuccess: () => {
      toast.success('Đã xóa (vô hiệu hóa) shop');
      setDeleteOpen(false);
      setDeletePassword('');
      setShopToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['shops'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shop</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Chỉ Super Admin mới có quyền chọn shop để quản lý.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chọn shop để quản lý</h1>
          <p className="text-gray-500">Bấm vào một shop để vào quyền quản lý như admin shop đó.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm shop
          </Button>
          <Button
            variant="outline"
            onClick={() => assumeMutation.mutate(null)}
            disabled={assumeMutation.isPending}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Thoát quản lý shop
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-between">
            <span className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Danh sách shop
            </span>
            <Badge variant="info">{filtered.length} shop</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input pl-9 w-full"
                placeholder="Tìm theo tên, mã, SĐT, web, địa chỉ..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-sm text-gray-500">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-gray-500">Không có shop.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-2xl p-4 bg-white border transition-colors ${
                    activeShopId === s.id ? 'border-emerald-300 bg-emerald-50/30' : 'hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-gray-900 truncate">{s.name}</div>
                        <Badge className="shrink-0">{s.code}</Badge>
                        {activeShopId === s.id && (
                          <Badge variant="success" className="shrink-0 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Đang quản lý
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                        <div className="flex items-center gap-2 min-w-0">
                          <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="truncate">{s.phone || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Globe className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="truncate">{s.email || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0 sm:col-span-2">
                          <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="truncate">{s.address || '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <Button
                        onClick={() => assumeMutation.mutate(s.id)}
                        disabled={assumeMutation.isPending}
                        className={activeShopId === s.id ? 'bg-emerald-600 hover:bg-emerald-700' : undefined}
                      >
                        <ArrowRightCircle className="w-4 h-4 mr-2" />
                        {activeShopId === s.id ? 'Vào shop' : 'Quản lý'}
                      </Button>
                      {s.role && <Badge variant="info">Role: {s.role}</Badge>}
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center text-xs text-red-500 hover:text-red-700"
                        onClick={() => {
                          setShopToDelete(s as any);
                          setDeletePassword('');
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Xóa shop
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Thêm shop" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createShopMutation.mutate();
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Tên shop"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
            />
            <Input
              label="Mã shop"
              value={createForm.code}
              onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
              helperText="Ví dụ: ECOHUB_DEMO"
              required
            />
            <Input
              label="Tên đăng nhập admin"
              value={createForm.adminUsername}
              onChange={(e) => setCreateForm({ ...createForm, adminUsername: e.target.value })}
              required
            />
            <Input
              label="Họ tên admin"
              value={createForm.adminFullName}
              onChange={(e) => setCreateForm({ ...createForm, adminFullName: e.target.value })}
              required
            />
            <Input
              label="Email admin"
              type="email"
              value={createForm.adminEmail}
              onChange={(e) => setCreateForm({ ...createForm, adminEmail: e.target.value })}
              required
            />
            <Input
              label="Mật khẩu admin"
              type="password"
              helperText="Tối thiểu 8 ký tự"
              value={createForm.adminPassword}
              onChange={(e) => setCreateForm({ ...createForm, adminPassword: e.target.value })}
              required
            />
            <Input
              label="SĐT admin"
              value={createForm.adminPhone}
              onChange={(e) => setCreateForm({ ...createForm, adminPhone: e.target.value })}
            />
            <Input
              label="SĐT shop"
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
            />
            <Input
              label="Web shop / Email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            />
            <Input
              label="Địa chỉ"
              value={createForm.address}
              onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={createShopMutation.isPending}>
              Tạo shop
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal xóa shop */}
      <Modal
        open={deleteOpen}
        onClose={() => {
          if (deleteShopMutation.isPending) return;
          setDeleteOpen(false);
          setDeletePassword('');
          setShopToDelete(null);
        }}
        title={shopToDelete ? `Xóa shop: ${shopToDelete.name}` : 'Xóa shop'}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Hành động này sẽ <span className="font-semibold">vô hiệu hóa</span> shop (không còn hiển thị trong danh sách).
            Dữ liệu đơn hàng/sản phẩm vẫn được giữ trong hệ thống.
          </p>
          <p className="text-sm text-red-600">
            Để xác nhận, hãy nhập đúng <strong>mật khẩu Super Admin</strong>.
          </p>
          <Input
            type="password"
            label="Mật khẩu Super Admin"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (deleteShopMutation.isPending) return;
                setDeleteOpen(false);
                setDeletePassword('');
                setShopToDelete(null);
              }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!shopToDelete || !deletePassword || deleteShopMutation.isPending}
              onClick={() => deleteShopMutation.mutate()}
            >
              {deleteShopMutation.isPending ? 'Đang xóa...' : 'Xóa shop'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

