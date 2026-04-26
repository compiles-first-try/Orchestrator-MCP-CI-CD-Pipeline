import { z } from "zod";
import { descriptionSchema, nameSchema } from "../common.js";

export const CREDENTIAL_KINDS = ["username-password", "api-key", "oauth-token"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const credentialSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  kind: z.enum(CREDENTIAL_KINDS),
});

export type Credential = z.infer<typeof credentialSchema>;

export const credentialsSchema = z.array(credentialSchema).superRefine((items, ctx) => {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item === undefined) continue;
    if (seen.has(item.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [i, "name"],
        message: `duplicate credential name: '${item.name}'`,
      });
    }
    seen.add(item.name);
  }
});

export type Credentials = z.infer<typeof credentialsSchema>;
