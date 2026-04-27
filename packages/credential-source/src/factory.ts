import type { Database } from "@rpa-platform/db";
import { AwsCredentialSource, type AwsCredentialSourceConfig } from "./aws.js";
import { ManualCredentialSource } from "./manual.js";
import { DrizzleCredentialStore } from "./store.js";
import type { CredentialSource } from "./types.js";

export interface ManualFactoryConfig {
  readonly db: Database;
  readonly encryptionKey: Buffer;
}

export type CredentialSourceConfig =
  | { readonly type: "manual"; readonly config: ManualFactoryConfig }
  | { readonly type: "aws"; readonly config: AwsCredentialSourceConfig };

export function createCredentialSource(input: CredentialSourceConfig): CredentialSource {
  switch (input.type) {
    case "manual":
      return new ManualCredentialSource({
        store: new DrizzleCredentialStore(input.config.db),
        encryptionKey: input.config.encryptionKey,
      });
    case "aws":
      return new AwsCredentialSource(input.config);
  }
}
