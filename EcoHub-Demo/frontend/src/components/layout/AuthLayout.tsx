import { Outlet } from 'react-router-dom';
import { Truck } from 'lucide-react';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-600 via-teal-500 to-cyan-600 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left - Branding */}
          <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-12 flex flex-col items-center justify-center text-white max-lg:py-8">
            <div className="text-center">
              <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6 mx-auto">
                <Truck className="w-14 h-14 text-white" />
              </div>
              <h1 className="text-4xl font-bold mb-4">EcoHub</h1>
              <p className="text-xl mb-8 opacity-90">
                Hệ thống đóng gói & tích hợp mã vận đơn vào video
              </p>
              <ul className="space-y-3 text-left max-w-xs mx-auto">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-xs">✓</span>
                  Quản lý đơn hàng đa kênh
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-xs">✓</span>
                  Video đóng gói có mã vận đơn
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-xs">✓</span>
                  Báo cáo & thống kê chi tiết
                </li>
              </ul>
            </div>
          </div>

          {/* Right - Form */}
          <div className="p-8 flex items-center">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
