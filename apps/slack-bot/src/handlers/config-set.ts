import type { CommandHandler } from "../types.js";

// Stub for the spec's "/rpa config set" command. The full implementation
// opens a tiny PR via packages/github-client on the actor's behalf and posts
// a follow-up confirmation. Wiring lives behind an apps/api endpoint that
// the slack-bot calls here; deferred until apps/api gains the projects +
// config-pr endpoints. Keeps the surface visible so help text doesn't lie.
export const configSetHandler: CommandHandler = async (ctx) => {
  if (ctx.args.length < 4) {
    await ctx.respond("Usage: `/rpa config set <project> <tenant> <key> <value>`");
    return;
  }
  const [project, tenant, key, ...rest] = ctx.args;
  const value = rest.join(" ");
  await ctx.respond(
    `:hammer_and_wrench: \`config set\` is wired but the PR-opening backend lands with apps/api. Received: project=\`${project}\` tenant=\`${tenant}\` key=\`${key}\` value=\`${value}\`.`,
  );
};
