import type { CommandHandler } from "../types.js";

export const helpHandler: CommandHandler = async (ctx) => {
  await ctx.respond(
    [
      "*rpa-platform — Slack commands*",
      "• `/rpa status` — health check",
      "• `/rpa config set <project> <tenant> <key> <value>` — open a tiny PR",
      "• `/rpa edit` — (v2 only)",
      "• `/rpa help` — show this message",
    ].join("\n"),
  );
};
