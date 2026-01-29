import { z } from 'zod';

export const queryProductsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    shopId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    status: z.enum(['active', 'inactive', 'out_of_stock']).optional(),
  }),
});

export const createProductSchema = z.object({
  body: z.object({
    shopId: z.string().uuid('Shop ID không hợp lệ'),
    categoryId: z.string().uuid().optional(),
    sku: z.string().min(1, 'SKU là bắt buộc'),
    name: z.string().min(1, 'Tên sản phẩm là bắt buộc'),
    description: z.string().optional(),
    price: z.number().positive('Giá phải lớn hơn 0'),
    costPrice: z.number().positive().optional(),
    weight: z.number().positive().optional(),
    length: z.number().positive().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    stockQuantity: z.number().int().min(0).optional(),
    minStockLevel: z.number().int().min(0).optional(),
    barcode: z.string().optional(),
    images: z.array(z.string().url()).optional(),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    categoryId: z.string().uuid().optional().nullable(),
    sku: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    price: z.number().positive().optional(),
    costPrice: z.number().positive().optional().nullable(),
    weight: z.number().positive().optional().nullable(),
    length: z.number().positive().optional().nullable(),
    width: z.number().positive().optional().nullable(),
    height: z.number().positive().optional().nullable(),
    minStockLevel: z.number().int().min(0).optional(),
    barcode: z.string().optional().nullable(),
    images: z.array(z.string().url()).optional(),
    status: z.enum(['active', 'inactive', 'out_of_stock']).optional(),
  }),
});

export type CreateProductDto = z.infer<typeof createProductSchema>['body'];
export type UpdateProductDto = z.infer<typeof updateProductSchema>['body'];
