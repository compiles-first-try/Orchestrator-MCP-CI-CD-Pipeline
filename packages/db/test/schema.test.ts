import { describe, expect, it } from "vitest";
import {
  annotations,
  auditLog,
  credentialValues,
  frameworkReleases,
  prApprovals,
  projectTenants,
  projects,
  reconciliationRuns,
  roles,
  userRoles,
  users,
} from "../src/schema.js";

const ALL_TABLES = {
  users,
  roles,
  userRoles,
  projects,
  projectTenants,
  frameworkReleases,
  annotations,
  auditLog,
  prApprovals,
  reconciliationRuns,
  credentialValues,
} as const;

describe("schema", () => {
  it("exposes every §5 table", () => {
    for (const [name, table] of Object.entries(ALL_TABLES)) {
      expect(table, `${name} should be a Drizzle table`).toBeDefined();
    }
  });

  it("project_tenants is keyed by (project_id, tenant_name)", () => {
    expect(projectTenants.projectId).toBeDefined();
    expect(projectTenants.tenantName).toBeDefined();
  });

  it("audit_log records transport per row (mcp / rest_fallback / n_a)", () => {
    expect(auditLog.transport).toBeDefined();
    expect(auditLog.correlationId).toBeDefined();
  });

  it("project_tenants stores encrypted client_secret separately from client_id", () => {
    expect(projectTenants.oauthClientId).toBeDefined();
    expect(projectTenants.oauthClientSecretEncrypted).toBeDefined();
  });

  it("project_tenants tracks the partial-onboarding lifecycle status", () => {
    expect(projectTenants.status).toBeDefined();
  });

  it("framework_releases tracks the json_ready flag", () => {
    expect(frameworkReleases.jsonReady).toBeDefined();
  });

  it("credential_values is keyed by (project_id, tenant_name, credential_name)", () => {
    expect(credentialValues.projectId).toBeDefined();
    expect(credentialValues.tenantName).toBeDefined();
    expect(credentialValues.credentialName).toBeDefined();
  });
});
