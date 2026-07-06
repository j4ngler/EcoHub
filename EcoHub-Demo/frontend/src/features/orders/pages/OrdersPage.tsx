import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Filter,
  PackageCheck,
  Plus,
  Search,
  Store,
  Truck,
  Video,
} from 'lucide-react';
import { ordersApi, OrderQueryParams, OrderItem, Order } from '@/api/orders.api';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { formatCurrency, formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/api/axios';

const statusOptions = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'packing', label: 'Đang đóng gói' },
  { value: 'packed', label: 'Đã đóng gói' },
  { value: 'shipping', label: 'Đang giao' },
  { value: 'delivered', label: 'Đã giao' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
  { value: 'returned', label: 'Hoàn trả' },
];

const packingStatusOptions = [
  { value: '', label: 'Tất cả đóng gói' },
  { value: 'unpacked', label: 'Chưa đóng gói' },
  { value: 'packing', label: 'Đang đóng gói' },
  { value: 'packed', label: 'Đã đóng gói' },
];

const shippingReturnOptions = [
  { value: '', label: 'Tất cả gửi/hoàn' },
  { value: 'not_shipped', label: 'Chưa gửi' },
  { value: 'shipping', label: 'Đang gửi' },
  { value: 'delivered', label: 'Đã giao' },
  { value: 'returned', label: 'Hoàn' },
];

const videoStatusOptions = [
  { value: '', label: 'Tất cả video' },
  { value: 'with_video', label: 'Có video' },
  { value: 'without_video', label: 'Chưa có video' },
  { value: 'processing', label: 'Video đang xử lý' },
  { value: 'completed', label: 'Video hoàn tất' },
];

const getTodayInputValue = () => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
};

const getPackingLabel = (order: Order) => {
  if (order.status === 'packing') return 'Đang đóng gói';
  if (order.hasVideo || ['packed', 'shipping', 'delivered', 'completed', 'returned'].includes(order.status)) {
    return 'Đã đóng gói';
  }
  return 'Chưa đóng gói';
};

const getShippingReturnLabel = (order: Order) => {
  if (order.status === 'returned') return 'Hoàn';
  if (order.status === 'shipping') return 'Đang gửi';
  if (['delivered', 'completed'].includes(order.status)) return 'Đã giao';
  return 'Chưa gửi';
};

const getPrimaryRecorder = (order: Order) => order.packageVideos?.[0]?.recorder?.fullName || '-';

export default function OrdersPage() {
  const { user } = useAuthStore();
  const activeShopId = user?.activeShop?.id;
  const canManageAcrossShops =
    user?.roles?.some((role) => ['super_admin', 'admin', 'customer_service'].includes(role)) ?? false;
  const scopedShopId = canManageAcrossShops ? undefined : activeShopId;
  const today = getTodayInputValue();

  const [filters, setFilters] = useState<OrderQueryParams>({
    page: 1,
    limit: 20,
    status: '',
    search: '',
    shopId: scopedShopId,
    startDate: '',
    endDate: '',
    packingStatus: '',
    shippingReturnStatus: '',
    videoStatus: '',
    recordedBy: '',
  });

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      page: 1,
      shopId: scopedShopId,
    }));
  }, [scopedShopId]);

  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState<{
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    notes: string;
    items: Array<{
      productName: string;
      productSku: string;
      quantity: string;
      unitPrice: string;
    }>;
  }>({
    customerName: '',
    customerPhone: '',
    shippingAddress: '',
    notes: '',
    items: [
      {
        productName: '',
        productSku: '',
        quantity: '1',
        unitPrice: '0',
      },
    ],
  });

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['orders', filters],
    queryFn: () => ordersApi.getOrders(filters),
  });

  const orders = data?.data ?? [];

  const shopOptions = useMemo(() => {
    const shops = new Map<string, string>();
    orders.forEach((order) => {
      if (order.shop?.id) {
        shops.set(order.shop.id, `${order.shop.name} (${order.shop.code})`);
      }
    });
    return [{ value: '', label: scopedShopId ? 'Shop đang quản lý' : 'Tất cả shop' }, ...Array.from(shops, ([value, label]) => ({ value, label }))];
  }, [scopedShopId, orders]);

  const recorderOptions = useMemo(() => {
    const recorders = new Map<string, string>();
    orders.forEach((order) => {
      order.packageVideos?.forEach((video) => {
        if (video.recorder?.id) {
          recorders.set(video.recorder.id, video.recorder.fullName || video.recorder.email || video.recorder.id);
        }
      });
    });
    return [{ value: '', label: 'Tất cả nhân viên' }, ...Array.from(recorders, ([value, label]) => ({ value, label }))];
  }, [orders]);

  const summary = useMemo(() => {
    const packed = orders.filter((order) => getPackingLabel(order) === 'Đã đóng gói').length;
    const unpacked = orders.filter((order) => getPackingLabel(order) !== 'Đã đóng gói').length;
    const shippingOrReturn = orders.filter((order) => ['shipping', 'returned'].includes(order.status)).length;
    const withVideo = orders.filter((order) => order.hasVideo).length;
    return { total: data?.meta.total ?? orders.length, packed, unpacked, shippingOrReturn, withVideo };
  }, [data?.meta.total, orders]);

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!activeShopId) {
        throw new Error('Vui lòng chọn shop để quản lý trước khi tạo đơn hàng');
      }

      if (!form.customerName || !form.customerPhone || !form.shippingAddress) {
        throw new Error('Vui lòng nhập đầy đủ thông tin khách hàng và địa chỉ');
      }

      const items: OrderItem[] = form.items
        .map((it) => ({
          productName: it.productName.trim(),
          productSku: it.productSku.trim() || undefined,
          quantity: Number(it.quantity || '0'),
          unitPrice: Number(it.unitPrice || '0'),
        }))
        .filter((it) => it.productName && it.quantity > 0 && it.unitPrice > 0);

      if (items.length === 0) {
        throw new Error('Đơn hàng phải có ít nhất 1 sản phẩm hợp lệ');
      }

      return ordersApi.createOrder({
        shopId: activeShopId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: undefined,
        shippingAddress: form.shippingAddress,
        shippingProvince: undefined,
        shippingDistrict: undefined,
        shippingWard: undefined,
        carrierId: undefined,
        trackingCode: undefined,
        shippingFee: 0,
        codAmount: 0,
        discountAmount: 0,
        paymentMethod: undefined,
        notes: form.notes || undefined,
        items,
      });
    },
    onSuccess: () => {
      toast.success('Tạo đơn hàng thành công');
      setOpenCreate(false);
      setForm({
        customerName: '',
        customerPhone: '',
        shippingAddress: '',
        notes: '',
        items: [{ productName: '', productSku: '', quantity: '1', unitPrice: '0' }],
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: any) => {
      const message = getErrorMessage(error) || error?.message || 'Tạo đơn hàng thất bại';
      toast.error(message);
    },
  });

  const updateFilter = (patch: Partial<OrderQueryParams>) => {
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));
  };

  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { productName: '', productSku: '', quantity: '1', unitPrice: '0' }],
    }));
  };

  const handleChangeItem = (
    index: number,
    field: 'productName' | 'productSku' | 'quantity' | 'unitPrice',
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? { ...it, [field]: value } : it)),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Đơn hàng</h1>
          <p className="text-gray-500">
            Theo dõi đơn, shop, trạng thái đóng gói, gửi/hoàn và video theo phạm vi được cấp.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Tạo đơn hàng
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={Store} label="Tổng đơn" value={summary.total} />
        <SummaryCard icon={PackageCheck} label="Đã đóng gói" value={summary.packed} tone="green" />
        <SummaryCard icon={Clock} label="Chưa/đang đóng gói" value={summary.unpacked} tone="amber" />
        <SummaryCard icon={Truck} label="Đang gửi/hoàn" value={summary.shippingOrReturn} tone="blue" />
        <SummaryCard icon={Video} label="Có video" value={summary.withVideo} tone="purple" />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(160px,190px))]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm mã đơn, mã vận đơn, khách hàng, số điện thoại..."
                className="input pl-10"
                value={filters.search}
                onChange={(e) => updateFilter({ search: e.target.value })}
              />
            </div>
            <Select options={statusOptions} value={filters.status} onChange={(e) => updateFilter({ status: e.target.value })} />
            <Select
              options={packingStatusOptions}
              value={filters.packingStatus}
              onChange={(e) => updateFilter({ packingStatus: e.target.value })}
            />
            <Select
              options={shippingReturnOptions}
              value={filters.shippingReturnStatus}
              onChange={(e) => updateFilter({ shippingReturnStatus: e.target.value })}
            />
            <Select options={videoStatusOptions} value={filters.videoStatus} onChange={(e) => updateFilter({ videoStatus: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Select
              options={shopOptions}
              value={filters.shopId || ''}
              onChange={(e) => updateFilter({ shopId: e.target.value || undefined })}
              disabled={!!scopedShopId}
            />
            <Select
              options={recorderOptions}
              value={filters.recordedBy || ''}
              onChange={(e) => updateFilter({ recordedBy: e.target.value || undefined })}
            />
            <input
              type="date"
              className="input"
              value={filters.startDate || ''}
              onChange={(e) => updateFilter({ startDate: e.target.value })}
            />
            <input
              type="date"
              className="input"
              value={filters.endDate || ''}
              onChange={(e) => updateFilter({ endDate: e.target.value })}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => updateFilter({ startDate: today, endDate: today })}>
                Hôm nay
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() =>
                  setFilters({
                    page: 1,
                    limit: 20,
                    status: '',
                    search: '',
                    shopId: scopedShopId,
                    startDate: '',
                    endDate: '',
                    packingStatus: '',
                    shippingReturnStatus: '',
                    videoStatus: '',
                    recordedBy: '',
                  })
                }
              >
                Xóa lọc
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter className="h-4 w-4" />
            Bộ lọc này phục vụ yêu cầu: ngày, shop, nhân viên đóng gói, trạng thái đóng gói, gửi/hoàn và video.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px]">
              <thead>
                <tr className="border-b bg-gray-50">
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Shop / Kênh</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Mã vận đơn</TableHead>
                  <TableHead>Giá trị</TableHead>
                  <TableHead>Trạng thái đơn</TableHead>
                  <TableHead>Đóng gói</TableHead>
                  <TableHead>Gửi / hoàn</TableHead>
                  <TableHead>Video</TableHead>
                  <TableHead>Nhân viên đóng gói</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={12} className="px-4 py-4">
                        <div className="h-4 animate-pulse rounded bg-gray-200" />
                      </td>
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                      Không có đơn hàng nào
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const statusConfig = ORDER_STATUS_BADGES[order.status];
                    const packingLabel = getPackingLabel(order);
                    const shippingReturnLabel = getShippingReturnLabel(order);
                    const primaryVideo = order.packageVideos?.[0];

                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <Link to={`/orders/${order.id}`} className="font-medium text-primary-600 hover:text-primary-700">
                            {order.orderCode}
                          </Link>
                          {order.channelOrderId && <p className="mt-1 text-xs text-gray-400">Sàn: {order.channelOrderId}</p>}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-900">{order.shop?.name || '-'}</p>
                          <p className="text-xs text-gray-500">{order.channel?.name || order.channel?.code || 'Nội bộ'}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-900">{order.customerName}</p>
                          <p className="text-sm text-gray-500">{order.customerPhone}</p>
                        </td>
                        <td className="px-4 py-4">
                          {order.trackingCode ? (
                            <span className="rounded bg-gray-100 px-2 py-1 font-mono text-sm">{order.trackingCode}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                          {order.carrier?.name && <p className="mt-1 text-xs text-gray-500">{order.carrier.name}</p>}
                        </td>
                        <td className="px-4 py-4 font-medium">{formatCurrency(order.totalAmount)}</td>
                        <td className="px-4 py-4">
                          <Badge variant={statusConfig?.variant || 'default'}>{statusConfig?.label || order.status}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <StatusPill label={packingLabel} />
                          {order.packedAt && <p className="mt-1 text-xs text-gray-500">{formatDateTime(order.packedAt)}</p>}
                        </td>
                        <td className="px-4 py-4">
                          <StatusPill label={shippingReturnLabel} />
                          {order.shippedAt && <p className="mt-1 text-xs text-gray-500">Gửi: {formatDateTime(order.shippedAt)}</p>}
                        </td>
                        <td className="px-4 py-4">
                          {order.hasVideo ? (
                            <div className="text-green-700">
                              <span className="inline-flex items-center">
                                <Video className="mr-1 h-4 w-4" />
                                Có video
                              </span>
                              {primaryVideo?.processingStatus && (
                                <p className="mt-1 text-xs text-gray-500">{primaryVideo.processingStatus}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">Chưa có</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">{getPrimaryRecorder(order)}</td>
                        <td className="px-4 py-4 text-sm text-gray-500">{formatDateTime(order.createdAt)}</td>
                        <td className="px-4 py-4">
                          <Link to={`/orders/${order.id}`} className="inline-flex rounded-lg p-2 hover:bg-gray-100">
                            <Eye className="h-4 w-4 text-gray-500" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {data && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-6 py-4">
              <p className="text-sm text-gray-500">
                Hiển thị {(data.meta.page - 1) * data.meta.limit + 1} - {Math.min(data.meta.page * data.meta.limit, data.meta.total)} trong{' '}
                {data.meta.total} đơn hàng
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.meta.page === 1}
                  onClick={() => setFilters({ ...filters, page: filters.page! - 1 })}
                >
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.meta.page === data.meta.totalPages}
                  onClick={() => setFilters({ ...filters, page: filters.page! + 1 })}
                >
                  Sau
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={openCreate} onClose={() => setOpenCreate(false)} title="Tạo đơn hàng mới" size="xl">
        {!activeShopId && (
          <p className="mb-4 text-sm text-red-600">
            Vui lòng chọn shop để quản lý trước khi tạo đơn hàng.
          </p>
        )}
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Tên khách hàng" required value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} />
            <TextField label="Số điện thoại" required value={form.customerPhone} onChange={(value) => setForm({ ...form, customerPhone: value })} />
          </div>

          <TextField label="Địa chỉ giao hàng" required value={form.shippingAddress} onChange={(value) => setForm({ ...form, shippingAddress: value })} />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ghi chú</label>
            <textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Sản phẩm trong đơn</h3>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="mr-1 h-4 w-4" />
                Thêm dòng sản phẩm
              </Button>
            </div>

            <div className="space-y-2">
              {form.items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <TextField label="Tên sản phẩm" value={item.productName} onChange={(value) => handleChangeItem(index, 'productName', value)} />
                  </div>
                  <TextField label="SKU" value={item.productSku} onChange={(value) => handleChangeItem(index, 'productSku', value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Số lượng" type="number" value={item.quantity} onChange={(value) => handleChangeItem(index, 'quantity', value)} />
                    <TextField label="Đơn giá" type="number" value={item.unitPrice} onChange={(value) => handleChangeItem(index, 'unitPrice', value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t pt-2">
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              Hủy
            </Button>
            <Button type="button" disabled={createOrderMutation.isPending || !activeShopId} onClick={() => createOrderMutation.mutate()}>
              {createOrderMutation.isPending ? 'Đang tạo...' : 'Tạo đơn hàng'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = 'slate',
}: {
  icon: typeof Store;
  label: string;
  value: number;
  tone?: 'slate' | 'green' | 'amber' | 'blue' | 'purple';
}) {
  const toneClass = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-violet-100 text-violet-700',
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`rounded-xl p-3 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{children}</th>;
}

function StatusPill({ label }: { label: string }) {
  const className =
    label === 'Đã đóng gói' || label === 'Đã giao'
      ? 'bg-emerald-50 text-emerald-700'
      : label === 'Đang đóng gói' || label === 'Đang gửi'
        ? 'bg-blue-50 text-blue-700'
        : label === 'Hoàn'
          ? 'bg-rose-50 text-rose-700'
          : 'bg-gray-100 text-gray-700';

  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function TextField({
  label,
  value,
  onChange,
  required,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input type={type} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
