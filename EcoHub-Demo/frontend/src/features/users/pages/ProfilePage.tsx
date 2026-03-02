import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Save, Camera, Mail, Phone, Lock, User, Check, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth.api';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    fullName: '',
    email: '',
    phone: '',
    avatarUrl: ''
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user) {
      setProfileData({
        fullName: user.fullName || '',
        email: user.email || '',
        phone: user.phone || '',
        avatarUrl: user.avatarUrl || ''
      });
      
      if (user.avatarUrl) {
        setAvatarPreview(user.avatarUrl);
      }
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: { fullName?: string; phone?: string; avatarUrl?: string }) =>
      authApi.updateMe(data),
    onSuccess: (data) => {
      toast.success('Cập nhật thông tin thành công!');
      updateUser({
        fullName: data.fullName,
        phone: data.phone,
        avatarUrl: data.avatarUrl,
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Cập nhật thông tin thất bại');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(data),
    onSuccess: () => {
      toast.success('Đổi mật khẩu thành công!');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Đổi mật khẩu thất bại');
    },
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5000000) { // 5MB limit
        toast.error('Ảnh đại diện không được vượt quá 5MB');
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        toast.error('Vui lòng chọn file hình ảnh hợp lệ');
        return;
      }
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setAvatarPreview(result);
        setProfileData({ ...profileData, avatarUrl: result });
        // In real app, you would upload the file to server first
        toast.success('Ảnh đại diện đã được cập nhật!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      fullName: profileData.fullName,
      phone: profileData.phone,
      avatarUrl: profileData.avatarUrl,
    });
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Mật khẩu mới và xác nhận mật khẩu không khớp');
      return;
    }
    
    if (passwordData.newPassword.length < 6) {
      toast.error('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    
    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  };

  if (!user) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hồ sơ cá nhân</h1>
        <p className="mt-1 text-gray-500">Quản lý thông tin tài khoản của bạn</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex items-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-white p-1">
                  {avatarPreview ? (
                    <img 
                      src={avatarPreview} 
                      alt={profileData.fullName} 
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-3xl font-bold text-gray-500">
                        {profileData.fullName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                {isEditing && (
                  <label className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow-lg cursor-pointer">
                    <Camera className="h-5 w-5 text-emerald-600" />
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      onChange={handleAvatarChange}
                    />
                  </label>
                )}
              </div>
              <div className="ml-6">
                <h2 className="text-2xl font-bold">{profileData.fullName || 'Người dùng EcoHub'}</h2>
                <p className="text-emerald-100 mt-1">{user.roles?.[0]?.toUpperCase() || 'USER'}</p>
              </div>
            </div>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="mt-4 md:mt-0 flex items-center px-4 py-2 bg-white text-emerald-600 rounded-lg hover:bg-emerald-50 font-medium"
              >
                <Edit className="h-4 w-4 mr-2" />
                Chỉnh sửa hồ sơ
              </button>
            ) : (
              <div className="mt-4 md:mt-0 flex space-x-3">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    // Reset to original values
                    if (user) {
                      setProfileData({
                        fullName: user.fullName || '',
                        email: user.email || '',
                        phone: user.phone || '',
                        avatarUrl: user.avatarUrl || ''
                      });
                      setAvatarPreview(user.avatarUrl || null);
                    }
                  }}
                  className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  <X className="h-4 w-4 mr-2" />
                  Hủy
                </button>
                <button
                  onClick={handleProfileSave}
                  disabled={updateProfileMutation.isPending}
                  className="flex items-center px-4 py-2 bg-white text-emerald-600 rounded-lg hover:bg-emerald-50 font-medium disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateProfileMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Profile Content */}
        <div className="p-6">
          <form onSubmit={handleProfileSave}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="inline mr-2" />
                  Họ và tên
                </label>
                <input
                  type="text"
                  value={profileData.fullName}
                  onChange={(e) => setProfileData({...profileData, fullName: e.target.value})}
                  disabled={!isEditing}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
                    !isEditing ? 'bg-gray-50' : ''
                  }`}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="inline mr-2" />
                  Email
                </label>
                <input
                  type="email"
                  value={profileData.email}
                  disabled
                  className="w-full px-4 py-3 border rounded-lg bg-gray-50"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="inline mr-2" />
                  Số điện thoại
                </label>
                <input
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                  disabled={!isEditing}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
                    !isEditing ? 'bg-gray-50' : ''
                  }`}
                  placeholder="0123 456 789"
                />
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Change Password Section */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <Lock className="h-6 w-6 text-emerald-600 mr-2" />
          Đổi mật khẩu
        </h2>
        
        <form onSubmit={handlePasswordChange} className="max-w-md">
          <div className="space-y-4">
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-2">
                Mật khẩu hiện tại
              </label>
              <input
                type="password"
                id="current-password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-2">
                Mật khẩu mới
              </label>
              <input
                type="password"
                id="new-password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                Xác nhận mật khẩu mới
              </label>
              <input
                type="password"
                id="confirm-password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            
            <div className="pt-4 border-t">
              <button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="w-full px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 font-medium disabled:opacity-50"
              >
                <Lock className="h-5 w-5 mr-2 inline" />
                {changePasswordMutation.isPending ? 'Đang đổi...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Thông tin tài khoản</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <User className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-900">Vai trò</p>
                <p className="text-sm text-gray-500">Loại tài khoản của bạn</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">
              {user.roles?.[0]?.toUpperCase() || 'USER'}
            </span>
          </div>
          
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-900">Email</p>
                <p className="text-sm text-gray-500">Địa chỉ email của bạn</p>
              </div>
            </div>
            <span className="text-sm text-gray-900 font-medium">{user.email}</span>
          </div>
          
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Check className="h-5 w-5 text-amber-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-900">Trạng thái</p>
                <p className="text-sm text-gray-500">Tình trạng tài khoản của bạn</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              Hoạt động
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
