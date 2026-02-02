import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Mail, Phone, Trash2, Pencil, UserCog } from 'lucide-react';
import { toast } from 'react-toastify';
import { usersApi, UsersUser, UserStatus } from '@/api/users.api';
import { metaApi } from '@/api/meta.api';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { formatDateTime } from '@/utils/format';
import { useAuthStore } from '@/store/authStore';

export default function UsersPage() {
  const { user: currentUser, hasRole } = useAuthStore();
  const isSuperAdmin = hasRole('super_admin');
  const activeShop = currentUser?.activeShop || null;
  const isShopContext = (() => {
    try {
      const token = useAuthStore.getState().accessToken;
      if (!token) return false;
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !!payload?.shopId;
    } catch {
      return false;
    }
  })();

  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    search: '',
    role: '',
    status: '',
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activeUser, setActiveUser] = useState<UsersUser | null>(null);
  const [transferModal, setTransferModal] = useState<{ userId: string; message: string } | null>(null);
  const [transferToUserId, setTransferToUserId] = useState('');
  const [rolesModalUser, setRolesModalUser] = useState<UsersUser | null>(null);
  const [assignRoleForm, setAssignRoleForm] = useState({ roleId: '', shopId: '' });

  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    phone: '',
    status: 'active' as UserStatus,
    roleId: '',
    shopId: '',
  });

  const [editForm, setEditForm] = useState({
    email: '',
    fullName: '',
    phone: '',
    status: 'active' as UserStatus,
    password: '',
  });

  const queryClient = useQueryClient();

  const usersParams = useMemo(() => {
    const params: any = { page: filters.page, limit: filters.limit };
    if (filters.search?.trim()) params.search = filters.search.trim();
    if (filters.role) params.role = filters.role;
    if (filters.status) params.status = filters.status;
    return params;
  }, [filters]);

  // Refetch khi đổi shop (assume shop) để danh sách user theo shop đúng
  const { data, isLoading } = useQuery({
    queryKey: ['users', usersParams, activeShop?.id],
    queryFn: async () => {
      return usersApi.list(usersParams);
    },
  });

  const { data: roles } = useQuery({
    queryKey: ['meta', 'roles'],
    queryFn: metaApi.getRoles,
  });

  const { data: shops } = useQuery({
    queryKey: ['meta', 'shops'],
    queryFn: metaApi.getShops,
  });

  const allowedRoleOptions = useMemo(() => {
    const list = roles || [];
    if (!isShopContext && !activeShop) return list;
    // Trong shop: cho phép tạo Nhân viên, Nhân viên CSKH và Khách hàng (không admin/super_admin)
    const filtered = list.filter((r) => ['staff', 'customer_service', 'customer'].includes(r.name));
    // Debug: log để kiểm tra
    if (process.env.NODE_ENV === 'development') {
      console.log('[UsersPage] All roles:', list.map(r => r.name));
      console.log('[UsersPage] Filtered roles:', filtered.map(r => r.name));
      console.log('[UsersPage] Has customer_service:', list.some(r => r.name === 'customer_service'));
    }
    return filtered;
  }, [roles, activeShop, isShopContext]);

  const createMutation = useMutation({
    mutationFn: () =>
      usersApi.create({
        username: createForm.username.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        fullName: createForm.fullName.trim(),
        phone: createForm.phone?.trim() || undefined,
        status: createForm.status,
        roleId: createForm.roleId || undefined,
        shopId: activeShop ? activeShop.id : createForm.shopId || undefined,
      }),
    onSuccess: () => {
      toast.success('Tạo người dùng thành công');
      setCreateOpen(false);
      setCreateForm({
        username: '',
        email: '',
        password: '',
        fullName: '',
        phone: '',
        status: 'active',
        roleId: '',
        shopId: '',
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Tạo người dùng thất bại');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!activeUser) throw new Error('No user selected');
      return usersApi.update(activeUser.id, {
        email: editForm.email.trim() || undefined,
        fullName: editForm.fullName.trim() || undefined,
        phone: editForm.phone?.trim() ? editForm.phone.trim() : null,
        status: editForm.status,
        password: editForm.password ? editForm.password : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Cập nhật người dùng thành công');
      setEditOpen(false);
      setActiveUser(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Cập nhật người dùng thất bại');
    },
  });

  const deleteMutation = useMutation<void, Error, { id: string; transferShopToUserId?: string }>({
    mutationFn: (payload) =>
      usersApi.remove(payload.id, { transferShopToUserId: payload.transferShopToUserId }),
    onSuccess: () => {
      toast.success('Xóa người dùng thành công');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setTransferModal(null);
      setTransferToUserId('');
    },
    onError: (e: any, variables: { id: string }) => {
      const msg = e?.response?.data?.message || 'Xóa người dùng thất bại';
      toast.error(msg);
      if (msg.includes('shop') || msg.includes('Chuyển')) {
        setTransferModal({ userId: variables.id, message: msg });
      }
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: () => {
      if (!rolesModalUser) throw new Error('No user');
      return usersApi.assignRole(rolesModalUser.id, {
        roleId: assignRoleForm.roleId,
        shopId: assignRoleForm.shopId || (activeShop ? activeShop.id : undefined) || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Gán vai trò thành công');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setAssignRoleForm({ roleId: '', shopId: '' });
      if (rolesModalUser) {
        setRolesModalUser((prev) => {
          if (!prev) return null;
          const newRoles = [...prev.roles];
          const role = roles?.find((r) => r.id === assignRoleForm.roleId);
          const shop = shops?.find((s) => s.id === (assignRoleForm.shopId || activeShop?.id));
          if (role) newRoles.push({ id: role.id, name: role.name, shop: shop ? { id: shop.id, name: shop.name } : null });
          return { ...prev, roles: newRoles };
        });
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Gán vai trò thất bại'),
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      usersApi.removeRole(userId, roleId),
    onSuccess: (_, variables) => {
      toast.success('Đã gỡ vai trò');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setRolesModalUser((prev) => {
        if (!prev || prev.id !== variables.userId) return prev;
        return { ...prev, roles: prev.roles.filter((r) => r.id !== variables.roleId) };
      });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Gỡ vai trò thất bại'),
  });

  const getRoleBadge = (roleName: string) => {
    const config: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'default' }> = {
      super_admin: { label: 'Super Admin', variant: 'success' },
      admin: { label: 'Admin', variant: 'info' },
      staff: { label: 'Nhân viên', variant: 'warning' },
      customer_service: { label: 'Chăm sóc khách hàng', variant: 'info' },
      customer: { label: 'Khách hàng', variant: 'default' },
    };
    return config[roleName] || { label: roleName, variant: 'default' as any };
  };

  const getRoleInfo = (roleName: string) => {
    const config: Record<string, { label: string; description: string }> = {
      super_admin: {
        label: 'Super Admin',
        description: 'Quản trị viên cao nhất, có toàn quyền quản lý hệ thống và tất cả shop',
      },
      admin: {
        label: 'Admin',
        description: 'Quản trị viên shop, quản lý nhân viên và đơn hàng trong shop',
      },
      staff: {
        label: 'Nhân viên đóng hàng',
        description: 'Đóng gói, quay video đóng gói, cập nhật trạng thái đơn hàng, quản lý sản phẩm',
      },
      customer_service: {
        label: 'Nhân viên chăm sóc khách hàng',
        description: 'Xử lý hoàn trả, theo dõi vận chuyển, cập nhật trạng thái đơn hàng',
      },
      customer: {
        label: 'Khách hàng',
        description: 'Xem đơn hàng của mình, xem video đóng gói, tạo yêu cầu hoàn trả',
      },
    };
    return config[roleName] || { label: roleName, description: '' };
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' }> = {
      active: { label: 'Hoạt động', variant: 'success' },
      inactive: { label: 'Không hoạt động', variant: 'danger' },
      suspended: { label: 'Bị khóa', variant: 'warning' },
    };
    return config[status] || { label: status, variant: 'default' as any };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Người dùng</h1>
          <p className="text-gray-500">Quản lý tài khoản người dùng</p>
        </div>
        {isShopContext && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm nhân viên
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm theo tên, email, số điện thoại..."
                  className="input pl-10"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                />
              </div>
            </div>
            <div className="w-full md:w-56">
              <select
                className="input"
                value={filters.role}
                onChange={(e) => setFilters({ ...filters, role: e.target.value, page: 1 })}
              >
                <option value="">Tất cả vai trò</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="staff">Nhân viên</option>
                <option value="customer_service">Chăm sóc khách hàng</option>
                <option value="customer">Khách hàng</option>
              </select>
            </div>
            <div className="w-full md:w-56">
              <select
                className="input"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="active">Hoạt động</option>
                <option value="inactive">Không hoạt động</option>
                <option value="suspended">Bị khóa</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Người dùng
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Liên hệ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Vai trò
                  </th>
                  {isSuperAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Shop
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Trạng thái
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Đăng nhập cuối
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={isSuperAdmin ? 7 : 6} className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : data?.data?.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 7 : 6} className="px-6 py-12 text-center text-gray-500">
                      Không có người dùng nào
                    </td>
                  </tr>
                ) : (
                  data?.data?.map((user: UsersUser) => {
                    const statusBadge = getStatusBadge(user.status);
                    return (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                              {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full" />
                              ) : (
                                <span className="font-medium text-primary-600">
                                  {user.fullName.charAt(0)}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{user.fullName}</p>
                              <p className="text-sm text-gray-500">@{user.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Mail className="w-4 h-4" />
                              {user.email}
                            </div>
                            {user.phone && (
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Phone className="w-4 h-4" />
                                {user.phone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {user.roles.length === 0 ? (
                              <span className="text-xs text-gray-400 italic">Chưa có vai trò</span>
                            ) : (
                              user.roles.map((role) => {
                                const roleBadge = getRoleBadge(role.name);
                                const roleInfo = getRoleInfo(role.name);
                                return (
                                  <div
                                    key={role.id}
                                    className="group relative"
                                    title={`${roleBadge.label}${role.shop ? ` - Shop: ${role.shop.name}` : ' (Toàn cục)'}\n${roleInfo.description}`}
                                  >
                                    <Badge variant={roleBadge.variant} className="cursor-help">
                                      {roleBadge.label}
                                      {role.shop && (
                                        <span className="ml-1 text-xs opacity-75">@{role.shop.name}</span>
                                      )}
                                    </Badge>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </td>
                        {isSuperAdmin && (
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {(() => {
                                const shops = Array.from(
                                  new Map(
                                    user.roles
                                      .filter((r) => r.shop)
                                      .map((r) => [r.shop!.id, r.shop!.name])
                                  ).entries()
                                );
                                if (shops.length === 0)
                                  return <span className="text-sm text-gray-400">—</span>;
                                return shops.map(([id, name]) => (
                                  <Badge key={id} variant="default">
                                    {name}
                                  </Badge>
                                ));
                              })()}
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <Badge variant={statusBadge.variant}>
                            {statusBadge.label}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Chưa đăng nhập'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              className="p-2 hover:bg-gray-100 rounded-lg"
                              title="Sửa"
                              onClick={() => {
                                setActiveUser(user);
                                setEditForm({
                                  email: user.email,
                                  fullName: user.fullName,
                                  phone: user.phone || '',
                                  status: user.status,
                                  password: '',
                                });
                                setEditOpen(true);
                              }}
                            >
                              <Pencil className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              className="p-2 hover:bg-gray-100 rounded-lg"
                              title="Quản lý vai trò"
                              onClick={() => {
                                setRolesModalUser(user);
                                setAssignRoleForm({ roleId: '', shopId: '' });
                              }}
                            >
                              <UserCog className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              className="p-2 hover:bg-gray-100 rounded-lg"
                              title="Xóa"
                              onClick={() => {
                                if (window.confirm('Bạn có chắc chắn muốn xóa người dùng này?')) {
                                  deleteMutation.mutate({ id: user.id });
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data?.meta && data.meta.totalPages > 1 && (
            <div className="px-6 py-4 border-t flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Hiển thị {(data.meta.page - 1) * data.meta.limit + 1} -{' '}
                {Math.min(data.meta.page * data.meta.limit, data.meta.total)} trong {data.meta.total} người dùng
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.meta.page === 1}
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                >
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.meta.page === data.meta.totalPages}
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                >
                  Sau
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create user modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Thêm người dùng" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Tên đăng nhập"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              required
            />
            <Input
              label="Họ và tên"
              value={createForm.fullName}
              onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              required
            />
            <Input
              label="Số điện thoại"
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
            />
            <Input
              label="Mật khẩu"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              helperText="Tối thiểu 8 ký tự"
              required
            />
            <Select
              label="Trạng thái"
              value={createForm.status}
              onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as UserStatus })}
              options={[
                { value: 'active', label: 'Hoạt động' },
                { value: 'inactive', label: 'Không hoạt động' },
                { value: 'suspended', label: 'Bị khóa' },
              ]}
            />
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {activeShop || isShopContext
                  ? `Vai trò (bắt buộc${activeShop ? ` trong shop: ${activeShop.name}` : ''})` 
                  : 'Vai trò (tùy chọn)'}
                {(activeShop || isShopContext) && <span className="text-red-500 ml-1">*</span>}
              </label>
              <select
                className="input w-full"
                value={createForm.roleId}
                onChange={(e) => setCreateForm({ ...createForm, roleId: e.target.value })}
                required={!!activeShop || isShopContext}
              >
                {!(activeShop || isShopContext) && <option value="">-- Không gán vai trò --</option>}
                {allowedRoleOptions.map((r) => {
                  const roleInfo = getRoleInfo(r.name);
                  return (
                    <option key={r.id} value={r.id} title={roleInfo.description}>
                      {roleInfo.label}
                    </option>
                  );
                })}
              </select>
              {createForm.roleId && (
                <p className="text-xs text-gray-500 mt-1.5 italic">
                  {getRoleInfo(allowedRoleOptions.find(r => r.id === createForm.roleId)?.name || '').description}
                </p>
              )}
            </div>
            {activeShop || isShopContext ? (
              <Input
                label="Shop"
                value={activeShop ? `${activeShop.name} (${activeShop.code})` : 'Đang quản lý shop'}
                disabled
              />
            ) : (
              <Select
                label="Shop (bắt buộc)"
                value={createForm.shopId}
                onChange={(e) => setCreateForm({ ...createForm, shopId: e.target.value })}
                required
                options={[
                  { value: '', label: 'Chọn shop...' },
                  ...(shops || []).map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.code}) — ${s.phone || '-'} — ${s.email || '-'} — ${s.address || '-'}`,
                  })),
                ]}
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Tạo người dùng
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Sửa người dùng" size="lg">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Họ và tên"
              value={editForm.fullName}
              onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              required
            />
            <Input
              label="Số điện thoại"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
            <Select
              label="Trạng thái"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value as UserStatus })}
              options={[
                { value: 'active', label: 'Hoạt động' },
                { value: 'inactive', label: 'Không hoạt động' },
                { value: 'suspended', label: 'Bị khóa' },
              ]}
            />
            <div className="md:col-span-2">
              <Input
                label="Mật khẩu mới (tùy chọn)"
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                helperText="Để trống nếu không đổi mật khẩu"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={updateMutation.isPending}>
              Lưu
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal quản lý vai trò */}
      <Modal
        open={!!rolesModalUser}
        onClose={() => { setRolesModalUser(null); setAssignRoleForm({ roleId: '', shopId: '' }); }}
        title={`Quản lý vai trò: ${rolesModalUser?.fullName || ''}`}
        size="lg"
      >
        {rolesModalUser && (
          <div className="space-y-5">
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Email:</span> {rolesModalUser.email}
              </p>
              {rolesModalUser.phone && (
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">SĐT:</span> {rolesModalUser.phone}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Vai trò hiện tại</p>
              {rolesModalUser.roles.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Chưa có vai trò nào được gán</p>
              ) : (
                <div className="space-y-2">
                  {rolesModalUser.roles.map((role) => {
                    const roleBadge = getRoleBadge(role.name);
                    const roleInfo = getRoleInfo(role.name);
                    return (
                      <div
                        key={`${role.id}-${role.shop?.id || 'global'}`}
                        className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
                            {role.shop && (
                              <span className="text-xs text-gray-500">
                                Shop: <span className="font-medium">{role.shop.name}</span>
                              </span>
                            )}
                            {!role.shop && (
                              <span className="text-xs text-gray-400 italic">(Toàn cục)</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600">{roleInfo.description}</p>
                        </div>
                        <button
                          type="button"
                          className="ml-2 text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded"
                          title="Gỡ vai trò"
                          onClick={() => {
                            if (window.confirm(`Gỡ vai trò "${roleBadge.label}"${role.shop ? ` trong shop ${role.shop.name}` : ''}?`)) {
                              removeRoleMutation.mutate({ userId: rolesModalUser!.id, roleId: role.id });
                            }
                          }}
                          disabled={removeRoleMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Gán thêm vai trò</p>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (assignRoleForm.roleId) assignRoleMutation.mutate();
                }}
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vai trò</label>
                  <select
                    className="input w-full"
                    value={assignRoleForm.roleId}
                    onChange={(e) => setAssignRoleForm({ ...assignRoleForm, roleId: e.target.value })}
                  >
                    <option value="">-- Chọn vai trò --</option>
                    {allowedRoleOptions
                      .filter((r) => !rolesModalUser.roles.some((ur) => ur.id === r.id && ur.shop?.id === (assignRoleForm.shopId || activeShop?.id)))
                      .map((r) => {
                        const roleInfo = getRoleInfo(r.name);
                        return (
                          <option key={r.id} value={r.id} title={roleInfo.description}>
                            {roleInfo.label}
                          </option>
                        );
                      })}
                  </select>
                  {assignRoleForm.roleId && (
                    <p className="text-xs text-gray-500 mt-1.5 italic">
                      {getRoleInfo(allowedRoleOptions.find(r => r.id === assignRoleForm.roleId)?.name || '').description}
                    </p>
                  )}
                </div>
                {isSuperAdmin && !activeShop && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shop (tùy chọn)</label>
                    <select
                      className="input w-full"
                      value={assignRoleForm.shopId}
                      onChange={(e) => setAssignRoleForm({ ...assignRoleForm, shopId: e.target.value })}
                    >
                      <option value="">-- Không gắn shop (role toàn cục) --</option>
                      {(shops || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Chọn shop để gán role cho user trong shop đó. Để trống để gán role toàn cục.
                    </p>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!assignRoleForm.roleId || assignRoleMutation.isPending}
                    loading={assignRoleMutation.isPending}
                  >
                    Gán vai trò
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal chuyển shop khi xóa thất bại do user là chủ shop */}
      <Modal
        open={!!transferModal}
        onClose={() => { setTransferModal(null); setTransferToUserId(''); }}
        title="Chuyển shop sang user khác"
        size="md"
      >
        {transferModal && (
          <div className="space-y-4">
            <p className="text-gray-600 text-sm">{transferModal.message}</p>
            <p className="text-sm font-medium">Chọn user nhận shop (bắt buộc nếu user là chủ shop):</p>
            <select
              className="input w-full"
              value={transferToUserId}
              onChange={(e) => setTransferToUserId(e.target.value)}
            >
              <option value="">-- Chọn user --</option>
              {(data?.data || [])
                .filter((u) => u.id !== transferModal.userId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setTransferModal(null); setTransferToUserId(''); }}>
                Đóng
              </Button>
              <Button
                disabled={!transferToUserId || deleteMutation.isPending}
                onClick={() => {
                  deleteMutation.mutate({ id: transferModal.userId, transferShopToUserId: transferToUserId });
                }}
              >
                {deleteMutation.isPending ? 'Đang xử lý...' : 'Xóa và chuyển shop'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
