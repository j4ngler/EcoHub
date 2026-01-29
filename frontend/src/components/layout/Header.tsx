import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, Search, LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left side */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          {/* Search */}
          <div className="hidden md:flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-64">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              className="bg-transparent border-none outline-none text-sm flex-1 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-gray-100">
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100"
            >
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-700 font-medium text-sm">
                  {user?.fullName?.charAt(0) || 'U'}
                </span>
              </div>
              <span className="hidden md:block text-sm font-medium text-gray-700">
                {user?.fullName}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-50">
                  {/* Clickable user header -> go to profile */}
                  <button
                    type="button"
                    className="w-full text-left p-3 border-b hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      setShowDropdown(false);
                      navigate('/profile');
                    }}
                  >
                    <p className="text-sm font-medium text-gray-900">{user?.fullName}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </button>
                  <div className="p-1">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                      onClick={() => {
                        setShowDropdown(false);
                        navigate('/profile');
                      }}
                    >
                      <User className="w-4 h-4" />
                      Hồ sơ cá nhân
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                      onClick={() => {
                        setShowDropdown(false);
                        navigate('/settings');
                      }}
                    >
                      <Settings className="w-4 h-4" />
                      Cài đặt
                    </button>
                    <hr className="my-1" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <LogOut className="w-4 h-4" />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
