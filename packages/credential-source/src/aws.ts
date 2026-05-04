import { NotImplementedError } from "@rpa-platform/shared";
import type { CredentialSource, CredentialValue } from "./types.js";

// AWS Secrets Manager credential-source — v2 stub. The interface is wired so
// callers can already discriminate by `kind`; only `resolve()` throws
// NotImplementedError. When v2 lands, the constructor will accept an
// AWS SDK client and the resolve() body will fetch by ARN/name.
//
// Memory: the user has confirmed AWS Secrets Manager is the intended
// production credential source (`credential_source_aws.md`).
export interface AwsCredentialSourceOptions {
  // VERIFY (v2): exact AWS SDK client type once the dependency is added to
  // the spec's §3. For now we accept `unknown` so the stub doesn't pull in
  // the SDK as a dependency.
  readonly client?: unknown;
  readonly region?: string;
}

export class AwsCredentialSource implements CredentialSource {
  public readonly kind = "aws" as const;

  // The constructor stays callable (no throw at instantiation) so the
  // platform can register it during boot without crashing.
  constructor(_options: AwsCredentialSourceOptions = {}) {
    // intentional no-op
  }

  async resolve(_secretRef: string): Promise<CredentialValue> {
    throw new NotImplementedError("AWS Secrets Manager credential-source");
  }
}
