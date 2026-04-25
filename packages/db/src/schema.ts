import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { RolePermissions } from "@rpa-platform/shared";

// Enums --------------------------------------------------------------

export const tenantNameEnum = pgEnum("tenant_name", ["dev", "test", "stage", "prod"]);

export const tenantStatusEnum = pgEnum("tenant_status", [
  "pending_credentials",
  "connected",
  "auth_failed",
]);

export const auditTransportEnum = pgEnum("audit_transport", ["mcp", "rest_fallback", "n_a"]);

export const prApprovalStatusEnum = pgEnum("pr_approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const reconcileStatusEnum = pgEnum("reconcile_status", [
  "pending",
  "running_dry_run",
  "dry_run_complete",
  "applying",
  "applied",
  "failed",
]);

// Tables -------------------------------------------------------------

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  permissions: jsonb("permissions").$type<RolePermissions>().notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  slackUserId: text("slack_user_id").unique(),
  githubLogin: text("github_login").unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  defaultRoleId: uuid("default_role_id").references(() => roles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  }),
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  repoUrl: text("repo_url").notNull(),
  repoId: text("repo_id"),
  frameworkVersionPinned: text("framework_version_pinned").notNull(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectTenants = pgTable(
  "project_tenants",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tenantName: tenantNameEnum("tenant_name").notNull(),
    orchestratorUrl: text("orchestrator_url"),
    mcpUrl: text("mcp_url"),
    folderId: text("folder_id"),
    oauthClientId: text("oauth_client_id"),
    oauthClientSecretEncrypted: text("oauth_client_secret_encrypted"),
    oauthScopes: text("oauth_scopes").array(),
    tokenCacheExpiresAt: timestamp("token_cache_expires_at", { withTimezone: true }),
    status: tenantStatusEnum("status").notNull().default("pending_credentials"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.tenantName] }),
  }),
);

export const frameworkReleases = pgTable("framework_releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull().unique(),
  releaseNotes: text("release_notes"),
  jsonReady: boolean("json_ready").notNull().default(false),
  releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
  releasedByUserId: uuid("released_by_user_id").references(() => users.id),
});

export const annotations = pgTable("annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  branch: text("branch").notNull(),
  filePath: text("file_path").notNull(),
  content: text("content").notNull(),
  authorUserId: uuid("author_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  locked: boolean("locked").notNull().default(false),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  success: boolean("success").notNull(),
  error: text("error"),
  correlationId: text("correlation_id").notNull(),
  transport: auditTransportEnum("transport").notNull().default("n_a"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prApprovals = pgTable("pr_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  prNumber: integer("pr_number").notNull(),
  fromBranch: text("from_branch").notNull(),
  toBranch: text("to_branch").notNull(),
  approverUserId: uuid("approver_user_id").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  status: prApprovalStatusEnum("status").notNull().default("pending"),
});

export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  tenantName: tenantNameEnum("tenant_name").notNull(),
  branch: text("branch").notNull(),
  commitSha: text("commit_sha").notNull(),
  diff: jsonb("diff"),
  status: reconcileStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id),
  error: text("error"),
});

export const credentialValues = pgTable(
  "credential_values",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tenantName: tenantNameEnum("tenant_name").notNull(),
    credentialName: text("credential_name").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    setByUserId: uuid("set_by_user_id")
      .notNull()
      .references(() => users.id),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.tenantName, t.credentialName] }),
  }),
);

// Inferred row types --------------------------------------------------

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectTenant = typeof projectTenants.$inferSelect;
export type NewProjectTenant = typeof projectTenants.$inferInsert;
export type FrameworkRelease = typeof frameworkReleases.$inferSelect;
export type NewFrameworkRelease = typeof frameworkReleases.$inferInsert;
export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
export type PrApproval = typeof prApprovals.$inferSelect;
export type NewPrApproval = typeof prApprovals.$inferInsert;
export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type NewReconciliationRun = typeof reconciliationRuns.$inferInsert;
export type CredentialValue = typeof credentialValues.$inferSelect;
export type NewCredentialValue = typeof credentialValues.$inferInsert;
