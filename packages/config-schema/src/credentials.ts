import { z } from "zod";
import { DescriptionString, NameString, SchemaVersionField, TagList } from "./primitives.js";

// Credentials are materialised in Orchestrator as Assets of type Credential
// (or WindowsCredential). We separate them from assets.json so secret
// material is never co-located with non-secret data, and so the
// `credential-source` interface can be wired per-credential.
//
// The actual secret value is NEVER in this file. `secretSource` names which
// credential-source backs the secret; `secretRef` is the reference passed
// to that source (e.g. an AWS Secrets Manager ARN, or a manual-source key).
// In v1 only `manual` is implemented; `aws` is a stub.
export const CREDENTIAL_KINDS = ["credential", "windowsCredential"] as const;
export const CredentialKind = z.enum(CREDENTIAL_KINDS);
export type CredentialKind = z.infer<typeof CredentialKind>;

export const SECRET_SOURCES = ["manual", "aws"] as const;
export const SecretSource = z.enum(SECRET_SOURCES);
export type SecretSource = z.infer<typeof SecretSource>;

export const Credential = z.object({
  name: NameString,
  description: DescriptionString.optional(),
  kind: CredentialKind.default("credential"),

  // Username, if known at config time. Some credential sources resolve
  // username at fetch time; in that case omit this and let the source supply
  // both halves.
  username: z.string().min(1).max(512).optional(),

  // Which credential-source backs the secret.
  secretSource: SecretSource,

  // Reference passed to the credential-source. Format is source-defined:
  // - manual: the storage key in `credential_values` (DB-side, encrypted).
  // - aws:    the Secrets Manager ARN or name.
  secretRef: z.string().min(1).max(2048),

  tags: TagList.optional(),
});

export type Credential = z.infer<typeof Credential>;

export const CredentialsFile = z
  .object({
    schemaVersion: SchemaVersionField,
    credentials: z.array(Credential).max(512),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < file.credentials.length; i++) {
      const credential = file.credentials[i];
      if (credential === undefined) continue;
      if (seen.has(credential.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["credentials", i, "name"],
          message: `duplicate credential name '${credential.name}'`,
        });
      }
      seen.add(credential.name);
    }
  });

export type CredentialsFile = z.infer<typeof CredentialsFile>;
