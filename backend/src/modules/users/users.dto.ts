import { z } from 'zod';

export const queryUsersSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    role: z.string().optional(),
    // Cho phép chuỗi rỗng từ dropdown "Tất cả" → coi như undefined
    status: z.preprocess(
      (val) => (val === '' || val === undefined ? undefined : val),
      z.enum(['active', 'inactive', 'suspended']).optional()
    ),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    username: z
      .string()
      .min(3, 'Tên đăng nhập phải có ít nhất 3 ký tự')
      .max(50, 'Tên đăng nhập không quá 50 ký tự')
      .regex(/^[a-zA-Z0-9_]+$/, 'Tên đăng nhập chỉ chứa chữ cái, số và dấu gạch dưới'),
    email: z.string().email('Email không hợp lệ'),
    password: z
      .string()
      .min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
    fullName: z.string().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
    phone: z.string().optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    roleId: z.string().uuid().optional(),
    // shopId là optional vì backend sẽ tự lấy từ req.user.shopId khi assume shop
    // Nếu không có trong context thì sẽ validate trong service
    shopId: z.preprocess(
      (val) => (val === '' || val === null ? undefined : val),
      z.string().uuid('Shop ID không hợp lệ').optional()
    ),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    email: z.string().email('Email không hợp lệ').optional(),
    fullName: z.string().min(2, 'Họ tên phải có ít nhất 2 ký tự').optional(),
    phone: z.string().optional().nullable(),
    avatarUrl: z.string().url().optional().nullable(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự').optional(),
  }),
});

export type CreateUserDto = z.infer<typeof createUserSchema>['body'];
export type UpdateUserDto = z.infer<typeof updateUserSchema>['body'];
