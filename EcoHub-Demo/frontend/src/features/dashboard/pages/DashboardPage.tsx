import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, PackageCheck, ShoppingCart, Truck, Users } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { reportsApi } from '@/api/reports.api';
import { useAuthStore } from '@/store/authStore';
import StatCard from '@/components/dashboard/StatCard';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';

const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

export default function DashboardPage() {
  const { user } = useAuthStore();
  const activeShop = user?.activeShop;
  const greetingName = activeShop?.name || user?.fullName || 'bạn';

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.getDashboard(),
  });

  const summary = dashboard?.summary;
  const ordersByStatus = dashboard?.ordersByStatus ?? [];
  const packingByStaff = dashboard?.packingByStaff ?? [];
  const shippingReturnSummary = dashboard?.shippingReturnSummary ?? [];
  const storageSummary = summary?.storage;
  const ordersWithoutVideo = Math.max(0, (summary?.orders?.total ?? 0) - (summary?.videos?.total ?? 0));

  const pieData = ordersByStatus.map((item, index) => ({
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
        <h2 className="mb-2 text-2xl font-bold">Chào {greetingName}!</h2>
        <p className="max-w-3xl text-emerald-50">
          {activeShop
            ? `Tổng quan đơn phát sinh trong ngày, trạng thái đóng gói và video của shop ${activeShop.name}.`
            : 'Tổng quan đơn phát sinh trong ngày, trạng thái đóng gói và video trong toàn hệ thống.'}
        </p>
      </div>

      {storageSummary?.status === 'warning' || storageSummary?.status === 'critical' || ordersWithoutVideo > 0 ? (
        <div className="rounded-xl border-l-4 border-amber-500 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="space-y-1 text-sm text-gray-600">
              <h3 className="font-medium text-gray-900">Cảnh báo hệ thống</h3>
              {storageSummary?.status === 'critical' ? (
                <p>
                  <strong>Dung lượng video sắp đầy:</strong> đã dùng {storageSummary.usedPercent.toFixed(1)}%.
                </p>
              ) : null}
              {storageSummary?.status === 'warning' ? (
                <p>
                  <strong>Dung lượng video:</strong> đã dùng {storageSummary.usedPercent.toFixed(1)}%, cần theo dõi.
                </p>
              ) : null}
              {ordersWithoutVideo > 0 ? (
                <p>
                  <strong>Đơn chưa có video:</strong> còn {ordersWithoutVideo} đơn chưa được ghi nhận video đóng gói.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Tổng đơn hôm nay" value={summary?.orders?.total ?? 0} icon={ShoppingCart} color="emerald" trend="" />
        <StatCard title="Chưa đóng gói" value={summary?.videos?.unpacked ?? ordersWithoutVideo} icon={Clock} color="amber" trend="" />
        <StatCard title="Đã đóng gói" value={summary?.videos?.packed ?? 0} icon={PackageCheck} color="blue" trend="" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-gray-800">Phân bổ đơn hàng trong ngày</h3>
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
          <h3 className="mb-4 text-lg font-bold text-gray-800">Đơn hàng theo trạng thái</h3>
          <div className="space-y-3">
            {ordersByStatus.length === 0 ? (
              <p className="py-8 text-center text-gray-400">Chưa có dữ liệu</p>
            ) : (
              ordersByStatus.map((item) => {
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-gray-800">Đóng gói theo nhân viên</h3>
          </div>
          {packingByStaff.length === 0 ? (
            <p className="py-8 text-center text-gray-400">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-3">
              {packingByStaff.map((item) => {
                const max = Math.max(...packingByStaff.map((staff) => staff.count), 1);
                return (
                  <div key={item.staffId}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-gray-800">{item.staffName}</span>
                      <span className="text-gray-500">{item.count} video</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(item.count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5 text-sky-600" />
            <h3 className="text-lg font-bold text-gray-800">Trạng thái gửi/hoàn trong ngày</h3>
          </div>
          {shippingReturnSummary.length === 0 ? (
            <p className="py-8 text-center text-gray-400">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-3">
              {shippingReturnSummary.map((item) => {
                const badge = ORDER_STATUS_BADGES[item.status];
                return (
                  <div key={item.status} className="flex items-center justify-between rounded-lg border p-3">
                    <Badge variant={badge?.variant || 'default'}>{badge?.label || item.status}</Badge>
                    <span className="font-semibold text-gray-900">{item.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
