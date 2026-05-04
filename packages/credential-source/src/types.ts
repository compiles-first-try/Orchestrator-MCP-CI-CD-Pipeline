import { z } from "zod";

// What the credential-source returns to a caller (the reconciler) so the
// caller can stamp it onto an Orchestrator Asset of type Credential.
export const CredentialValue = z.object({
  username: z.string().optional(),
  password: z.string(),
});
export type CredentialValue = z.infer<typeof CredentialValue>;

// The contract every credential-source implements. v1 ships `manual`; v2
// brings AWS Secrets Manager (already present as a NotImplementedError stub
// so the interface is shared and forward-compatible).
export interface CredentialSource {
  readonly kind: "manual" | "aws";
  resolve(secretRef: string): Promise<CredentialValue>;
}

// Storage interface for the manual source. The actual table is
// `credential_values` in @rpa-platform/db; this abstraction keeps the
// credential-source unit tests free of a database dependency.
export interface ManualSecretStore {
  read(secretRef: string): Promise<string | null>; // returns the encrypted blob
  write(secretRef: string, encrypted: string): Promise<void>;
  remove(secretRef: string): Promise<void>;
}
