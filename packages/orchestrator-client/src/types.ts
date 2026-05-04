// Per-tenant connection details. The platform stores `clientSecret` encrypted
// at rest (AES-256-GCM via @rpa-platform/shared/encryption); the caller is
// expected to decrypt before constructing a TokenManager. Plaintext secrets
// must never round-trip through the DB or logs.
export interface TenantConnectionConfig {
  readonly identityTokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes: readonly string[];
}

export interface AccessToken {
  readonly token: string;
  readonly tokenType: string;
  readonly expiresAt: Date;
  readonly obtainedAt: Date;
  readonly scopesGranted: readonly string[];
}
