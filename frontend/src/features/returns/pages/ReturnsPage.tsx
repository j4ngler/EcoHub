import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Eye, CheckCircle, XCircle, Check, Filter } from 'lucide-react';
import { returnsApi, ReturnRequest, ReturnStatus, ReturnReason, returnReasonLabels } from '@/api/returns.api';
import { ordersApi } from '@/api/orders.api';
import { getErrorMessage } from '@/api/axios';
import { formatDateTime, formatCurrency } from '@/utils/format';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuthStore } from '@/store/authStore';

const statusLabels: Record<ReturnStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  processing: 'Đang xử lý',
  completed: 'Hoàn tất',
};

const statusVariant: Record<ReturnStatus, 'warning' | 'info' | 'danger' | 'success' | 'default'> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'danger',
  processing: 'info',
  completed: 'success',
};

export default function ReturnsPage() {
  const { hasRole } = useAuthStore();
  const canProcess = hasRole('super_admin') || hasRole('admin') || hasRole('staff') || hasRole('customer_service');
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({ page: 1, limit: 10, status: '' as string, orderId: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [detailReturn, setDetailReturn] = useState<ReturnRequest | null>(null);
  const [approveReturn, setApproveReturn] = useState<ReturnRequest | null>(null);
  const [rejectReturn, setRejectReturn] = useState<ReturnRequest | null>(null);
  const [createForm, setCreateForm] = useState({
    orderId: '',
    reason: 'other' as ReturnReason,
    description: '',
  });
  const [approveForm, setApproveForm] = useState({ refundAmount: 0, notes: '' });
  const [rejectNotes, setRejectNotes] = useState('');

  const params = {
    page: filters.page,
    limit: filters.limit,
    ...(filters.status ? { status: filters.status as ReturnStatus } : {}),
    ...(filters.orderId?.trim() ? { orderId: filters.orderId.trim() } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['returns', params],
    queryFn: () => returnsApi.list(params),
  });

  const { data: ordersForReturn } = useQuery({
    queryKey: ['orders', 'for-return'],
    queryFn: () => ordersApi.getOrders({ page: 1, limit: 100, status: 'delivered' }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      returnsApi.create({
        orderId: createForm.orderId,
        reason: createForm.reason,
        description: createForm.description?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Tạo yêu cầu hoàn trả thành công');
      setCreateOpen(false);
      setCreateForm({ orderId: '', reason: 'other', description: '' });
      queryClient.invalidateQueries({ queryKey: ['returns'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!approveReturn) throw new Error('No return');
      return returnsApi.approve(approveReturn.id, {
        refundAmount: approveForm.refundAmount,
        notes: approveForm.notes?.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Đã duyệt yêu cầu hoàn trả');
      setApproveReturn(null);
      setApproveForm({ refundAmount: 0, notes: '' });
      queryClient.invalidateQueries({ queryKey: ['returns'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: () => {
      if (!rejectReturn) throw new Error('No return');
      return returnsApi.reject(rejectReturn.id, { notes: rejectNotes.trim() || undefined });
    },
    onSuccess: () => {
      toast.success('Đã từ chối yêu cầu hoàn trả');
      setRejectReturn(null);
      setRejectNotes('');
      queryClient.invalidateQueries({ queryKey: ['returns'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => returnsApi.complete(id),
    onSuccess: () => {
      toast.success('Đã hoàn tất hoàn trả');
      queryClient.invalidateQueries({ queryKey: ['returns'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const returns = data?.data ?? [];
  const meta = data?.meta;
  const orderOptions = ordersForReturn?.data?.filter((o) => o.status === 'delivered' || o.status === 'completed') ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hoàn trả</h1>
          <p className="text-gray-500">Quản lý yêu cầu hoàn trả hàng</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Tạo yêu cầu hoàn trả
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Mã đơn hàng..."
                className="input pl-10"
                value={filters.orderId}
                onChange={(e) => setFilters({ ...filters, orderId: e.target.value, page: 1 })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <select
                className="input w-48"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
              >
                <option value="">Tất cả trạng thái</option>
                {(Object.entries(statusLabels) as [ReturnStatus, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Đơn hàng / Khách</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lý do</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Số tiền hoàn</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày tạo</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Thao tác</th>
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
                ) : returns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      Chưa có yêu cầu hoàn trả nào
                    </td>
                  </tr>
                ) : (
                  returns.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{r.order?.orderCode ?? r.orderId}</p>
                          <p className="text-sm text-gray-500">{r.order?.customerName ?? r.customer?.fullName ?? '-'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {returnReasonLabels[r.reason]}
                        {r.description && <p className="text-gray-500 text-xs mt-1">{r.description}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={statusVariant[r.status]}>{statusLabels[r.status]}</Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {r.refundAmount != null ? formatCurrency(r.refundAmount) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime(r.createdAt)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="p-2 hover:bg-gray-100 rounded-lg"
                            title="Xem chi tiết"
                            onClick={() => setDetailReturn(r)}
                          >
                            <Eye className="w-4 h-4 text-gray-600" />
                          </button>
                          {canProcess && r.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="p-2 hover:bg-green-50 rounded-lg text-green-600"
                                title="Duyệt"
                                onClick={() => {
                                  setApproveReturn(r);
                                  setApproveForm({ refundAmount: r.order?.totalAmount ?? 0, notes: '' });
                                }}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                                title="Từ chối"
                                onClick={() => {
                                  setRejectReturn(r);
                                  setRejectNotes('');
                                }}
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {canProcess && r.status === 'approved' && (
                            <button
                              type="button"
                              className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
                              title="Hoàn tất"
                              onClick={() => {
                                if (window.confirm('Xác nhận hoàn tất hoàn trả?')) completeMutation.mutate(r.id);
                              }}
                              disabled={completeMutation.isPending}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {meta && meta.totalPages > 1 && (
            <div className="px-6 py-4 border-t flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Hiển thị {(meta.page - 1) * meta.limit + 1} - {Math.min(meta.page * meta.limit, meta.total)} / {meta.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page === 1}
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                >
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page === meta.totalPages}
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                >
                  Sau
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal tạo yêu cầu hoàn trả */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tạo yêu cầu hoàn trả" size="md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (createForm.orderId) createMutation.mutate();
          }}
        >
          <Select
            label="Đơn hàng"
            value={createForm.orderId}
            onChange={(e) => setCreateForm({ ...createForm, orderId: e.target.value })}
            required
            options={[
              { value: '', label: 'Chọn đơn hàng...' },
              ...orderOptions.map((o) => ({
                value: o.id,
                label: `${o.orderCode} — ${o.customerName} — ${formatCurrency(o.totalAmount)}`,
              })),
            ]}
          />
          <Select
            label="Lý do hoàn trả"
            value={createForm.reason}
            onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value as ReturnReason })}
            options={(Object.entries(returnReasonLabels) as [ReturnReason, string][]).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Input
            label="Mô tả (tùy chọn)"
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={createMutation.isPending} disabled={!createForm.orderId}>
              Tạo yêu cầu
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal chi tiết */}
      <Modal open={!!detailReturn} onClose={() => setDetailReturn(null)} title="Chi tiết yêu cầu hoàn trả" size="md">
        {detailReturn && (
          <div className="space-y-3 text-sm">
            <p><span className="text-gray-500">Đơn hàng:</span> {detailReturn.order?.orderCode}</p>
            <p><span className="text-gray-500">Khách hàng:</span> {detailReturn.customer?.fullName} — {detailReturn.customer?.email}</p>
            <p><span className="text-gray-500">Lý do:</span> {returnReasonLabels[detailReturn.reason]}</p>
            {detailReturn.description && <p><span className="text-gray-500">Mô tả:</span> {detailReturn.description}</p>}
            <p><span className="text-gray-500">Trạng thái:</span> <Badge variant={statusVariant[detailReturn.status]}>{statusLabels[detailReturn.status]}</Badge></p>
            {detailReturn.refundAmount != null && <p><span className="text-gray-500">Số tiền hoàn:</span> {formatCurrency(detailReturn.refundAmount)}</p>}
            {detailReturn.reviewedAt && <p><span className="text-gray-500">Duyệt lúc:</span> {formatDateTime(detailReturn.reviewedAt)} — {detailReturn.reviewer?.fullName}</p>}
            {detailReturn.reviewNotes && <p><span className="text-gray-500">Ghi chú:</span> {detailReturn.reviewNotes}</p>}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setDetailReturn(null)}>Đóng</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal duyệt */}
      <Modal open={!!approveReturn} onClose={() => setApproveReturn(null)} title="Duyệt yêu cầu hoàn trả" size="md">
        {approveReturn && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              approveMutation.mutate();
            }}
          >
            <p className="text-sm text-gray-600">Đơn: <strong>{approveReturn.order?.orderCode}</strong> — {approveReturn.order?.customerName}</p>
            <Input
              label="Số tiền hoàn (VNĐ)"
              type="number"
              min={0}
              value={approveForm.refundAmount || ''}
              onChange={(e) => setApproveForm({ ...approveForm, refundAmount: Number(e.target.value) || 0 })}
              required
            />
            <Input
              label="Ghi chú (tùy chọn)"
              value={approveForm.notes}
              onChange={(e) => setApproveForm({ ...approveForm, notes: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setApproveReturn(null)}>Hủy</Button>
              <Button type="submit" loading={approveMutation.isPending}>Duyệt</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal từ chối */}
      <Modal open={!!rejectReturn} onClose={() => setRejectReturn(null)} title="Từ chối yêu cầu hoàn trả" size="md">
        {rejectReturn && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              rejectMutation.mutate();
            }}
          >
            <p className="text-sm text-gray-600">Đơn: <strong>{rejectReturn.order?.orderCode}</strong></p>
            <Input
              label="Lý do từ chối (tùy chọn)"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectReturn(null)}>Hủy</Button>
              <Button type="submit" loading={rejectMutation.isPending} variant="outline" className="text-red-600 border-red-300">Từ chối</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
