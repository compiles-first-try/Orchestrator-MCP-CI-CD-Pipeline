import { z } from "zod";

const Env = z.object({
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  // Socket-Mode app token. Required for local dev; optional in HTTP mode.
  SLACK_APP_TOKEN: z.string().optional(),
  // URL of the platform API the bot calls for /reconcile, /tenant connect, etc.
  API_BASE_URL: z.string().url().default("http://api:3000"),
  // Optional channel ID that the bot will allow `/rpa` commands from. When
  // set, commands originating elsewhere are rejected with an ephemeral
  // pointer to the canonical channel. Useful while the org converges on
  // "Slack as the single test surface" — leave unset for unrestricted use.
  RPA_SLACK_CHANNEL_ID: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z
    .string()
    .default("3001")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
});

export type SlackEnv = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): SlackEnv {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid Slack-bot environment configuration:\n${issues}`);
  }
  return parsed.data;
}
