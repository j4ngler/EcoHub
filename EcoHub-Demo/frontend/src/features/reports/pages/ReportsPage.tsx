import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Download,
  Package,
  RefreshCw,
  ShoppingCart,
  Truck,
  Users,
  Video,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import toast from 'react-hot-toast';
import { reportsApi, ReportParams } from '@/api/reports.api';
import { getErrorMessage } from '@/api/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import { formatCurrency, formatNumber } from '@/utils/format';

type Tab = 'operational' | 'financial';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('operational');
  const [filters, setFilters] = useState<ReportParams>({
    startDate: '',
    endDate: '',
    orderStatus: '',
    staffId: '',
  });
  const queryClient = useQueryClient();

  const cleanedFilters = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')
  ) as ReportParams;

  const { data: dashboard } = useQuery({
    queryKey: ['dashboard', cleanedFilters],
    queryFn: () => reportsApi.getDashboard(cleanedFilters),
  });

  const { data: operationalReport } = useQuery({
    queryKey: ['operationalReport', cleanedFilters],
    queryFn: () => reportsApi.getOperationalReport(cleanedFilters),
  });

  const { data: staffPerformance } = useQuery({
    queryKey: ['staffPerformance', cleanedFilters],
    queryFn: () => reportsApi.getStaffPerformance(cleanedFilters),
  });

  const { data: revenueReport } = useQuery({
    queryKey: ['revenueReport', cleanedFilters],
    queryFn: () => reportsApi.getRevenueReport(cleanedFilters),
  });

  const syncNowMutation = useMutation({
    mutationFn: () => reportsApi.syncNow(['shopee', 'tiktok']),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['operationalReport'] });
      queryClient.invalidateQueries({ queryKey: ['staffPerformance'] });
      queryClient.invalidateQueries({ queryKey: ['revenueReport'] });
      toast.success(`Đã đồng bộ: ${data.total.synced} đơn, tạo mới ${data.total.created}, cập nhật ${data.total.updated}`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const exportMutation = useMutation({
    mutationFn: () => reportsApi.exportReport({ ...cleanedFilters, type: activeTab, format: 'json' }),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecohub-report-${activeTab}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Đã xuất báo cáo');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const operationalDailyData = (operationalReport?.daily || []).map((row) => ({
    date: row.date,
    total: row.orders.total,
    packed: row.orders.packed || 0,
    unpacked: row.orders.unpacked || 0,
    shipping: row.orders.shipping,
    returned: row.orders.returned || 0,
    receivingVideos: row.receivingVideos.total,
  }));

  const staffChartData = (staffPerformance?.staff || []).map((staff: any) => ({
    name: staff.name,
    videos: staff.totalVideos,
    rate: staff.approvalRate,
  }));

  const statusOptions = [
    '',
    'pending',
    'confirmed',
    'packing',
    'packed',
    'shipping',
    'delivered',
    'completed',
    'returned',
    'cancelled',
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Báo cáo</h1>
          <p className="text-gray-500">Theo dõi đơn trong ngày, đóng gói theo nhân viên, gửi/hoàn và doanh thu.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            className="input"
            value={filters.startDate || ''}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          />
          <input
            type="date"
            className="input"
            value={filters.endDate || ''}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          />
          <select
            className="input"
            value={filters.orderStatus || ''}
            onChange={(e) => setFilters({ ...filters, orderStatus: e.target.value })}
          >
            {statusOptions.map((status) => (
              <option key={status || 'all'} value={status}>
                {status ? ORDER_STATUS_BADGES[status]?.label || status : 'Tất cả trạng thái'}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => syncNowMutation.mutate()} disabled={syncNowMutation.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncNowMutation.isPending ? 'animate-spin' : ''}`} />
            Đồng bộ
          </Button>
          <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            <Download className="mr-2 h-4 w-4" />
            Xuất báo cáo
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <div className="border-b px-6">
          <nav className="flex gap-8">
            <TabButton active={activeTab === 'operational'} onClick={() => setActiveTab('operational')}>
              Báo cáo vận hành
            </TabButton>
            <TabButton active={activeTab === 'financial'} onClick={() => setActiveTab('financial')}>
              Báo cáo tài chính
            </TabButton>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'operational' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={ShoppingCart} label="Tổng đơn" value={dashboard?.summary.orders.total || 0} />
                <MetricCard icon={Package} label="Chưa đóng gói" value={dashboard?.summary.videos.unpacked || 0} />
                <MetricCard icon={Video} label="Đã đóng gói" value={dashboard?.summary.videos.packed || 0} />
                <MetricCard icon={Truck} label="Đang gửi/hoàn" value={(dashboard?.summary.orders.shipping || 0) + countStatus(dashboard?.shippingReturnSummary, 'returned')} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Vận hành theo ngày
                  </CardTitle>
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
                        <Bar dataKey="total" name="Tổng đơn" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="packed" name="Đã đóng gói" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="unpacked" name="Chưa đóng gói" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="returned" name="Hoàn" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Chi tiết theo ngày</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="py-2 pr-4">Ngày</th>
                            <th className="py-2 pr-4">Tổng đơn</th>
                            <th className="py-2 pr-4">Đã đóng gói</th>
                            <th className="py-2 pr-4">Chưa đóng gói</th>
                            <th className="py-2 pr-4">Đang gửi</th>
                            <th className="py-2 pr-4">Hoàn</th>
                            <th className="py-2 pr-4">Video mở hàng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(operationalReport?.daily || []).map((row) => (
                            <tr key={row.date} className="border-b last:border-b-0">
                              <td className="py-2 pr-4 font-medium">{row.date}</td>
                              <td className="py-2 pr-4">{formatNumber(row.orders.total)}</td>
                              <td className="py-2 pr-4">{formatNumber(row.orders.packed || 0)}</td>
                              <td className="py-2 pr-4">{formatNumber(row.orders.unpacked || 0)}</td>
                              <td className="py-2 pr-4">{formatNumber(row.orders.shipping)}</td>
                              <td className="py-2 pr-4">{formatNumber(row.orders.returned || 0)}</td>
                              <td className="py-2 pr-4">{formatNumber(row.receivingVideos.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Đóng gói theo nhân viên
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {(staffPerformance?.staff || []).length === 0 ? (
                      <p className="py-8 text-center text-gray-500">Chưa có dữ liệu</p>
                    ) : (
                      <>
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={staffChartData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis yAxisId="left" orientation="left" stroke="#10b981" />
                              <YAxis yAxisId="right" orientation="right" stroke="#6366f1" unit="%" />
                              <Tooltip />
                              <Legend />
                              <Bar yAxisId="left" dataKey="videos" name="Số video đóng gói" fill="#10b981" radius={[4, 4, 0, 0]} />
                              <Bar yAxisId="right" dataKey="rate" name="Tỷ lệ duyệt" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-3">
                          {staffPerformance?.staff.map((staff: any) => (
                            <button
                              key={staff.id}
                              type="button"
                              className={`w-full rounded-lg border p-3 text-left transition hover:bg-emerald-50 ${
                                filters.staffId === staff.id ? 'border-emerald-500 bg-emerald-50' : ''
                              }`}
                              onClick={() => setFilters({ ...filters, staffId: filters.staffId === staff.id ? '' : staff.id })}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-gray-900">{staff.name}</p>
                                  <p className="text-xs text-gray-500">{staff.email}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold">{formatNumber(staff.totalVideos)} video</p>
                                  <p className="text-xs text-gray-500">Duyệt {staff.approvalRate}%</p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <MetricCard
                  icon={ShoppingCart}
                  label="Số đơn hoàn tất"
                  value={revenueReport?.summary?.orderCount || 0}
                />
                <MetricCard
                  icon={BarChart3}
                  label="Tổng doanh thu"
                  value={formatCurrency(revenueReport?.summary?.totalRevenue || 0)}
                />
                <MetricCard
                  icon={Truck}
                  label="Phí vận chuyển"
                  value={formatCurrency(revenueReport?.summary?.totalShippingFee || 0)}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Doanh thu theo kênh bán hàng</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueReport?.byChannel || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="channelName" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="revenue" name="Doanh thu" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 py-4 text-sm font-medium ${
        active ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{typeof value === 'number' ? formatNumber(value) : value}</p>
          </div>
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600">
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function countStatus(items: Array<{ status: string; count: number }> | undefined, status: string) {
  return items?.find((item) => item.status === status)?.count || 0;
}
