# AWS Secrets Manager Integration (v2)

> **Status: Placeholder** — interfaces defined, implementation deferred to v2.

## Planned features

1. **Credential storage**: Store UiPath Orchestrator credentials (OAuth client secrets, asset credentials) in AWS Secrets Manager instead of manual entry
2. **Expiration tracking**: Track when credentials expire
3. **Proactive alerts**: Notify via Slack at 1-month and 1-week warning thresholds
4. **Rotation support**: Optionally trigger AWS Secrets Manager rotation lambdas

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│  Scheduled job       │────▶│  AWS Secrets Manager  │
│  (cron / GitHub      │     │  (list + check dates) │
│   Action schedule)   │     └──────────────────────┘
│                      │                │
│                      │     ┌──────────▼──────────┐
│                      │────▶│  Slack notification  │
│                      │     │  (#rpa-platform)     │
└─────────────────────┘     └─────────────────────┘
```

## Files

- `src/monitor.ts` — Interface definitions for `AwsSecretsMonitor`
- `packages/credential-source/src/aws.ts` — Existing adapter stub (wired into the credential-source registry)

## Prerequisites

- [ ] Add `@aws-sdk/client-secrets-manager` to dependencies
- [ ] AWS IAM role with `secretsmanager:GetSecretValue`, `secretsmanager:ListSecrets`, `secretsmanager:DescribeSecret`
- [ ] Decide: one AWS account across tenants or per-tenant isolation?
- [ ] Slack webhook configuration for alert channel

## Integration with UiPath credential stores

UiPath Orchestrator supports [AWS Secrets Manager as a credential store](https://docs.uipath.com/orchestrator/automation-cloud/latest/user-guide/integrating-credential-stores#aws-secrets-manager-integration). This integration could work in two ways:

1. **Platform-managed**: The platform stores/retrieves credentials via AWS SDK and pushes them to Orchestrator assets (current architecture)
2. **Orchestrator-native**: Configure Orchestrator's built-in AWS credential store integration, and the platform only manages the AWS side

Option 1 gives more control; option 2 reduces platform surface area. Decision deferred to v2.
