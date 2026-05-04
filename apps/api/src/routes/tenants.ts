import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TENANTS, type TenantName } from "@rpa-platform/shared";
import { sendError } from "../error-mapper.js";
import { requirePermission, type IdentityResolver } from "../identity.js";
import { requireCapability } from "../orchestrator-capabilities.js";
import type { TenantConnectService } from "../services/tenant-connect.js";

const ConnectBody = z.object({
  callerEmail: z.string().email(),
  projectName: z.string().min(1),
  tenant: z.enum(TENANTS as readonly [TenantName, ...TenantName[]]),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  folderId: z.string().min(1),
  orchestratorUrl: z.string().url().optional(),
  identityTokenUrl: z.string().url(),
  scopes: z.array(z.string().min(1)).default(["OR.Default"]),
  validate: z.boolean().default(true),
});

export interface TenantsRoutesDeps {
  readonly identity: IdentityResolver;
  readonly tenantConnect: TenantConnectService;
}

export function registerTenantRoutes(app: FastifyInstance, deps: TenantsRoutesDeps): void {
  app.post("/tenants/connect", async (request, reply) => {
    try {
      const body = ConnectBody.parse(request.body);
      const identity = await requirePermission(
        deps.identity,
        body.callerEmail,
        "credential.set",
        { tenant: body.tenant, project: body.projectName },
        request.correlationId,
      );
      // Capability preflight: connecting requires that the caller's
      // Orchestrator role(s) cover the read-side ops the platform performs
      // on first reconcile (and Users/Roles read for identity resolution).
      requireCapability(identity.orchestratorRoleNames, "tenant.connect", {
        correlationId: request.correlationId,
        tenant: body.tenant,
      });
      const result = await deps.tenantConnect.connect({
        projectName: body.projectName,
        tenant: body.tenant,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        folderId: body.folderId,
        ...(body.orchestratorUrl !== undefined && { orchestratorUrl: body.orchestratorUrl }),
        identityTokenUrl: body.identityTokenUrl,
        scopes: body.scopes,
        validate: body.validate,
        ...(request.correlationId !== undefined && { correlationId: request.correlationId }),
      });
      return reply.send({
        correlationId: request.correlationId,
        ...result,
      });
    } catch (err) {
      await sendError(reply, err);
    }
  });
}
