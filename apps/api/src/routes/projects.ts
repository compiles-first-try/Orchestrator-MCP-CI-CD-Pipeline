import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendError } from "../error-mapper.js";
import { requirePermission, type IdentityResolver } from "../identity.js";
import type { ProjectProvisioningService, TemplateRef } from "../services/project-provisioning.js";
import { createKeywordIntentParser, type IntentParser } from "../intent/parser.js";
import type { ProjectRepo } from "../db-adapters/projects.js";
import type { UserRepo } from "../db-adapters/users.js";

const NewProjectBody = z.object({
  callerEmail: z.string().email(),
  // Free-text intent — Slack passes everything after `/rpa new`. The API
  // delegates parsing to the IntentParser so the LLM-backed implementation
  // can be plugged in without changing the route.
  text: z.string().min(1),
  // Optional override of the configured framework template repo. Useful
  // when an admin wants to spin up a new project from a different template
  // for a one-off (e.g. a customer-specific REFramework variant).
  templateOverride: z
    .object({
      owner: z.string().min(1),
      repo: z.string().min(1),
    })
    .optional(),
  pinnedFrameworkVersion: z.string().min(1).default("1.0.0"),
  // Tenant context for the seed Config.json drop. Both must be supplied
  // together; if either is absent the repo is still created but the seed
  // step is skipped and the response asks the admin to run
  // `/rpa tenant connect <project> dev` afterwards.
  devBucketId: z.number().int().positive().optional(),
  devFolderId: z.union([z.string(), z.number()]).optional(),
});

export interface ProjectsRoutesDeps {
  readonly identity: IdentityResolver;
  readonly provisioning: ProjectProvisioningService;
  readonly defaultTemplate: TemplateRef;
  readonly projectRepoOwner: string;
  readonly users: UserRepo;
  readonly projects: ProjectRepo;
  readonly intentParser?: IntentParser;
}

export function registerProjectsRoutes(app: FastifyInstance, deps: ProjectsRoutesDeps): void {
  const intentParser = deps.intentParser ?? createKeywordIntentParser();

  app.post("/projects", async (request, reply) => {
    try {
      const body = NewProjectBody.parse(request.body);
      // PROJECT_PROVISION is admin-only per the §7 matrix — see
      // packages/shared/src/permissions/system-roles.ts.
      await requirePermission(
        deps.identity,
        body.callerEmail,
        "project.provision",
        {},
        request.correlationId,
      );
      const intent = intentParser.parseProjectIntent(body.text);
      const seedTenant =
        body.devBucketId !== undefined && body.devFolderId !== undefined
          ? { bucketId: body.devBucketId, folderId: body.devFolderId }
          : undefined;

      const provisionResult = await deps.provisioning.provision({
        intent,
        projectRepoOwner: deps.projectRepoOwner,
        template: body.templateOverride ?? deps.defaultTemplate,
        ...(seedTenant !== undefined && {
          devBucketId: seedTenant.bucketId,
          devFolderId: seedTenant.folderId,
        }),
        pinnedFrameworkVersion: intent.frameworkVersion ?? body.pinnedFrameworkVersion,
        ...(request.correlationId !== undefined && { correlationId: request.correlationId }),
      });

      // Register the project in the platform DB so subsequent ops
      // (`/rpa tenant connect <project>`, `/rpa apply`) can find it by name.
      // Idempotent: if a project with this name already exists we keep the
      // existing row (don't clobber its repoUrl etc.).
      const callerUser = await deps.users.upsertByEmail({
        email: body.callerEmail,
        displayName: body.callerEmail,
      });
      const existingProject = await deps.projects.getByName(intent.name);
      const project =
        existingProject ??
        (await deps.projects.create({
          name: intent.name,
          displayName: intent.name,
          repoUrl: provisionResult.repoUrl,
          frameworkVersionPinned: intent.frameworkVersion ?? body.pinnedFrameworkVersion,
          ownerUserId: callerUser.id,
        }));

      return reply.code(201).send({
        correlationId: request.correlationId,
        intent,
        result: provisionResult,
        project: { id: project.id, name: project.name, repoUrl: project.repoUrl },
        seedTenantSkipped: seedTenant === undefined,
        nextStep:
          seedTenant === undefined
            ? `Now run \`/rpa tenant connect\` in Slack and select project '${project.name}' to wire your dev tenant.`
            : null,
      });
    } catch (err) {
      await sendError(reply, err);
    }
  });
}
