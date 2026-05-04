import bolt from "@slack/bolt";
import { createHttpApiClient } from "./api-client.js";
import {
  TENANT_CONNECT_MODAL_CALLBACK,
  applyHandler,
  editHandler,
  helpHandler,
  newProjectHandler,
  parseTenantConnectSubmission,
  reconcileHandler,
  tenantConnectHandler,
} from "./commands/handlers.js";
import { buildSlackModalView, extractFieldValues } from "./modal-view.js";
import { CommandRouter } from "./commands/router.js";
import { loadEnv } from "./config.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const api = createHttpApiClient({ baseUrl: env.API_BASE_URL });

  const router = new CommandRouter();
  router.register("help", helpHandler);
  router.register("edit", editHandler);
  router.register("reconcile", reconcileHandler(api));
  router.register("apply", applyHandler(api));
  router.register("new", newProjectHandler(api));
  router.register("tenant", tenantConnectHandler());

  const app = new bolt.App({
    token: env.SLACK_BOT_TOKEN,
    signingSecret: env.SLACK_SIGNING_SECRET,
    socketMode: env.SLACK_APP_TOKEN !== undefined,
    ...(env.SLACK_APP_TOKEN !== undefined && { appToken: env.SLACK_APP_TOKEN }),
  });

  app.command("/rpa", async ({ command, ack, respond, client }) => {
    await ack();
    if (env.RPA_SLACK_CHANNEL_ID !== undefined && command.channel_id !== env.RPA_SLACK_CHANNEL_ID) {
      await respond({
        response_type: "ephemeral",
        text: `\`/rpa\` is restricted to <#${env.RPA_SLACK_CHANNEL_ID}>. Run the command there.`,
      });
      return;
    }
    let userEmail: string | undefined;
    try {
      const profile = await client.users.info({ user: command.user_id });
      const email = (profile.user?.profile as { email?: string } | undefined)?.email;
      userEmail = typeof email === "string" ? email : undefined;
    } catch {
      userEmail = undefined;
    }
    const result = await router.dispatch({
      userId: command.user_id,
      userEmail,
      channelId: command.channel_id,
      text: command.text ?? "",
    });
    if (result.kind === "open_modal") {
      try {
        // SlackView is typed loosely (Record<string, unknown>) so this
        // module doesn't pull in @slack/web-api's deep generic types. The
        // payload conforms to Slack's modal contract — verified by
        // buildSlackModalView's tests. Cast at the boundary.
        await client.views.open({
          trigger_id: command.trigger_id,
          view: buildSlackModalView(result.modal) as never,
        });
      } catch (err) {
        await respond({
          response_type: "ephemeral",
          text: `:warning: Failed to open form: ${(err as Error).message}`,
        });
      }
      return;
    }
    await respond({
      response_type: result.responseType ?? "in_channel",
      text: result.text,
    });
  });

  // View submission for the tenant-connect modal. The credentials arrive
  // through Slack's view-submission RPC — never via channel messages or
  // slash-command args (memory: no_secrets_in_chat). The bot posts the
  // outcome to the user as a DM (ephemeral private channel) so the success
  // / failure context never enters a public channel either.
  app.view(TENANT_CONNECT_MODAL_CALLBACK, async ({ ack, view, body, client }) => {
    const fields = extractFieldValues(view);
    const parsed = parseTenantConnectSubmission(view.private_metadata ?? "{}", fields);
    if (parsed.errors !== undefined) {
      await ack({
        response_action: "errors",
        errors: parsed.errors,
      });
      return;
    }
    await ack();

    const userId = body.user.id;
    try {
      const result = await api.connectTenant(parsed.request);
      await client.chat.postMessage({
        channel: userId,
        text: `:white_check_mark: ${result.summary}`,
      });
    } catch (err) {
      await client.chat.postMessage({
        channel: userId,
        text: `:warning: Tenant connect failed: ${(err as Error).message}`,
      });
    }
  });

  await app.start(env.PORT);
  console.log(`rpa-platform Slack bot running (port ${env.PORT})`);
}

if (process.env.RPA_BOT_BOOT !== "skip") {
  main().catch((err) => {
    console.error("Slack bot boot failed:", err);
    process.exit(1);
  });
}
