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
