import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { ordersApi, OrderQueryParams } from '@/api/orders.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { formatCurrency, formatDateTime } from '@/utils/format';

export default function OrdersPage() {
  const [filters, setFilters] = useState<OrderQueryParams>({
    page: 1,
    limit: 10,
    status: '',
    search: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['orders', filters],
    queryFn: () => ordersApi.getOrders(filters),
  });

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
        <Button>
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
    </div>
  );
}
