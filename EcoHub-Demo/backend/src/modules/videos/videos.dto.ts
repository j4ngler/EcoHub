import { z } from 'zod';

export const queryVideosSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    orderId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
    status: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.enum(['uploaded', 'processing', 'completed', 'failed']).optional()
    ),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    showDeleted: z.preprocess((v) => v === 'true' || v === true, z.boolean().optional()),
  }),
});

export const queryReceivingVideosSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    orderId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
    comparisonStatus: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.enum(['pending', 'matched', 'mismatched', 'disputed']).optional()
    ),
  }),
});

export const uploadVideoSchema = z.object({
  body: z.object({
    orderId: z.string().uuid('Order ID khong hop le'),
    trackingCode: z.string().optional(),
    trackingCodePosition: z.enum(['top_left', 'top_right', 'bottom_left', 'bottom_right']).optional(),
  }),
});

export type UploadVideoDto = z.infer<typeof uploadVideoSchema>['body'];

export const initS3UploadSchema = z.object({
  body: z.object({
    orderId: z.string().uuid('Order ID khong hop le'),
    module: z.enum(['packaging', 'receiving', 'other']),
    contentType: z.string().optional(),
    fileName: z.string().optional(),
    sizeBytes: z
      .preprocess((v) => (v === '' || v === null ? undefined : Number(v)), z.number().int().positive().optional())
      .optional(),
  }),
});

export type InitS3UploadDto = z.infer<typeof initS3UploadSchema>['body'];

export const completeS3UploadSchema = z.object({
  body: z.object({
    videoId: z.string().uuid('Video ID khong hop le'),
    sizeBytes: z
      .preprocess((v) => (v === '' || v === null ? undefined : Number(v)), z.number().int().positive().optional())
      .optional(),
    durationSec: z
      .preprocess((v) => (v === '' || v === null ? undefined : Number(v)), z.number().int().positive().optional())
      .optional(),
    success: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v === 'true' || v === true),
      z.boolean().optional()
    ),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
});

export type CompleteS3UploadDto = z.infer<typeof completeS3UploadSchema>['body'];

export const listS3VideosSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    shopId: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional()),
    uploaderUserId: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().uuid().optional()
    ),
    orderId: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional()),
    module: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.enum(['packaging', 'receiving', 'other']).optional()
    ),
    status: z.preprocess(
      (v) => (v === '' || v === null ? undefined : typeof v === 'string' ? v.toUpperCase() : v),
      z.enum(['UPLOADING', 'READY', 'FAILED', 'DELETED']).optional()
    ),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});

export const updateReceivingVideoSchema = z.object({
  params: z.object({
    id: z.string().uuid('Video ID không hợp lệ'),
  }),
  body: z.object({
    comparisonStatus: z.enum(['pending', 'matched', 'mismatched', 'disputed']).optional(),
    comparisonNotes: z.string().optional(),
  }),
});
