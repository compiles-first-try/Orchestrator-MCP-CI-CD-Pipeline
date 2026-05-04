import { AwsCredentialSource } from "./aws.js";
import { ManualCredentialSource } from "./manual.js";
import type { CredentialSource } from "./types.js";

// Tiny registry so callers (the reconciler) can look up the right source for
// a given `secretSource` value from credentials.json (`'manual' | 'aws'`).
// The platform constructs the registry at boot and passes it to the
// reconciler.
export class CredentialSourceRegistry {
  readonly #sources: Map<CredentialSource["kind"], CredentialSource>;

  constructor(sources: readonly CredentialSource[]) {
    this.#sources = new Map(sources.map((source) => [source.kind, source]));
  }

  get(kind: CredentialSource["kind"]): CredentialSource | undefined {
    return this.#sources.get(kind);
  }

  has(kind: CredentialSource["kind"]): boolean {
    return this.#sources.has(kind);
  }
}

// Convenience builder: assemble the v1 registry given a manual source.
// The aws source is registered as a stub so callers that mistakenly request
// it get the spec's NotImplementedError instead of a generic missing-source
// error.
export function buildDefaultRegistry(manual: ManualCredentialSource): CredentialSourceRegistry {
  return new CredentialSourceRegistry([manual, new AwsCredentialSource()]);
}
