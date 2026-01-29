import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Video, 
  Users, 
  BarChart3, 
  X,
  Truck,
  PlusCircle,
  Warehouse,
  UserCircle,
  Settings,
  Store
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Trang chủ', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Đơn hàng', href: '/orders', icon: ShoppingCart },
  { name: 'Sản phẩm', href: '/products', icon: Package },
  { name: 'Kho hàng', href: '/inventory', icon: Warehouse },
  { name: 'Video đóng gói', href: '/videos', icon: Video },
  { name: 'Tạo video', href: '/videos/create', icon: PlusCircle },
  { name: 'Video hoàn hàng', href: '/videos/receiving', icon: Video, roles: ['super_admin', 'admin', 'staff'] },
  { name: 'Người dùng', href: '/users', icon: Users, roles: ['super_admin', 'admin'] },
  { name: 'Shop', href: '/shops', icon: Store, roles: ['super_admin'] },
  { name: 'Cài đặt', href: '/settings', icon: Settings, roles: ['super_admin', 'admin'] },
  { name: 'Báo cáo', href: '/reports', icon: BarChart3, roles: ['super_admin', 'admin'] },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, hasRole } = useAuthStore();

  const filteredNav = navigation.filter(item => {
    if (!item.roles) return true;
    return item.roles.some(role => hasRole(role));
  });

  return (
    <>
      {/* Mobile sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 lg:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">EcoHub</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {filteredNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-64 lg:flex lg:flex-col lg:bg-white lg:border-r">
        <div className="flex items-center gap-2 h-16 px-6 border-b">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">EcoHub</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t">
          <NavLink
            to="/profile"
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-white font-medium">
              <span>
                {user?.fullName?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.fullName}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email}
              </p>
            </div>
            <UserCircle className="w-5 h-5 text-gray-400" />
          </NavLink>
        </div>
      </div>
    </>
  );
}
