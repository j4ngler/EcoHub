import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart,
  Video,
  Users,
  Download,
  Truck,
  Package,
  RefreshCw
} from 'lucide-react';
import { reportsApi } from '@/api/reports.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatCurrency, formatNumber } from '@/utils/format';
import { getErrorMessage } from '@/api/axios';
import toast from 'react-hot-toast';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'financial' | 'operational'>('financial');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });

  const queryClient = useQueryClient();

  const { data: dashboard } = useQuery({
    queryKey: ['dashboard', dateRange],
    queryFn: () => reportsApi.getDashboard(dateRange),
  });

  const { data: orderReport } = useQuery({
    queryKey: ['orderReport', dateRange],
    queryFn: () => reportsApi.getOrderReport(dateRange),
  });

  const { data: revenueReport } = useQuery({
    queryKey: ['revenueReport', dateRange],
    queryFn: () => reportsApi.getRevenueReport(dateRange),
  });

  const { data: staffPerformance } = useQuery({
    queryKey: ['staffPerformance', dateRange],
    queryFn: () => reportsApi.getStaffPerformance(dateRange),
  });

  const { data: operationalReport } = useQuery({
    queryKey: ['operationalReport', dateRange],
    queryFn: () => reportsApi.getOperationalReport(dateRange),
  });

  const syncNowMutation = useMutation({
    mutationFn: () => reportsApi.syncNow(['shopee', 'tiktok']),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['orderReport'] });
      queryClient.invalidateQueries({ queryKey: ['revenueReport'] });
      queryClient.invalidateQueries({ queryKey: ['staffPerformance'] });
      queryClient.invalidateQueries({ queryKey: ['operationalReport'] });
      toast.success(`Đã đồng bộ: ${data.total.synced} đơn (tạo ${data.total.created}, cập nhật ${data.total.updated})`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const exportMutation = useMutation({
    mutationFn: () => reportsApi.exportReport({ ...dateRange, type: 'dashboard', format: 'json' }),
    onSuccess: (data) => {
      toast.success('Đã xuất báo cáo');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `baocao-${dateRange.startDate || 'all'}-${dateRange.endDate || 'all'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Prepare chart data
  const orderStatusData = dashboard?.ordersByStatus?.map((item, index) => ({
    name: item.status,
    value: item.count,
    color: COLORS[index % COLORS.length],
  })) || [];

  const channelRevenueData = revenueReport?.byChannel?.map((item: any) => ({
    name: item.channelName,
    revenue: item.revenue,
    orders: item.orderCount,
  })) || [];

  const storageSummary = dashboard?.summary?.storage;
  const largestVideos = dashboard?.storage?.largestVideos || [];
  const formatVideoStorage = (usedBytes: number, totalBytes: number) => {
    const GB = 1024 ** 3;
    const MB = 1024 ** 2;
    if (usedBytes < GB) {
      return `${(usedBytes / MB).toFixed(1)} MB / ${(totalBytes / GB).toFixed(1)} GB`;
    }
    return `${(usedBytes / GB).toFixed(2)} / ${(totalBytes / GB).toFixed(1)} GB`;
  };

  const operationalDailyData = (operationalReport?.daily || []).map((d) => ({
    date: d.date,
    orders: d.orders.total,
    videosProcessed: d.videos.processed,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Báo cáo</h1>
          <p className="text-gray-500">Thống kê và phân tích dữ liệu</p>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            className="input"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
          />
          <input
            type="date"
            className="input"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
          />
          {activeTab === 'operational' && (
            <Button
              variant="outline"
              onClick={() => syncNowMutation.mutate()}
              disabled={syncNowMutation.isPending}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncNowMutation.isPending ? 'animate-spin' : ''}`} />
              Cập nhật dữ liệu
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <Download className={`w-4 h-4 mr-2 ${exportMutation.isPending ? 'animate-spin' : ''}`} />
            Xuất báo cáo
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('financial')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'financial'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Báo cáo Tài chính
            </button>
            <button
              onClick={() => setActiveTab('operational')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'operational'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Báo cáo Vận hành
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'financial' ? (
            <>
              {/* Financial Reports */}
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Tổng doanh thu</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatCurrency(revenueReport?.summary?.totalRevenue || 0)}
                        </p>
                      </div>
                      <div className="p-3 bg-green-100 rounded-xl">
                        <DollarSign className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Số đơn hàng</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatNumber(revenueReport?.summary?.orderCount || 0)}
                        </p>
                      </div>
                      <div className="p-3 bg-blue-100 rounded-xl">
                        <ShoppingCart className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Giá trị đơn TB</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatCurrency(revenueReport?.summary?.averageOrderValue || 0)}
                        </p>
                      </div>
                      <div className="p-3 bg-yellow-100 rounded-xl">
                        <TrendingUp className="w-6 h-6 text-yellow-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Phí vận chuyển</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatCurrency(revenueReport?.summary?.totalShippingFee || 0)}
                        </p>
                      </div>
                      <div className="p-3 bg-purple-100 rounded-xl">
                        <Truck className="w-6 h-6 text-purple-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Revenue by channel */}
              <Card>
                <CardHeader>
                  <CardTitle>Doanh thu theo kênh bán hàng</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channelRevenueData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* Operational Reports */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Vận hành theo ngày</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={operationalDailyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="orders" name="Đơn hàng" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="videosProcessed" name="Video đã xử lý" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Tổng đơn hàng</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatNumber(dashboard?.summary?.orders?.total || 0)}
                        </p>
                      </div>
                      <div className="p-3 bg-blue-100 rounded-xl">
                        <ShoppingCart className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Video đã xử lý</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatNumber(dashboard?.summary?.videos?.processed || 0)}
                        </p>
                      </div>
                      <div className="p-3 bg-purple-100 rounded-xl">
                        <Video className="w-6 h-6 text-purple-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Đơn chưa đóng gói</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatNumber(
                            (dashboard?.summary?.orders?.total || 0) - (dashboard?.summary?.videos?.total || 0)
                          )}
                        </p>
                      </div>
                      <div className="p-3 bg-amber-100 rounded-xl">
                        <Package className="w-6 h-6 text-amber-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Dung lượng video</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {storageSummary
                            ? formatVideoStorage(storageSummary.usedBytes, storageSummary.totalBytes)
                            : '0 / 0 GB'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Đã dùng: {storageSummary ? storageSummary.usedPercent.toFixed(1) : '0'}%
                        </p>
                      </div>
                      <div className="p-3 rounded-xl"
                        style={{
                          backgroundColor:
                            storageSummary?.status === 'critical'
                              ? '#fee2e2'
                              : storageSummary?.status === 'warning'
                              ? '#fef3c7'
                              : '#e0f2fe',
                        }}
                      >
                        <Video className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Chi tiết theo ngày</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2 pr-4">Ngày</th>
                          <th className="py-2 pr-4">Đơn</th>
                          <th className="py-2 pr-4">Video</th>
                          <th className="py-2 pr-4">Video đã xử lý</th>
                          <th className="py-2 pr-4">Video lỗi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(operationalReport?.daily || []).map((row) => (
                          <tr key={row.date} className="border-b last:border-b-0">
                            <td className="py-2 pr-4 font-medium text-gray-900">{row.date}</td>
                            <td className="py-2 pr-4">{formatNumber(row.orders.total)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.videos.total)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.videos.processed)}</td>
                            <td className="py-2 pr-4">{formatNumber(row.videos.failed)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Order status pie chart */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Phân bổ đơn hàng theo trạng thái</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={orderStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {orderStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 mt-4">
                    {orderStatusData.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-gray-600">
                          {item.name}: {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Staff performance */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Hiệu suất nhân viên
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Nhân viên
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Tổng video
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Đã phê duyệt
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Tỷ lệ duyệt
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {staffPerformance?.staff?.map((staff: any) => (
                          <tr key={staff.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                                  <span className="font-medium text-primary-600 text-sm">
                                    {staff.name?.charAt(0) || '?'}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">{staff.name}</p>
                                  <p className="text-sm text-gray-500">{staff.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-medium">
                              {formatNumber(staff.totalVideos)}
                            </td>
                            <td className="px-6 py-4">{formatNumber(staff.approvedVideos)}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-green-500 h-2 rounded-full"
                                    style={{ width: `${staff.approvalRate}%` }}
                                  />
                                </div>
                                <span className="text-sm text-gray-600">{staff.approvalRate}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Storage detail - largest videos */}
              <Card>
                <CardHeader>
                  <CardTitle>Video dung lượng lớn (gần đầy kho)</CardTitle>
                </CardHeader>
                <CardContent>
                  {largestVideos.length === 0 ? (
                    <p className="text-sm text-gray-500">Chưa có dữ liệu video.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Mã đơn / Mã vận đơn
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Dung lượng
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Thời gian tạo
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {largestVideos.map((v: any) => (
                            <tr key={v.id}>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                <div className="font-medium">{v.orderCode}</div>
                                <div className="text-xs text-gray-500">{v.trackingCode}</div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                {(v.totalSizeBytes / (1024 ** 2)).toFixed(1)} MB
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-500">
                                {new Date(v.createdAt).toLocaleString('vi-VN')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
