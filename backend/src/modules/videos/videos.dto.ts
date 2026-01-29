import { z } from 'zod';

export const queryVideosSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    // Cho phép FE gửi chuỗi rỗng (vd: `status=`) nhưng sẽ được hiểu là "không lọc"
    orderId: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().uuid().optional()
    ),
    status: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.enum(['uploaded', 'processing', 'completed', 'failed']).optional()
    ),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    showDeleted: z.preprocess(
      (v) => v === 'true' || v === true,
      z.boolean().optional()
    ),
  }),
});

export const uploadVideoSchema = z.object({
  body: z.object({
    orderId: z.string().uuid('Order ID không hợp lệ'),
    trackingCode: z.string().optional(),
    trackingCodePosition: z.enum(['top_left', 'top_right', 'bottom_left', 'bottom_right']).optional(),
  }),
});

export type UploadVideoDto = z.infer<typeof uploadVideoSchema>['body'];
