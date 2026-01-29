import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  Package,
  Video,
  DollarSign,
  TrendingUp,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { reportsApi } from '@/api/reports.api';
import { videosApi } from '@/api/videos.api';
import { useAuthStore } from '@/store/authStore';
import StatCard from '@/components/dashboard/StatCard';
import VideoCard from '@/components/dashboard/VideoCard';
import ActivityCard from '@/components/dashboard/ActivityCard';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import { formatCurrency, formatRelativeTime } from '@/utils/format';

const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.getDashboard(),
  });

  const { data: videosData } = useQuery({
    queryKey: ['videos-recent'],
    queryFn: () => videosApi.getVideos({ page: 1, limit: 5 }),
  });

  const recentVideos = videosData?.data ?? [];
  const summary = dashboard?.summary;
  const recentOrders = dashboard?.recentOrders ?? [];
  const ordersByStatus = dashboard?.ordersByStatus ?? [];

  const activities = [
    ...recentOrders.slice(0, 3).map((o) => ({
      type: 'order' as const,
      message: `Đơn hàng ${o.orderCode} — ${o.customerName}`,
      time: formatRelativeTime(o.createdAt),
      user: 'Hệ thống',
    })),
    { type: 'approve' as const, message: 'Video đã được duyệt', time: '1 giờ trước', user: 'Admin' },
    { type: 'upload' as const, message: 'Video mới đã tải lên', time: '2 giờ trước', user: 'Staff' },
  ].slice(0, 5);

  const pieData = ordersByStatus.map((item: { status: string; count: number }, i: number) => ({
    name: ORDER_STATUS_BADGES[item.status]?.label || item.status,
    value: item.count,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome banner - EcoVision style */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Chào {user?.fullName || 'bạn'}!</h2>
            <p className="text-emerald-100 max-w-2xl">
              Tổng quan hoạt động đóng gói và video. Theo dõi đơn hàng, video đã xử lý và doanh thu.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex-shrink-0">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{formatCurrency(summary?.revenue?.total || 0)}</div>
              <div className="text-emerald-100 text-sm">Doanh thu</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid - StatCard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Tổng đơn hàng"
          value={summary?.orders?.total ?? 0}
          icon={ShoppingCart}
          color="emerald"
          trend=""
        />
        <StatCard
          title="Đơn chờ xử lý"
          value={summary?.orders?.pending ?? 0}
          icon={Clock}
          color="amber"
          trend=""
        />
        <StatCard
          title="Video đã xử lý"
          value={summary?.videos?.processed ?? 0}
          icon={Video}
          color="blue"
          trend=""
        />
        <StatCard
          title="Doanh thu"
          value={formatCurrency(summary?.revenue?.total ?? 0)}
          icon={DollarSign}
          color="purple"
          trend=""
        />
        <StatCard
          title="Sản phẩm"
          value={summary?.products?.total ?? 0}
          icon={Package}
          color="indigo"
          trend=""
        />
        <StatCard
          title="Sắp hết hàng"
          value={summary?.products?.lowStock ?? 0}
          icon={TrendingUp}
          color="rose"
          trend=""
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800">Phân bổ đơn hàng</h3>
          </div>
          <div className="h-80">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value, 'Số đơn']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                Chưa có dữ liệu
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800">Đơn hàng theo trạng thái</h3>
          </div>
          <div className="space-y-3">
            {ordersByStatus.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Chưa có dữ liệu</p>
            ) : (
              ordersByStatus.map((item: { status: string; count: number }) => {
                const cfg = ORDER_STATUS_BADGES[item.status];
                const total = (summary?.orders?.total as number) || 1;
                const pct = ((item.count / total) * 100).toFixed(1);
                return (
                  <div key={item.status} className="flex items-center justify-between gap-2">
                    <Badge variant={cfg?.variant || 'default'}>{cfg?.label || item.status}</Badge>
                    <div className="flex-1 max-w-[120px] h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 w-16 text-right">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent videos & Activities - EcoVision style */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-800">Video gần đây</h3>
            <Link
              to="/videos"
              className="text-emerald-600 hover:text-emerald-700 font-medium text-sm flex items-center gap-1"
            >
              Xem tất cả
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-4">
            {recentVideos.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Chưa có video nào</p>
            ) : (
              recentVideos.map((video) => (
                <VideoCard key={video.id} video={video} showActions={false} />
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-800">Hoạt động gần đây</h3>
            <Link
              to="/orders"
              className="text-emerald-600 hover:text-emerald-700 font-medium text-sm flex items-center gap-1"
            >
              Xem tất cả
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-1">
            {activities.map((activity, i) => (
              <ActivityCard key={i} activity={activity} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
