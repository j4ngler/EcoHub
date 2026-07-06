import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Mail, Phone, User, Users } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { getErrorMessage } from '@/api/axios';
import { useAuthStore } from '@/store/authStore';

const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, 'Tên đăng nhập phải có ít nhất 3 ký tự')
      .regex(/^[a-zA-Z0-9_]+$/, 'Chỉ chứa chữ cái, số và dấu gạch dưới'),
    email: z.string().email('Email không hợp lệ'),
    password: z
      .string()
      .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Phải có chữ hoa, chữ thường và số'),
    confirmPassword: z.string(),
    fullName: z.string().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
    phone: z.string().optional(),
    role: z.enum(['admin', 'staff', 'customer_service', 'customer', 'shipper'], {
      errorMap: () => ({ message: 'Vui lòng chọn vai trò' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

const roleLabelMap: Record<RegisterForm['role'], string> = {
  admin: 'Quản trị viên',
  staff: 'Nhân viên vận hành',
  customer_service: 'Chăm sóc khách hàng',
  customer: 'Khách hàng',
  shipper: 'Shipper (giao hàng)',
};

const fallbackRegisterRoles: Array<{ id: string; name: RegisterForm['role']; description?: string | null }> = [
  { id: 'admin', name: 'admin' },
  { id: 'staff', name: 'staff' },
  { id: 'customer_service', name: 'customer_service' },
  { id: 'customer', name: 'customer' },
  { id: 'shipper', name: 'shipper' },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [registerOptions, setRegisterOptions] = useState<{
    roles: Array<{ id: string; name: RegisterForm['role']; description?: string | null }>;
    defaultShop: { id: string; name: string; code: string } | null;
    shopMode: 'single' | 'multiple';
  }>({ roles: [], defaultShop: null, shopMode: 'single' });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'staff' },
  });

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const data = await authApi.getRegisterOptions();
        setRegisterOptions(data);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoadingOptions(false);
      }
    };

    void loadOptions();
  }, []);

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    try {
      const { confirmPassword, ...registerData } = data;
      void confirmPassword;
      const response = await authApi.register(registerData);
      if (!('accessToken' in response)) {
        toast.success(response.message || 'Tài khoản admin đã được tạo và đang chờ super admin phê duyệt');
        navigate('/login');
        return;
      }
      setAuth(response.user, response.accessToken, response.refreshToken);
      toast.success('Đăng ký thành công');
      navigate('/dashboard');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = registerOptions.roles.length > 0 ? registerOptions.roles : fallbackRegisterRoles;
  const inputCls =
    'w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent';
  const submitDisabled = loading || loadingOptions;

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-gray-800">Đăng ký tài khoản</h2>
        <p className="mt-1 text-gray-600">Tạo tài khoản EcoHub theo đúng shop và vai trò</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Field label="Họ và tên" error={errors.fullName?.message}>
          <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input {...register('fullName')} type="text" placeholder="Nguyễn Văn A" className={inputCls} />
        </Field>

        <Field label="Tên đăng nhập" error={errors.username?.message}>
          <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input {...register('username')} type="text" placeholder="username" className={inputCls} />
        </Field>

        <Field label="Email" error={errors.email?.message}>
          <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input {...register('email')} type="email" placeholder="example@ecohub.vn" className={inputCls} />
        </Field>

        <Field label="Số điện thoại">
          <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input {...register('phone')} type="tel" placeholder="0901234567" className={inputCls} />
        </Field>

        {registerOptions.shopMode === 'multiple' ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Hệ thống đang có nhiều shop. Tài khoản nhân viên/CSKH/khách hàng sẽ được gán vào shop mặc định mới nhất; tài khoản admin sẽ chờ super admin phê duyệt.
          </div>
        ) : null}

        <Field label="Vai trò" error={errors.role?.message}>
          <Users className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <select {...register('role')} className={inputCls}>
            {roleOptions.map((role) => (
              <option key={role.id} value={role.name}>
                {roleLabelMap[role.name]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Mật khẩu" error={errors.password?.message}>
          <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            className={`${inputCls} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </Field>

        <Field label="Xác nhận mật khẩu" error={errors.confirmPassword?.message}>
          <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input {...register('confirmPassword')} type="password" placeholder="••••••••" className={inputCls} />
        </Field>

        <button
          type="submit"
          disabled={submitDisabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-3 font-semibold text-white transition-all hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
        >
          {(loading || loadingOptions) && (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          Đăng ký
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Đã có tài khoản?{' '}
        <Link to="/login" className="font-medium text-emerald-600 hover:text-emerald-700">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">{children}</div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
