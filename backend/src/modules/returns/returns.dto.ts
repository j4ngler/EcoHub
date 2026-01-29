import { z } from 'zod';

export const queryReturnsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(['pending', 'approved', 'rejected', 'processing', 'completed']).optional(),
    orderId: z.string().uuid().optional(),
  }),
});

export const createReturnSchema = z.object({
  body: z.object({
    orderId: z.string().uuid('Order ID không hợp lệ'),
    reason: z.enum(['damaged', 'wrong_item', 'defective', 'not_as_described', 'other']),
    description: z.string().optional(),
    images: z.array(z.string().url()).optional(),
  }),
});

export type CreateReturnDto = z.infer<typeof createReturnSchema>['body'];
