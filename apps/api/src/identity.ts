import {
  PermissionDeniedError,
  type PermissionContext,
  type PermissionKey,
  type Role,
  type UserWithRoles,
  can,
} from "@rpa-platform/shared";
import type { OrchestratorClient, UserEntity } from "@rpa-platform/orchestrator-client";

// Per the architecture decisions captured in memory, Orchestrator owns the
// role assignments. The platform reads them at request time and applies the
// §7 matrix in shared/permissions. The capability preflight (memory:
// orchestrator_capability_preflight) consumes the raw Orchestrator role
// names too — exposed alongside the mapped UserWithRoles via ResolvedIdentity.

export interface OrchestratorRoleMapping {
  readonly orchestratorRoleNamesToSystemRole: Readonly<Record<string, "developer" | "admin" | "ba">>;
}

export const DEFAULT_ROLE_MAPPING: OrchestratorRoleMapping = {
  orchestratorRoleNamesToSystemRole: {
    Administrator: "admin",
    "Folder Administrator": "admin",
    Developer: "developer",
    "Business Analyst": "ba",
  },
};

export interface ResolvedIdentity {
  readonly user: UserWithRoles;
  readonly orchestratorUserId: number;
  readonly orchestratorRoleNames: readonly string[];
}

export interface IdentityResolver {
  resolveBySlackEmail(email: string): Promise<ResolvedIdentity | undefined>;
}

export interface IdentityResolverDeps {
  readonly orchestrator: OrchestratorClient;
  readonly mapping?: OrchestratorRoleMapping;
  readonly systemRoles: Readonly<Record<"developer" | "admin" | "ba", Role>>;
}

export interface HarvardFuzzyOptions {
  // Substring the Slack email's domain MUST contain (case-insensitive).
  // Defaults to "harvard"; configurable so the org can change conventions
  // without a code edit.
  readonly domainSubstring?: string;
}

export function createIdentityResolver(deps: IdentityResolverDeps): IdentityResolver {
  const mapping = deps.mapping ?? DEFAULT_ROLE_MAPPING;
  return {
    async resolveBySlackEmail(email) {
      const user = await deps.orchestrator.users.getByEmail(email);
      if (user === undefined) return undefined;
      return resolveIdentityFromUser(deps, mapping, user);
    },
  };
}

// Tries exact-email first; on miss, falls back to the Harvard fuzzy rule
// (memory: fuzzy_email_match):
//   1. Slack email's domain must contain `domainSubstring` (default "harvard").
//   2. Slack email's local-part must contain (case-insensitively) the
//      Orchestrator user's `Name` OR `Surname`.
//   3. If multiple candidates match, the first is returned and a warning
//      is emitted via the optional `onAmbiguous` callback.
export function createHarvardFuzzyIdentityResolver(
  deps: IdentityResolverDeps,
  options: HarvardFuzzyOptions = {},
  onAmbiguous?: (email: string, candidates: readonly UserEntity[]) => void,
): IdentityResolver {
  const mapping = deps.mapping ?? DEFAULT_ROLE_MAPPING;
  const domainSubstring = (options.domainSubstring ?? "harvard").toLowerCase();
  return {
    async resolveBySlackEmail(email) {
      const exact = await deps.orchestrator.users.getByEmail(email);
      if (exact !== undefined) {
        return resolveIdentityFromUser(deps, mapping, exact);
      }
      const lower = email.toLowerCase();
      const atIndex = lower.indexOf("@");
      if (atIndex < 1 || atIndex === lower.length - 1) return undefined;
      const localPart = lower.slice(0, atIndex);
      const domain = lower.slice(atIndex + 1);
      if (!domain.includes(domainSubstring)) return undefined;

      const candidates = await deps.orchestrator.users.list({ activeOnly: true });
      const matches = candidates.filter((u) => emailMatchesNameParts(localPart, u));
      if (matches.length === 0) return undefined;
      if (matches.length > 1 && onAmbiguous !== undefined) {
        onAmbiguous(email, matches);
      }
      const chosen = matches[0];
      if (chosen === undefined) return undefined;
      return resolveIdentityFromUser(deps, mapping, chosen);
    },
  };
}

function emailMatchesNameParts(localPart: string, user: UserEntity): boolean {
  const first = (user.Name ?? "").toLowerCase().trim();
  const last = (user.Surname ?? "").toLowerCase().trim();
  if (first === "" && last === "") return false;
  if (first.length >= 2 && localPart.includes(first)) return true;
  if (last.length >= 2 && localPart.includes(last)) return true;
  return false;
}

async function resolveIdentityFromUser(
  deps: IdentityResolverDeps,
  mapping: OrchestratorRoleMapping,
  user: UserEntity,
): Promise<ResolvedIdentity> {
  const orchestratorRoles = await deps.orchestrator.users.listRoles(user.Id);
  const orchestratorRoleNames = orchestratorRoles.map((r) => r.Name);
  const systemRoles: Role[] = [];
  const seen = new Set<string>();
  for (const role of orchestratorRoles) {
    const mapped = mapping.orchestratorRoleNamesToSystemRole[role.Name];
    if (mapped === undefined) continue;
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    systemRoles.push(deps.systemRoles[mapped]);
  }
  return {
    user: { id: String(user.Id), roles: systemRoles },
    orchestratorUserId: user.Id,
    orchestratorRoleNames,
  };
}

// Convenience helper for route handlers — looks up the user, evaluates the
// permission, throws PermissionDeniedError on miss. Returns the resolved
// identity (including raw Orchestrator role names) so the caller can run
// the capability preflight in apps/api/src/orchestrator-capabilities.ts.
export async function requirePermission(
  resolver: IdentityResolver,
  email: string,
  permission: PermissionKey,
  context: PermissionContext = {},
  correlationId?: string,
): Promise<ResolvedIdentity> {
  const identity = await resolver.resolveBySlackEmail(email);
  if (identity === undefined) {
    throw new PermissionDeniedError(permission, {
      ...(correlationId !== undefined && { correlationId }),
      details: { reason: "no_orchestrator_identity", email },
    });
  }
  if (!can(identity.user, permission, context)) {
    throw new PermissionDeniedError(permission, {
      ...(correlationId !== undefined && { correlationId }),
      details: { userId: identity.user.id, context },
    });
  }
  return identity;
}
