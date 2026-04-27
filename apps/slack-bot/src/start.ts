import bolt from "@slack/bolt";
import { buildDefaultRouter } from "./build-router.js";
import { parseCommandText } from "./parse-command.js";
import type { SlashCommandContext, UserResolver } from "./types.js";

const { App } = bolt;

interface StartConfig {
  signingSecret: string;
  token: string;
  port: number;
  userResolver: UserResolver;
}

// TODO(slack-bootstrap): swap the in-memory userResolver for a DB-backed
// implementation that joins users on slack_user_id once infra wires it up.
async function main(): Promise<void> {
  const signingSecret = process.env["SLACK_SIGNING_SECRET"];
  const token = process.env["SLACK_BOT_TOKEN"];
  if (signingSecret === undefined || token === undefined) {
    process.stderr.write("SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN are required.\n");
    process.exit(2);
  }
  const userResolver: UserResolver = {
    bySlackUserId: async () => undefined,
  };
  await startBolt({
    signingSecret,
    token,
    port: Number(process.env["PORT"] ?? 3001),
    userResolver,
  });
}

async function startBolt(config: StartConfig): Promise<void> {
  const app = new App({
    signingSecret: config.signingSecret,
    token: config.token,
  });
  const router = buildDefaultRouter();

  app.command("/rpa", async ({ ack, respond, command }) => {
    const parsed = parseCommandText(command.text ?? "");
    const actor = await config.userResolver.bySlackUserId(command.user_id);
    if (actor === undefined) {
      await ack();
      await respond(
        `:warning: Slack user \`${command.user_id}\` is not linked to an rpa-platform account.`,
      );
      return;
    }
    const ctx: SlashCommandContext = {
      input: {
        command: command.command,
        text: command.text ?? "",
        slackUserId: command.user_id,
        slackChannelId: command.channel_id,
      },
      actor,
      subcommand: parsed.subcommand,
      args: parsed.args,
      ack: async () => {
        await ack();
      },
      respond: async (text) => {
        await respond(text);
      },
    };
    await ctx.ack();
    await router.dispatch(ctx);
  });

  await app.start(config.port);
  process.stdout.write(`slack-bot listening on :${config.port}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`slack-bot failed to start: ${describe(err)}\n`);
  process.exit(1);
});

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
