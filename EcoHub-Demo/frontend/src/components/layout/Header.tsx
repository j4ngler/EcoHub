import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Settings, ChevronDown, Shield } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth.api';
import toast from 'react-hot-toast';

export default function Header() {
  const navigate = useNavigate();
  const { user, accessToken, setAuth, clearAuth, hasRole } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const isShopContext = (() => {
    try {
      if (!accessToken) return false;
      const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !!payload?.shopId;
    } catch {
      return false;
    }
  })();

  const isSuperAdmin = hasRole('super_admin');

  const handleBackToSuperAdmin = async () => {
    try {
      const res = await authApi.assumeShop(null);
      setAuth(res.user as any, res.accessToken, res.refreshToken);
      toast.success('Đã quay lại quyền Super Admin');
      setShowDropdown(false);
      navigate('/dashboard');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Không thể quay lại quyền Super Admin');
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b bg-white">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <div />

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 rounded-lg p-2 hover:bg-gray-100"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100">
                <span className="text-sm font-medium text-primary-700">{user?.fullName?.charAt(0) || 'U'}</span>
              </div>
              <span className="hidden text-sm font-medium text-gray-700 md:block">{user?.fullName}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 z-50 mt-2 w-48 rounded-lg border bg-white shadow-lg">
                  <button
                    type="button"
                    className="w-full border-b p-3 text-left transition-colors hover:bg-gray-50"
                    onClick={() => {
                      setShowDropdown(false);
                      navigate('/profile');
                    }}
                  >
                    <p className="text-sm font-medium text-gray-900">{user?.fullName}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </button>
                  <div className="p-1">
                    {isSuperAdmin && isShopContext && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={handleBackToSuperAdmin}
                      >
                        <Shield className="h-4 w-4" />
                        Về Super Admin
                      </button>
                    )}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => {
                        setShowDropdown(false);
                        navigate('/profile');
                      }}
                    >
                      <User className="h-4 w-4" />
                      Hồ sơ cá nhân
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => {
                        setShowDropdown(false);
                        navigate('/settings');
                      }}
                    >
                      <Settings className="h-4 w-4" />
                      Cài đặt
                    </button>
                    <hr className="my-1" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
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
