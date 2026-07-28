import { z } from 'zod';

/**
 * Muhit o'zgaruvchilari ishga tushishda tekshiriladi — noto'g'ri konfiguratsiya
 * bilan servis umuman ko'tarilmaydi.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().default(4000),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    JWT_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),

    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: z.string(),
    S3_SECRET_KEY: z.string(),
    S3_BUCKET: z.string(),
    S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
    RECORDING_ENCRYPTION_KEY: z.string().length(64, '32 baytli hex kalit kerak (64 belgi)'),
    FIELD_ENCRYPTION_KEY: z
      .string()
      .length(64, '32 baytli hex kalit kerak (64 belgi)')
      .optional(),
    RECORDING_RETENTION_DAYS: z.coerce.number().int().default(365),
    RECORDING_SPOOL_DIR: z.string().default('../../infra/data/recordings'),

    SERVICE_TOKEN: z.string().min(16),
    TELEPHONY_INTERNAL_URL: z.string().url().default('http://localhost:4100/internal'),
    PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
    AUDIOSOCKET_HOST: z.string().default('host.docker.internal'),
    AUDIOSOCKET_PORT: z.coerce.number().int().default(8090),

    ASTERISK_WSS_URL: z.string().default('wss://localhost:8089/ws'),
    ASTERISK_SIP_DOMAIN: z.string().default('aicc.local'),

    SMS_PROVIDER: z.enum(['android', 'gateway', 'eskiz']).default('android'),
    ESKIZ_EMAIL: z.string().optional(),
    ESKIZ_PASSWORD: z.string().optional(),
    ESKIZ_BASE_URL: z.string().default('https://notify.eskiz.uz/api'),
    GSM_GATEWAY_BASE_URL: z.string().optional(),
    GSM_GATEWAY_USER: z.string().optional(),
    GSM_GATEWAY_PASSWORD: z.string().optional(),

    DEVICE_ENROLLMENT_SECRET: z.string().min(24),

    CORS_ORIGINS: z.string().default('http://localhost:3000'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'Production da kamida 32 belgi',
        });
      }
      if (data.JWT_REFRESH_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'Production da kamida 32 belgi',
        });
      }
      if (data.SERVICE_TOKEN.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SERVICE_TOKEN'],
          message: 'Production da kamida 32 belgi',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Konfiguratsiya xatosi:\n${issues}`);
  }
  return parsed.data;
}
