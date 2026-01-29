import { z } from 'zod';

export const queryOrdersSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    status: z.enum([
      'pending', 'confirmed', 'packing', 'packed',
      'shipping', 'delivered', 'completed', 'cancelled', 'returned'
    ]).optional(),
    shopId: z.string().uuid().optional(),
    channelId: z.string().uuid().optional(),
    carrierId: z.string().uuid().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

const orderItemSchema = z.object({
  productId: z.string().uuid().optional(),
  productName: z.string().min(1, 'Tên sản phẩm là bắt buộc'),
  productSku: z.string().optional(),
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
  unitPrice: z.number().positive('Đơn giá phải lớn hơn 0'),
});

export const createOrderSchema = z.object({
  body: z.object({
    shopId: z.string().uuid('Shop ID không hợp lệ'),
    channelId: z.string().uuid().optional(),
    channelOrderId: z.string().optional(),
    customerName: z.string().min(1, 'Tên khách hàng là bắt buộc'),
    customerPhone: z.string().min(1, 'Số điện thoại là bắt buộc'),
    customerEmail: z.string().email().optional(),
    shippingAddress: z.string().min(1, 'Địa chỉ giao hàng là bắt buộc'),
    shippingProvince: z.string().optional(),
    shippingDistrict: z.string().optional(),
    shippingWard: z.string().optional(),
    carrierId: z.string().uuid().optional(),
    trackingCode: z.string().optional(),
    shippingFee: z.number().min(0).optional(),
    codAmount: z.number().min(0).optional(),
    discountAmount: z.number().min(0).optional(),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(orderItemSchema).min(1, 'Đơn hàng phải có ít nhất 1 sản phẩm'),
  }),
});

export const updateOrderSchema = z.object({
  body: z.object({
    customerName: z.string().min(1).optional(),
    customerPhone: z.string().min(1).optional(),
    customerEmail: z.string().email().optional().nullable(),
    shippingAddress: z.string().min(1).optional(),
    shippingProvince: z.string().optional(),
    shippingDistrict: z.string().optional(),
    shippingWard: z.string().optional(),
    carrierId: z.string().uuid().optional().nullable(),
    trackingCode: z.string().optional(),
    shippingFee: z.number().min(0).optional(),
    codAmount: z.number().min(0).optional(),
    notes: z.string().optional().nullable(),
  }),
});

export const updateStatusSchema = z.object({
  body: z.object({
    status: z.enum([
      'pending', 'confirmed', 'packing', 'packed',
      'shipping', 'delivered', 'completed', 'cancelled', 'returned'
    ]),
    note: z.string().optional(),
  }),
});

export type CreateOrderDto = z.infer<typeof createOrderSchema>['body'];
export type UpdateOrderDto = z.infer<typeof updateOrderSchema>['body'];
