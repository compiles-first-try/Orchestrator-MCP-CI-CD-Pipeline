import { TENANTS, type RolePermissions, type TenantName } from "@rpa-platform/shared";

export interface SeedRole {
  readonly name: "developer" | "admin" | "ba";
  readonly permissions: RolePermissions;
  readonly isSystem: true;
}

export interface SeedUser {
  readonly slackUserId: string;
  readonly githubLogin: string;
  readonly email: string;
  readonly displayName: string;
  readonly roles: ReadonlyArray<SeedRole["name"]>;
}

export interface SeedFrameworkRelease {
  readonly version: string;
  readonly jsonReady: boolean;
  readonly releaseNotes: string;
}

export interface SeedProject {
  readonly name: string;
  readonly displayName: string;
  readonly repoUrl: string;
  readonly frameworkVersionPinned: string;
}

export interface SeedTenantRow {
  readonly tenantName: TenantName;
  readonly status: "pending_credentials";
}

export const SEED_FRAMEWORK_RELEASES: readonly SeedFrameworkRelease[] = [
  {
    version: "1.0.0",
    jsonReady: false,
    releaseNotes: "Initial REFramework release; legacy Excel config.",
  },
  {
    version: "2.0.0",
    jsonReady: true,
    releaseNotes: "JSON-ready framework. Excel auto-deactivates per project.",
  },
];

export const SEED_PROJECT: SeedProject = {
  name: "demo-bot",
  displayName: "Demo Bot",
  repoUrl: "https://github.test/acme/demo-bot",
  frameworkVersionPinned: "2.0.0",
};

export const SEED_TENANTS: readonly SeedTenantRow[] = TENANTS.map((tenantName) => ({
  tenantName,
  status: "pending_credentials" as const,
}));

export const SEED_USERS: readonly SeedUser[] = [
  {
    slackUserId: "U_DEV",
    githubLogin: "dev-user",
    email: "dev@example.test",
    displayName: "Dev User",
    roles: ["developer"],
  },
  {
    slackUserId: "U_ADMIN",
    githubLogin: "admin-user",
    email: "admin@example.test",
    displayName: "Platform Admin",
    roles: ["admin"],
  },
  {
    slackUserId: "U_BA",
    githubLogin: "ba-user",
    email: "ba@example.test",
    displayName: "Business Analyst",
    roles: ["ba"],
  },
];
