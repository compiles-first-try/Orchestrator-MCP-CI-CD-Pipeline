// AWS Secrets Manager — credential monitoring & rotation alerting (v2 stub)
//
// Planned capabilities:
//   1. Store/retrieve credentials from AWS Secrets Manager instead of manual entry
//   2. Track credential expiration dates
//   3. Alert via Slack when credentials are 1 month and 1 week from expiring
//   4. Optionally trigger credential rotation workflows
//
// This module is NOT active — it exists to document the intended interface
// and ensure the architecture has seams for it. See packages/credential-source/src/aws.ts
// for the credential-source adapter that will use this.
//
// Prerequisites before implementation:
//   - Add @aws-sdk/client-secrets-manager to spec §3 dependencies
//   - AWS IAM role/credentials for the platform service
//   - Slack webhook or bot channel for expiration alerts
//   - Decision: one AWS account for all tenants, or per-tenant?

export interface SecretMetadata {
  readonly arn: string;
  readonly name: string;
  readonly description?: string;
  readonly createdDate?: Date;
  readonly lastRotatedDate?: Date;
  readonly nextRotationDate?: Date;
  readonly expiresAt?: Date;
  readonly tags?: Record<string, string>;
}

export interface ExpirationAlert {
  readonly secretName: string;
  readonly expiresAt: Date;
  readonly daysUntilExpiry: number;
  readonly alertLevel: "one_month" | "one_week" | "expired";
  readonly tenant?: string;
}

export interface AwsSecretsMonitorConfig {
  readonly region: string;
  readonly alertSlackChannelId?: string;
  readonly checkIntervalHours?: number;
  readonly oneMonthWarningDays?: number;
  readonly oneWeekWarningDays?: number;
}

// v2 interface — not implemented yet
export interface AwsSecretsMonitor {
  listManagedSecrets(): Promise<readonly SecretMetadata[]>;
  checkExpirations(): Promise<readonly ExpirationAlert[]>;
  storeCredential(name: string, value: Record<string, string>, expiresAt?: Date): Promise<string>;
  rotateCredential(arn: string): Promise<void>;
}

export const AWS_SECRETS_MONITOR_NOT_IMPLEMENTED =
  "AWS Secrets Manager monitoring is planned for v2. " +
  "See integrations/aws-secrets/src/monitor.ts for the intended interface.";
