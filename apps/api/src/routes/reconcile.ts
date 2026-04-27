import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  PERMISSIONS,
  type PermissionContext,
  type PermissionKey,
  type TenantName,
} from "@rpa-platform/shared";
import type { Authenticator } from "../auth.js";
import { requireAuth, requireDynamicPermission, requirePermission } from "../permissions-mw.js";
import type { ApplyRunner, DryRunRunner, ReconcileRequestBody } from "../services/reconcile.js";

const bodySchema = z.object({
  projectName: z.string().min(1),
  tenant: z.enum(["dev", "test", "stage", "prod"]),
  commitSha: z.string().min(7),
  branch: z.string().min(1),
});

export interface ReconcileRoutesDeps {
  readonly authenticator: Authenticator;
  readonly runDryRun: DryRunRunner;
  readonly runApply: ApplyRunner;
}

const APPROVAL_BY_TENANT: Record<TenantName, PermissionKey> = {
  dev: PERMISSIONS.PR_APPROVE_DEV_TO_TEST,
  test: PERMISSIONS.PR_APPROVE_DEV_TO_TEST,
  stage: PERMISSIONS.PR_APPROVE_TEST_TO_STAGE,
  prod: PERMISSIONS.PR_APPROVE_STAGE_TO_PROD,
};

const tenantContextResolver = (request: FastifyRequest): PermissionContext | undefined => {
  const body = request.body as { tenant?: TenantName } | undefined;
  return body?.tenant !== undefined ? { tenant: body.tenant } : undefined;
};

export function reconcileRoutes(deps: ReconcileRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.post("/dry-run", {
      preHandler: [
        requireAuth(deps.authenticator),
        requirePermission(PERMISSIONS.PROJECT_READ, tenantContextResolver),
      ],
      handler: async (request, reply) => {
        const parsed = bodySchema.safeParse(request.body);
        if (parsed.success === false) {
          reply.code(400).send({ code: "request.invalid", issues: parsed.error.issues });
          return;
        }
        const body: ReconcileRequestBody = parsed.data;
        if (request.actor === undefined) return;
        const outcome = await deps.runDryRun(body, {
          actor: request.actor,
          correlationId: request.correlationId,
        });
        return {
          correlationId: request.correlationId,
          plan: outcome.plan,
        };
      },
    });

    app.post("/apply", {
      preHandler: [
        requireAuth(deps.authenticator),
        requireDynamicPermission((request) => {
          const parsed = bodySchema.safeParse(request.body);
          if (parsed.success === false) return undefined;
          return APPROVAL_BY_TENANT[parsed.data.tenant];
        }, tenantContextResolver),
      ],
      handler: async (request, reply) => {
        const parsed = bodySchema.safeParse(request.body);
        if (parsed.success === false) {
          reply.code(400).send({ code: "request.invalid", issues: parsed.error.issues });
          return;
        }
        const body: ReconcileRequestBody = parsed.data;
        if (request.actor === undefined) return;
        const outcome = await deps.runApply(body, {
          actor: request.actor,
          correlationId: request.correlationId,
        });
        return {
          correlationId: request.correlationId,
          plan: outcome.plan,
          applyResult: outcome.applyResult,
        };
      },
    });
  };
}
