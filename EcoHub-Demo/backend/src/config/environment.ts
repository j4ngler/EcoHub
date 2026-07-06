import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  
  // JWT
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string(),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // Frontend URL
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Cloud Storage
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('ap-southeast-1'),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_ENDPOINT: z.string().optional(),
  AWS_S3_FORCE_PATH_STYLE: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v === 'true' || v === true),
    z.boolean().default(true)
  ),

  BACKEND_PUBLIC_URL: z.string().default('http://localhost:3000'),
  CAPTURE_SERVICE_URL: z.string().default('http://127.0.0.1:5000'),
  CAPTURE_CONFIG_FILE: z.string().optional(),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
  VIDEO_COMPRESSION_PYTHON: z.string().default('python'),
  VIDEO_TARGET_SIZE_MB: z.string().default('4'),

  // TikTok OAuth
  TIKTOK_SERVICE_ID: z.string().optional(),
  TIKTOK_APP_KEY: z.string().optional(),
  TIKTOK_APP_SECRET: z.string().optional(),
  TIKTOK_AUTH_BASE_URL: z.string().default('https://services.tiktokshop.com/open/authorize'),
  TIKTOK_TOKEN_EXCHANGE_URL: z.string().default('https://auth.tiktok-shops.com/api/v2/token/get'),
  
  // Email Configuration
  MAIL_MAILER: z.string().default('smtp'),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.string().default('465'),
  MAIL_USERNAME: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_ENCRYPTION: z.string().optional(),
  MAIL_FROM_ADDRESS: z.string().optional(),
  MAIL_FROM_NAME: z.string().default('EcoHub'),
  MAIL_REPLY_ADDRESS: z.string().optional(),
  MAIL_REPLY_NAME: z.string().default('EcoHub'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment variables:');
    console.error(error);
    process.exit(1);
  }
}

export const env = validateEnv();
