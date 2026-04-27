import type { CommandHandler } from "../types.js";

export const statusHandler: CommandHandler = async (ctx) => {
  await ctx.respond(
    [
      `:white_check_mark: rpa-platform is up.`,
      `Actor: \`${ctx.actor.id}\` with ${ctx.actor.roles.length} role(s).`,
    ].join("\n"),
  );
};
