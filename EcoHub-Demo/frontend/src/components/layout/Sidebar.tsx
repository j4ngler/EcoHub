import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Camera,
  Cloud,
  LayoutDashboard,
  Link2,
  Package,
  PackageSearch,
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
  Menu,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import ecohubAppIcon from '@/assets/ecohub_app_icon.png';

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
  hidden?: boolean;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, hasRole } = useAuthStore();
  const location = useLocation();
  const roles = user?.roles || [];
  const isOperatorView = roles.some((role) => ['staff', 'customer_service', 'customer'].includes(role));

  const navigation: NavigationItem[] = [
    { name: 'Trang chủ', href: '/dashboard', icon: LayoutDashboard },
    {
      name: 'Đơn hàng',
      href: '/orders',
      icon: ShoppingCart,
      end: true,
      hiddenForRoles: ['shipper'],
    },
    {
      name: 'Tra cứu đơn hàng',
      href: '/order-lookup',
      icon: PackageSearch,
      roles: ['customer', 'shipper'],
    },
    { name: 'Sản phẩm', href: '/products', icon: Package, end: true, hidden: true },
    { name: 'Kho hàng', href: '/inventory', icon: Warehouse, end: true, hidden: true },
    {
      name: 'Video đóng gói',
      href: '/videos',
      icon: Video,
      end: true,
      hiddenForRoles: ['customer', 'shipper'],
    },
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
      hiddenForRoles: ['customer', 'shipper'],
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
    {
      name: 'Hoàn trả',
      href: '/returns',
      icon: RotateCcw,
      roles: ['super_admin', 'admin', 'staff', 'customer_service'],
      hidden: true,
    },
    { name: 'Shop', href: '/shops', icon: Store, roles: ['super_admin'] },
    { name: 'Cài đặt', href: '/settings', icon: Settings, roles: ['super_admin', 'admin'], end: true },
    { name: 'Vận chuyển', href: '/settings/shipping', icon: Truck, roles: ['super_admin', 'admin'], hidden: true },
    { name: 'Lưu trữ S3', href: '/settings/s3', icon: Cloud, roles: ['super_admin'] },
    { name: 'Báo cáo', href: '/reports', icon: BarChart3, roles: ['super_admin', 'admin'] },
  ];

  const filteredNav = navigation.filter((item) => {
    if (item.hidden) return false;
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
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-white shadow-sm transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Đóng mở menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
              <img src={ecohubAppIcon} alt="EcoHub" className="h-full w-full object-cover" />
            </div>
            <span className="text-xl font-bold text-gray-900">EcoHub</span>
          </div>
        </div>
        <div className="flex h-[calc(100%-4rem)] flex-col">
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">{renderNav(false)}</nav>

          <div className="border-t p-4">
            <NavLink
              to="/profile"
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
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
      </div>
    </>
  );
}
