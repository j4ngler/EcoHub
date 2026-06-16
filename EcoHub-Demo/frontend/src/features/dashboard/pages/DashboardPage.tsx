import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  DollarSign,
  HardDrive,
  ShoppingCart,
  TrendingUp,
  Video,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { reportsApi } from '@/api/reports.api';
import { useAuthStore } from '@/store/authStore';
import StatCard from '@/components/dashboard/StatCard';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import { formatCurrency } from '@/utils/format';

const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

export default function DashboardPage() {
  const { user, hasRole } = useAuthStore();
  const isAdminLike = hasRole('admin') || hasRole('super_admin');
  const activeShop = user?.activeShop;
  const greetingName = activeShop?.name || user?.fullName || 'bạn';

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.getDashboard(),
  });

  const summary = dashboard?.summary;
  const ordersByStatus = dashboard?.ordersByStatus ?? [];
  const storageSummary = dashboard?.summary?.storage;
  const ordersWithoutVideo = Math.max(0, (summary?.orders?.total ?? 0) - (summary?.videos?.total ?? 0));

  const formatVideoStorage = (usedBytes: number, totalBytes: number) => {
    const gb = 1024 ** 3;
    const mb = 1024 ** 2;
    const usedStr = usedBytes < gb ? `${(usedBytes / mb).toFixed(1)} MB` : `${(usedBytes / gb).toFixed(2)} GB`;
    const totalStr = totalBytes < gb ? `${(totalBytes / mb).toFixed(0)} MB` : `${(totalBytes / gb).toFixed(1)} GB`;
    return `${usedStr} / ${totalStr}`;
  };

  const pieData = ordersByStatus.map((item: { status: string; count: number }, index: number) => ({
    name: ORDER_STATUS_BADGES[item.status]?.label || item.status,
    value: item.count,
    color: PIE_COLORS[index % PIE_COLORS.length],
  }));

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="mb-2 text-2xl font-bold">Chào {greetingName}!</h2>
            <p className="max-w-2xl text-emerald-100">
              {activeShop
                ? `Tổng quan hoạt động đóng gói và video của shop ${activeShop.name}.`
                : 'Tổng quan hoạt động đóng gói và video trong hệ thống.'}
            </p>
          </div>
          {isAdminLike ? (
            <div className="mt-4 flex-shrink-0 md:mt-0">
              <div className="rounded-lg bg-white/10 p-4 text-center backdrop-blur-sm">
                <div className="text-2xl font-bold">{formatCurrency(summary?.revenue?.total || 0)}</div>
                <div className="text-sm text-emerald-100">Doanh thu</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {(storageSummary?.status === 'warning' || storageSummary?.status === 'critical' || ordersWithoutVideo > 0) ? (
        <div className="rounded-xl border-l-4 border-amber-500 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <h3 className="mb-2 font-medium text-gray-900">Cảnh báo hệ thống</h3>
              <div className="space-y-1 text-sm text-gray-600">
                {storageSummary?.status === 'critical' ? (
                  <p>
                    <strong>Dung lượng video sắp đầy:</strong> Đã dùng {storageSummary.usedPercent.toFixed(1)}% (
                    {(storageSummary.usedBytes / 1024 ** 3).toFixed(1)} / {(storageSummary.totalBytes / 1024 ** 3).toFixed(1)} GB).
                  </p>
                ) : null}
                {storageSummary?.status === 'warning' ? (
                  <p>
                    <strong>Dung lượng video:</strong> Đã dùng {storageSummary.usedPercent.toFixed(1)}% và cần theo dõi.
                  </p>
                ) : null}
                {ordersWithoutVideo > 0 ? (
                  <p>
                    <strong>Đơn hàng chưa có video:</strong> Có {ordersWithoutVideo} đơn hàng chưa được quay video đóng gói.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Tổng đơn hàng" value={summary?.orders?.total ?? 0} icon={ShoppingCart} color="emerald" trend="" />
        <StatCard title="Đơn chờ xử lý" value={summary?.orders?.pending ?? 0} icon={Clock} color="amber" trend="" />
        <StatCard title="Video đã xử lý" value={summary?.videos?.processed ?? 0} icon={Video} color="blue" trend="" />
        {isAdminLike ? (
          <StatCard title="Doanh thu" value={formatCurrency(summary?.revenue?.total ?? 0)} icon={DollarSign} color="purple" trend="" />
        ) : null}
        <StatCard
          title="Dung lượng video"
          value={storageSummary ? formatVideoStorage(storageSummary.usedBytes, storageSummary.totalBytes) : '0 / 0 GB'}
          icon={HardDrive}
          color={storageSummary?.status === 'critical' ? 'rose' : storageSummary?.status === 'warning' ? 'amber' : 'indigo'}
          trend={`${storageSummary?.usedPercent?.toFixed(1) || 0}%`}
        />
        <StatCard title="Sắp hết hàng" value={summary?.products?.lowStock ?? 0} icon={TrendingUp} color="rose" trend="" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
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
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">Chưa có dữ liệu</div>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">Đơn hàng theo trạng thái</h3>
          </div>
          <div className="space-y-3">
            {ordersByStatus.length === 0 ? (
              <p className="py-8 text-center text-gray-400">Chưa có dữ liệu</p>
            ) : (
              ordersByStatus.map((item: { status: string; count: number }) => {
                const badge = ORDER_STATUS_BADGES[item.status];
                const total = summary?.orders?.total || 1;
                const pct = ((item.count / total) * 100).toFixed(1);

                return (
                  <div key={item.status} className="flex items-center justify-between gap-2">
                    <Badge variant={badge?.variant || 'default'}>{badge?.label || item.status}</Badge>
                    <div className="h-2 max-w-[120px] flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-16 text-right text-sm text-gray-600">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
