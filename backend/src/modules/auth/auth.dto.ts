import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    username: z
      .string()
      .min(3, 'Tên đăng nhập phải có ít nhất 3 ký tự')
      .max(50, 'Tên đăng nhập không quá 50 ký tự')
      .regex(/^[a-zA-Z0-9_]+$/, 'Tên đăng nhập chỉ chứa chữ cái, số và dấu gạch dưới'),
    email: z.string().email('Email không hợp lệ'),
    password: z
      .string()
      .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường và 1 số'
      ),
    fullName: z.string().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
    phone: z.string().optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email không hợp lệ'),
    password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token là bắt buộc'),
  }),
});

export type RegisterDto = z.infer<typeof registerSchema>['body'];
export type LoginDto = z.infer<typeof loginSchema>['body'];
