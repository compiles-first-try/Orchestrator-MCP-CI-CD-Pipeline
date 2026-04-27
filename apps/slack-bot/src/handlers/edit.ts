import type { CommandHandler } from "../types.js";

// Per CLAUDE.md scope discipline: no inline editing in v1.
// Slash command preserved so users get a clear deferral message rather than
// a "command not found" error.
export const editHandler: CommandHandler = async (ctx) => {
  await ctx.respond("Inline editing arrives in v2 — for now, edit on your machine and commit.");
};
