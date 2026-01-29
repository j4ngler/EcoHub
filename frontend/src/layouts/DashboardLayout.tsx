import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Video,
  PlusCircle,
  Package,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  User as UserIcon,
  Bell,
  Store,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setCurrentPath(location.pathname);
  }, [location]);

  const handleLogout = () => {
    if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
      clearAuth();
      toast.success('Đăng xuất thành công!');
      navigate('/login');
    }
  };

  const navigation = [
    { name: 'Trang chủ', href: '/dashboard', icon: Home, roles: ['customer', 'staff', 'admin', 'super_admin'] },
    { name: 'Video đóng gói', href: '/videos', icon: Video, roles: ['customer', 'staff', 'admin', 'super_admin'] },
    { name: 'Tạo video', href: '/videos/create', icon: PlusCircle, roles: ['customer', 'staff', 'admin', 'super_admin'] },
    { name: 'Đơn hàng', href: '/orders', icon: Package, roles: ['staff', 'admin', 'super_admin'] },
    { name: 'Sản phẩm', href: '/products', icon: Package, roles: ['staff', 'admin', 'super_admin'] },
    { name: 'Quản lý hàng hóa', href: '/inventory', icon: Package, roles: ['admin', 'super_admin'] },
    { name: 'Người dùng', href: '/users', icon: Users, roles: ['super_admin'] },
    { name: 'Báo cáo', href: '/reports', icon: BarChart3, roles: ['admin', 'super_admin'] },
    { name: 'Shop', href: '/shops', icon: Store, roles: ['super_admin'] },
    { name: 'Hồ sơ', href: '/profile', icon: Settings, roles: ['customer', 'staff', 'admin', 'super_admin'] },
  ].filter((item) => {
    if (!item.roles) return true;
    return item.roles.some((role) => user?.roles?.includes(role));
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">EcoHub</h1>
                <p className="text-xs text-emerald-600 font-medium">
                  {user?.roles?.[0]?.toUpperCase() || 'USER'}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-5 overflow-y-auto">
            <div className="space-y-1">
              {navigation.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    navigate(item.href);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    currentPath === item.href
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <item.icon
                    className={`mr-3 h-5 w-5 ${currentPath === item.href ? 'text-emerald-600' : 'text-gray-500'}`}
                  />
                  {item.name}
                </button>
              ))}
            </div>
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.fullName}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                title="Đăng xuất"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden mr-3 p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                <Menu className="h-6 w-6" />
              </button>
              <h1 className="text-xl font-bold text-gray-800">
                {navigation.find((nav) => nav.href === currentPath)?.name || 'Dashboard'}
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <button
                type="button"
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg hover:text-gray-900 relative"
              >
                <Bell className="h-6 w-6" />
                <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  3
                </span>
              </button>

              {/* User Menu */}
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">
                    {user?.fullName?.charAt(0) || 'U'}
                  </div>
                  <span className="hidden md:block text-sm font-medium text-gray-700">{user?.fullName}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 p-4 text-center text-sm text-gray-500">
          <p>
            © 2026 EcoHub. Hệ thống đóng gói & tích hợp mã vận đơn vào video.{' '}
            <span className="text-emerald-600 ml-1">🌿</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
