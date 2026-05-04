import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AssetsFile,
  BucketsFile,
  ConstantsFile,
  CredentialsFile,
  OverridesFile,
  QueuesFile,
  SettingsFile,
} from "@rpa-platform/config-schema";
import { TENANTS, can, isTenantName, type TenantName } from "@rpa-platform/shared";
import type { Reconciler } from "@rpa-platform/reconciler";
import { sendError } from "../error-mapper.js";
import { requirePermission, type IdentityResolver } from "../identity.js";
import { requireCapability } from "../orchestrator-capabilities.js";

const ReconcileBody = z.object({
  callerEmail: z.string().email(),
  project: z.object({ name: z.string().min(1) }),
  tenant: z.enum(TENANTS as readonly [TenantName, ...TenantName[]]),
  tenantStatus: z.enum(["connected", "pending_credentials", "auth_failed"]),
  pinnedFrameworkVersion: z.string().min(1),
  bucketIdForConfig: z.number().int().positive(),
  folderId: z.union([z.string(), z.number()]),
  configs: z.object({
    settings: SettingsFile,
    constants: ConstantsFile,
    assets: AssetsFile,
    queues: QueuesFile,
    buckets: BucketsFile,
    credentials: CredentialsFile,
    overrides: OverridesFile,
  }),
});

export interface ReconcileRoutesDeps {
  readonly reconciler: Reconciler;
  readonly identity: IdentityResolver;
}

export function registerReconcileRoutes(app: FastifyInstance, deps: ReconcileRoutesDeps): void {
  app.post("/reconcile/dry-run", async (request, reply) => {
    try {
      const body = ReconcileBody.parse(request.body);
      const platformPermission = body.tenant === "dev" ? "config.quick_edit" : "asset.query";
      const identity = await requirePermission(
        deps.identity,
        body.callerEmail,
        platformPermission,
        { tenant: body.tenant, project: body.project.name },
        request.correlationId,
      );
      // Orchestrator-side capability preflight (memory:
      // orchestrator_capability_preflight). Only proceeds if the caller's
      // Orchestrator role(s) cover what a dry-run reads.
      requireCapability(identity.orchestratorRoleNames, "reconcile.dry_run", {
        correlationId: request.correlationId,
        tenant: body.tenant,
      });
      const result = await deps.reconciler.dryRun({
        tenant: body.tenant,
        tenantStatus: body.tenantStatus,
        project: body.project,
        pinnedFrameworkVersion: body.pinnedFrameworkVersion,
        bucketIdForConfig: body.bucketIdForConfig,
        folderId: body.folderId,
        configs: { ...body.configs, tenant: body.tenant },
      });
      return reply.send({ correlationId: request.correlationId, ...result });
    } catch (err) {
      await sendError(reply, err);
    }
  });

  app.post("/reconcile/apply", async (request, reply) => {
    try {
      const body = ReconcileBody.parse(request.body);
      const platformPermission = body.tenant === "dev"
        ? "config.quick_edit"
        : body.tenant === "test"
          ? "pr.approve.dev_to_test"
          : body.tenant === "stage"
            ? "pr.approve.test_to_stage"
            : "pr.approve.stage_to_prod";
      const identity = await requirePermission(
        deps.identity,
        body.callerEmail,
        platformPermission,
        { tenant: body.tenant, project: body.project.name },
        request.correlationId,
      );
      // Tiered delete policy (memory: tiered_delete_policy):
      //   1. Matrix grant — does this caller have RECONCILE_DELETE on this
      //      tenant? prod is intentionally false for everyone.
      //   2. If yes: also require the four *.Delete Orchestrator
      //      capabilities. If no: stick with the additive `reconcile.apply`
      //      requirement and let the reconciler skip+audit deletes.
      const allowDeletes = can(identity.user, "reconcile.delete", { tenant: body.tenant });
      requireCapability(
        identity.orchestratorRoleNames,
        allowDeletes ? "reconcile.apply_with_deletes" : "reconcile.apply",
        { correlationId: request.correlationId, tenant: body.tenant },
      );
      const result = await deps.reconciler.apply(
        {
          tenant: body.tenant,
          tenantStatus: body.tenantStatus,
          project: body.project,
          pinnedFrameworkVersion: body.pinnedFrameworkVersion,
          bucketIdForConfig: body.bucketIdForConfig,
          folderId: body.folderId,
          configs: { ...body.configs, tenant: body.tenant },
          allowDeletes,
        },
        request.correlationId,
      );
      return reply.send(result);
    } catch (err) {
      await sendError(reply, err);
    }
  });

  // Listing helper for docs / debugging — reflects the canonical tenant set.
  app.get("/tenants", async () => ({ tenants: TENANTS, isTenantName: isTenantName.toString() }));
}
