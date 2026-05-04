import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AwsCredentialSource,
  CredentialSourceRegistry,
  ManualCredentialSource,
  buildDefaultRegistry,
} from "../src/index.js";
import type { ManualSecretStore } from "../src/types.js";

class NoopStore implements ManualSecretStore {
  async read(): Promise<string | null> {
    return null;
  }
  async write(): Promise<void> {}
  async remove(): Promise<void> {}
}

describe("CredentialSourceRegistry", () => {
  it("returns sources by kind", () => {
    const manual = new ManualCredentialSource(new NoopStore(), randomBytes(32));
    const aws = new AwsCredentialSource();
    const registry = new CredentialSourceRegistry([manual, aws]);
    expect(registry.get("manual")).toBe(manual);
    expect(registry.get("aws")).toBe(aws);
  });

  it("buildDefaultRegistry includes both manual and aws", () => {
    const manual = new ManualCredentialSource(new NoopStore(), randomBytes(32));
    const registry = buildDefaultRegistry(manual);
    expect(registry.has("manual")).toBe(true);
    expect(registry.has("aws")).toBe(true);
  });
});
