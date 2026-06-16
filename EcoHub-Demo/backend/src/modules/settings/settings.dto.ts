import { z } from 'zod';

const captureCameraConfigSchema = z.object({
  slotIndex: z.number().int().min(0).max(1),
  enabled: z.boolean(),
  sourceType: z.enum(['usb', 'rtsp']),
  cameraIndex: z.number().int().min(0).max(10),
  rtspUrl: z.string().max(500).optional().default(''),
  width: z.number().int().min(320).max(3840),
  height: z.number().int().min(240).max(2160),
  fps: z.number().min(5).max(60),
});

export const updateCaptureSettingsSchema = z.object({
  body: z.object({
    cameraConfigs: z.array(captureCameraConfigSchema).min(1).max(2).optional(),
    scanSensitivity: z.enum(['low', 'normal', 'high']).optional(),
    qrCooldownSeconds: z.number().int().min(1).max(60).optional(),
    recordingCameraSlot: z.number().int().min(0).max(1).optional(),
    employeeSession: z
      .object({
        employeeName: z.string().max(100).optional(),
        employeeCode: z.string().max(50).optional(),
        workSessionLabel: z.string().max(100).optional(),
      })
      .optional(),
  }),
});

export const updateS3SettingsSchema = z.object({
  body: z.object({
    endpoint: z.string().url('Endpoint phải là một URL hợp lệ'),
    accessKey: z.string().min(1, 'Access Key không được để trống').optional(),
    secretKey: z.string().min(1, 'Secret Key không được để trống').optional(),
    bucket: z.string().min(1, 'Bucket không được để trống'),
    region: z.string().optional().default('hn-2'),
    prefix: z.string().optional().default(''),
  }),
});
