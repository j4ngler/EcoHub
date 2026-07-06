import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/api/axios';

const loginSchema = z.object({
  loginId: z.string().min(1, 'Vui lòng nhập email hoặc tên đăng nhập'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    clearErrors('password');
    try {
      const response = await authApi.login(data);
      setAuth(response.user, response.accessToken, response.refreshToken);
      toast.success('Đăng nhập thành công!');
      navigate('/dashboard');
    } catch (error) {
      const message = getErrorMessage(error);
      setError('password', { type: 'server', message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-gray-800">Đăng nhập</h2>
        <p className="mt-1 text-gray-600">Chào mừng trở lại EcoHub</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Email hoặc tên đăng nhập</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              {...register('loginId')}
              type="text"
              placeholder="admin hoặc admin@ecohub.vn"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 pl-10 focus:border-transparent focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {errors.loginId && <p className="mt-1 text-sm text-red-600">{errors.loginId.message}</p>}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Mật khẩu</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 pl-10 pr-10 focus:border-transparent focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input type="checkbox" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="ml-2 text-sm text-gray-600">Ghi nhớ đăng nhập</span>
          </label>
          <a href="#" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
            Quên mật khẩu?
          </a>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-3 font-semibold text-white transition-all hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}
          Đăng nhập
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="font-medium text-emerald-600 hover:text-emerald-700">
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}
