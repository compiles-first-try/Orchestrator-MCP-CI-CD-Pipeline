import { describe, expect, it } from "vitest";
import { BucketsFile } from "../src/buckets.js";

describe("BucketsFile", () => {
  it("defaults provider to orchestrator and accepts a minimal entry", () => {
    const result = BucketsFile.parse({
      schemaVersion: 1,
      buckets: [{ name: "config" }],
    });
    expect(result.buckets[0]).toMatchObject({ name: "config", provider: "orchestrator" });
  });

  it("requires externalName when provider is non-orchestrator", () => {
    const result = BucketsFile.safeParse({
      schemaVersion: 1,
      buckets: [{ name: "ExternalNoName", provider: "amazon" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.path.join(".").endsWith("externalName") && i.message.includes("externalName"),
        ),
      ).toBe(true);
    }
  });

  it("accepts an external bucket with externalName + storageParameters", () => {
    const result = BucketsFile.safeParse({
      schemaVersion: 1,
      buckets: [
        {
          name: "S3Bucket",
          provider: "amazon",
          externalName: "my-aws-bucket",
          storageParameters: { region: "us-east-1" },
          credentialStoreReference: "aws-cred-store",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown storage provider", () => {
    const result = BucketsFile.safeParse({
      schemaVersion: 1,
      buckets: [{ name: "Bad", provider: "swift" }],
    });
    expect(result.success).toBe(false);
  });

  it("flags duplicate bucket names", () => {
    const result = BucketsFile.safeParse({
      schemaVersion: 1,
      buckets: [{ name: "Same" }, { name: "Same" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("duplicate bucket name"))).toBe(true);
    }
  });
});
