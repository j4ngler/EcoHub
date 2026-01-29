import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Video,
  MoreVertical,
  Download
} from 'lucide-react';
import { ordersApi, OrderQueryParams, OrderItem } from '@/api/orders.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { formatCurrency, formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/api/axios';

export default function OrdersPage() {
  const { user } = useAuthStore();
  const activeShopId = user?.activeShop?.id;

  const [filters, setFilters] = useState<OrderQueryParams>({
    page: 1,
    limit: 10,
    status: '',
    search: '',
    shopId: activeShopId,
  });

  useEffect(() => {
    // Khi đổi shop đang quản lý thì reset filter theo shop đó
    setFilters((prev) => ({
      ...prev,
      page: 1,
      shopId: activeShopId,
    }));
  }, [activeShopId]);

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
        items: [
          {
            productName: '',
            productSku: '',
            quantity: '1',
            unitPrice: '0',
          },
        ],
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: any) => {
      const message = getErrorMessage(error) || error?.message || 'Tạo đơn hàng thất bại';
      toast.error(message);
    },
  });

  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { productName: '', productSku: '', quantity: '1', unitPrice: '0' },
      ],
    }));
  };

  const handleChangeItem = (
    index: number,
    field: 'productName' | 'productSku' | 'quantity' | 'unitPrice',
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) =>
        i === index
          ? {
              ...it,
              [field]: value,
            }
          : it
      ),
    }));
  };

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
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Đơn hàng</h1>
          <p className="text-gray-500">Quản lý tất cả đơn hàng</p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Tạo đơn hàng
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
                  placeholder="Tìm theo mã đơn, mã vận đơn, tên khách hàng..."
                  className="input pl-10"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Select
                options={statusOptions}
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
              />
            </div>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Bộ lọc
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Xuất Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Orders table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mã đơn
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Khách hàng
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mã vận đơn
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Giá trị
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Video
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ngày tạo
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : data?.data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      Không có đơn hàng nào
                    </td>
                  </tr>
                ) : (
                  data?.data.map((order) => {
                    const statusConfig = ORDER_STATUS_BADGES[order.status];
                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <Link 
                            to={`/orders/${order.id}`}
                            className="font-medium text-primary-600 hover:text-primary-700"
                          >
                            {order.orderCode}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{order.customerName}</p>
                            <p className="text-sm text-gray-500">{order.customerPhone}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {order.trackingCode ? (
                            <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                              {order.trackingCode}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {formatCurrency(order.totalAmount)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={statusConfig?.variant || 'default'}>
                            {statusConfig?.label || order.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          {order.hasVideo ? (
                            <span className="inline-flex items-center text-green-600">
                              <Video className="w-4 h-4 mr-1" />
                              Có
                            </span>
                          ) : (
                            <span className="text-gray-400">Chưa có</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {formatDateTime(order.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            to={`/orders/${order.id}`}
                            className="p-2 hover:bg-gray-100 rounded-lg inline-flex"
                          >
                            <Eye className="w-4 h-4 text-gray-500" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.meta.totalPages > 1 && (
            <div className="px-6 py-4 border-t flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Hiển thị {(data.meta.page - 1) * data.meta.limit + 1} -{' '}
                {Math.min(data.meta.page * data.meta.limit, data.meta.total)} trong {data.meta.total} đơn hàng
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

      {/* Create order modal */}
      <Modal open={openCreate} onClose={() => setOpenCreate(false)} title="Tạo đơn hàng mới" size="xl">
        {!activeShopId && (
          <p className="mb-4 text-sm text-red-600">
            Vui lòng chọn shop để quản lý trước (vào trang Shop và bấm &quot;Quản lý shop này&quot;).
          </p>
        )}
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tên khách hàng <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Số điện thoại <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input"
                value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Địa chỉ giao hàng <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input"
              value={form.shippingAddress}
              onChange={(e) => setForm({ ...form, shippingAddress: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea
              className="input min-h-[80px]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Sản phẩm trong đơn</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
              >
                <Plus className="w-4 h-4 mr-1" />
                Thêm dòng sản phẩm
              </Button>
            </div>

            <div className="space-y-2">
              {form.items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tên sản phẩm
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={item.productName}
                      onChange={(e) =>
                        handleChangeItem(index, 'productName', e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SKU
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={item.productSku}
                      onChange={(e) =>
                        handleChangeItem(index, 'productSku', e.target.value)
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Số lượng
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="input"
                        value={item.quantity}
                        onChange={(e) =>
                          handleChangeItem(index, 'quantity', e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Đơn giá (VNĐ)
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="input"
                        value={item.unitPrice}
                        onChange={(e) =>
                          handleChangeItem(index, 'unitPrice', e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenCreate(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={createOrderMutation.isPending || !activeShopId}
              onClick={() => createOrderMutation.mutate()}
            >
              {createOrderMutation.isPending ? 'Đang tạo...' : 'Tạo đơn hàng'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
