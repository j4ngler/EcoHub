import { z } from 'zod';

export const createShopSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Tên shop phải có ít nhất 2 ký tự'),
    code: z.string().min(2, 'Mã shop phải có ít nhất 2 ký tự').max(50),
    adminUsername: z.string().min(3, 'Tên đăng nhập admin phải có ít nhất 3 ký tự'),
    adminEmail: z.string().email('Email admin không hợp lệ'),
    adminPassword: z.string().min(8, 'Mật khẩu admin phải có ít nhất 8 ký tự'),
    adminFullName: z.string().min(2, 'Tên admin phải có ít nhất 2 ký tự'),
    adminPhone: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
  }),
});

export type CreateShopDto = z.infer<typeof createShopSchema>['body'];

export const deleteShopSchema = z.object({
  params: z.object({
    id: z.string().uuid('Shop ID không hợp lệ'),
  }),
  body: z.object({
    superAdminPassword: z.string().min(8, 'Mật khẩu Super Admin không hợp lệ'),
  }),
});

