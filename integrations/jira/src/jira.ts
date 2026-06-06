// Jira Integration — automated ticketing on commits/deployments (v2 stub)
//
// Planned capabilities:
//   1. Create Jira stories/tasks when a developer commits code
//   2. Populate ticket with: commit message, XAML files affected, time spent
//   3. Link tickets to deployments and PR merges
//   4. Track deployment status in Jira (dev → test → stage → prod)
//
// This module is NOT active — it documents the intended interface and
// ensures the architecture has seams for it.
//
// Prerequisites before implementation:
//   - Jira Cloud API token or OAuth app
//   - Jira project key and board configuration
//   - Decision: one ticket per commit, per PR, or per deployment?
//   - Mapping: which Jira issue type (Story, Task, Sub-task)?

export interface JiraTicketInput {
  readonly projectKey: string;
  readonly summary: string;
  readonly description: string;
  readonly issueType: "Story" | "Task" | "Sub-task" | "Bug";
  readonly labels?: readonly string[];
  readonly components?: readonly string[];
  readonly assignee?: string;
  readonly customFields?: Record<string, unknown>;
}

export interface CommitInfo {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly timestamp: string;
  readonly branch: string;
  readonly filesChanged: readonly string[];
  readonly xamlFilesAffected: readonly string[];
}

export interface DeploymentInfo {
  readonly tenant: string;
  readonly project: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly assetsChanged: number;
  readonly packagesUploaded: number;
  readonly status: "success" | "failed" | "dry-run";
}

export interface JiraConfig {
  readonly baseUrl: string;
  readonly projectKey: string;
  readonly apiToken?: string;
  readonly userEmail?: string;
  readonly defaultIssueType?: string;
  readonly defaultLabels?: readonly string[];
}

// v2 interface — not implemented yet
export interface JiraIntegration {
  createTicketFromCommit(commit: CommitInfo, config: JiraConfig): Promise<string>;
  createTicketFromDeployment(deployment: DeploymentInfo, config: JiraConfig): Promise<string>;
  updateTicketStatus(issueKey: string, status: string): Promise<void>;
  addDeploymentComment(issueKey: string, deployment: DeploymentInfo): Promise<void>;
}

export const JIRA_INTEGRATION_NOT_IMPLEMENTED =
  "Jira integration is planned for v2. " +
  "See integrations/jira/src/jira.ts for the intended interface.";
