import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart,
  Video,
  Users,
  Download
} from 'lucide-react';
import { reportsApi } from '@/api/reports.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatCurrency, formatNumber } from '@/utils/format';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });

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
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Xuất báo cáo
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                <p className="text-sm text-gray-500">Đơn trung bình</p>
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
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order status pie chart */}
        <Card>
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
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff performance */}
      <Card>
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
                    <td className="px-6 py-4">
                      {formatNumber(staff.approvedVideos)}
                    </td>
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
    </div>
  );
}
