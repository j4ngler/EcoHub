import { z } from 'zod';

export const prepareUploadSchema = z.object({
  body: z.object({
    orderId: z.string().uuid('Order ID không hợp lệ'),
    trackingCode: z.string().trim().min(1).optional(),
    module: z.enum(['packaging', 'receiving']).default('packaging').optional(),
    recordingFlow: z.enum(['outbound', 'return']).optional(),
  }),
});
