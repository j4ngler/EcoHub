import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Mail, Phone, MoreVertical, Trash2, Pencil } from 'lucide-react';
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

export default function UsersPage() {
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

  const { data, isLoading } = useQuery({
    queryKey: ['users', usersParams],
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
        shopId: createForm.shopId || undefined,
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      toast.success('Xóa người dùng thành công');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Xóa người dùng thất bại');
    },
  });

  const getRoleBadge = (roleName: string) => {
    const config: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'default' }> = {
      super_admin: { label: 'Super Admin', variant: 'success' },
      admin: { label: 'Admin', variant: 'info' },
      staff: { label: 'Nhân viên', variant: 'warning' },
      customer: { label: 'Khách hàng', variant: 'default' },
    };
    return config[roleName] || { label: roleName, variant: 'default' as any };
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
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Thêm người dùng
        </Button>
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
                      <td colSpan={6} className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : data?.data?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
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
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((role) => {
                              const roleBadge = getRoleBadge(role.name);
                              return (
                                <Badge key={role.id} variant={roleBadge.variant}>
                                  {roleBadge.label}
                                </Badge>
                              );
                            })}
                          </div>
                        </td>
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
                              title="Xóa"
                              onClick={() => {
                                if (window.confirm('Bạn có chắc chắn muốn xóa người dùng này?')) {
                                  deleteMutation.mutate(user.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                            <button className="p-2 hover:bg-gray-100 rounded-lg" title="Khác">
                              <MoreVertical className="w-4 h-4 text-gray-500" />
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
            <Select
              label="Vai trò (tùy chọn)"
              value={createForm.roleId}
              onChange={(e) => setCreateForm({ ...createForm, roleId: e.target.value })}
              options={[
                { value: '', label: 'Không gán vai trò' },
                ...(roles || []).map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
            <Select
              label="Shop (tùy chọn)"
              value={createForm.shopId}
              onChange={(e) => setCreateForm({ ...createForm, shopId: e.target.value })}
              options={[
                { value: '', label: 'Không gán shop' },
                ...(shops || []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
              ]}
            />
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
    </div>
  );
}
