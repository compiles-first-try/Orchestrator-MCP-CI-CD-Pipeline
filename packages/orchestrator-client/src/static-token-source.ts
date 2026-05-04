import type { TokenSource } from "./rest-client.js";

// Personal Access Token (PAT) source. Useful for local testing on UiPath
// Automation Cloud Community where the External Application registration UI
// may not be available, and as a one-line alternative when a tenant admin
// hasn't yet provisioned an OAuth2 External App.
//
// Production deployments should still use OAuth2 client_credentials via
// TokenManager — PATs are tied to a single user account and don't fit the
// spec's "service principal per tenant" pattern (invariant #6). This source
// is intentionally separate so it can never be confused with OAuth2 flow
// and so the audit/permission story remains unambiguous.
//
// VERIFY at runtime: the Bearer-token format UiPath expects for PATs is the
// raw token string (no "PAT " prefix). The Authorization header rendered by
// RestClient becomes `<tokenType> <token>` — `tokenType` defaults to
// "Bearer" here, matching what `/identity_/connect/token` returns on the
// OAuth2 path.
export interface StaticTokenSourceOptions {
  readonly token: string;
  readonly tokenType?: string;
}

export function createStaticTokenSource(options: StaticTokenSourceOptions): TokenSource {
  if (options.token.length === 0) {
    throw new Error("StaticTokenSource: token must be a non-empty string.");
  }
  const tokenType = options.tokenType ?? "Bearer";
  return {
    async getToken() {
      return { token: options.token, tokenType };
    },
  };
}
