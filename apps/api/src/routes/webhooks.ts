import type { FastifyInstance } from "fastify";
import { verifyWebhookSignature } from "@rpa-platform/github-client";
import { sendError } from "../error-mapper.js";

export interface WebhooksDeps {
  readonly githubWebhookSecret: string | undefined;
  readonly onPushDevBranch?: (payload: unknown) => Promise<void>;
  readonly onPullRequestMerged?: (payload: unknown) => Promise<void>;
}

export function registerWebhookRoutes(app: FastifyInstance, deps: WebhooksDeps): void {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    try {
      done(null, { raw: body, parsed: JSON.parse(body as string) });
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post("/webhooks/github", async (request, reply) => {
    try {
      if (deps.githubWebhookSecret === undefined) {
        return reply.code(503).send({ code: "github.webhook_unconfigured", message: "GITHUB_WEBHOOK_SECRET is not set." });
      }
      const body = (request.body as { raw: string; parsed: unknown }) ?? { raw: "", parsed: {} };
      verifyWebhookSignature({
        body: body.raw,
        signatureHeader: request.headers["x-hub-signature-256"] as string | undefined,
        secret: deps.githubWebhookSecret,
      });
      const event = request.headers["x-github-event"];
      if (event === "push") {
        const payload = body.parsed as { ref?: string };
        if (payload.ref === "refs/heads/dev" && deps.onPushDevBranch !== undefined) {
          await deps.onPushDevBranch(body.parsed);
        }
      } else if (event === "pull_request") {
        const payload = body.parsed as { action?: string; pull_request?: { merged?: boolean } };
        if (payload.action === "closed" && payload.pull_request?.merged === true && deps.onPullRequestMerged !== undefined) {
          await deps.onPullRequestMerged(body.parsed);
        }
      }
      return reply.send({ ok: true, event, correlationId: request.correlationId });
    } catch (err) {
      await sendError(reply, err);
    }
  });
}
