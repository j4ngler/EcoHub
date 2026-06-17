import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Camera,
  LayoutDashboard,
  Link2,
  Package,
  PlusCircle,
  RotateCcw,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  UserCircle,
  Users,
  Video,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  roles?: string[];
  hiddenForRoles?: string[];
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, hasRole } = useAuthStore();
  const location = useLocation();
  const roles = user?.roles || [];
  const isSuperAdmin = roles.includes('super_admin');
  const isOperatorView = roles.some((role) => ['staff', 'customer_service', 'customer'].includes(role));

  const navigation: NavigationItem[] = [
    { name: 'Trang chủ', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Đơn hàng', href: '/orders', icon: ShoppingCart },
    { name: 'Sản phẩm', href: '/products', icon: Package },
    { name: 'Kho hàng', href: '/inventory', icon: Warehouse },
    { name: 'Video đóng gói', href: '/videos', icon: Video, end: true },
    {
      name: 'Tạo video đóng gói',
      href: '/videos/create',
      icon: PlusCircle,
      roles: ['admin', 'staff'],
    },

    {
      name: isOperatorView ? 'Kết nối API' : 'Quản lý API',
      href: '/channel-management',
      icon: Link2,
    },
    {
      name: 'Cài đặt camera',
      href: '/camera-settings',
      icon: Camera,
      roles: ['admin', 'staff'],
    },
    {
      name: 'Video hoàn hàng',
      href: '/videos/receiving',
      icon: Video,
      roles: ['super_admin', 'admin', 'staff', 'customer_service'],
    },
    { name: 'Người dùng', href: '/users', icon: Users, roles: ['super_admin', 'admin'] },
    { name: 'Hoàn trả', href: '/returns', icon: RotateCcw, roles: ['super_admin', 'admin', 'staff', 'customer_service'] },
    { name: 'Shop', href: '/shops', icon: Store, roles: ['super_admin'] },
    { name: 'Cài đặt', href: '/settings', icon: Settings, roles: ['super_admin', 'admin'] },
    { name: 'Vận chuyển', href: '/settings/shipping', icon: Truck, roles: ['super_admin', 'admin'] },
    { name: 'Báo cáo', href: '/reports', icon: BarChart3, roles: ['super_admin', 'admin'] },
  ];

  const filteredNav = navigation.filter((item) => {
    if (item.hiddenForRoles?.some((role) => roles.includes(role))) return false;
    if (!item.roles) return true;
    return item.roles.some((role) => hasRole(role));
  });

  const renderNav = (closeOnClick: boolean) =>
    filteredNav.map((item) => {
      const isItemActive = item.end
        ? location.pathname === item.href
        : location.pathname.startsWith(item.href);
      return (
        <NavLink
          key={`${item.href}-${item.name}`}
          to={item.href}
          onClick={closeOnClick ? onClose : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isItemActive ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <item.icon className="h-5 w-5" />
          {item.name}
        </NavLink>
      );
    });

  return (
    <>
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-xl transition-transform duration-300 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">EcoHub</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1 p-4">{renderNav(true)}</nav>
      </div>

      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:border-r lg:bg-white">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">EcoHub</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">{renderNav(false)}</nav>

        <div className="border-t p-4">
          <NavLink to="/profile" className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-gray-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 font-medium text-white">
              <span>{user?.fullName?.charAt(0) || 'U'}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user?.fullName}</p>
              <p className="truncate text-xs text-gray-500">{user?.email}</p>
            </div>
            <UserCircle className="h-5 w-5 text-gray-400" />
          </NavLink>
        </div>
      </div>
    </>
  );
}
