import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().url().optional(),
  RPA_PLATFORM_ENCRYPTION_KEY: z.string().optional(),
  GITHUB_ACTION_SHARED_SECRET: z.string().min(16).optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
});

export type ApiEnv = z.infer<typeof envSchema>;

export function parseApiEnv(input: NodeJS.ProcessEnv = process.env): ApiEnv {
  return envSchema.parse(input);
}
