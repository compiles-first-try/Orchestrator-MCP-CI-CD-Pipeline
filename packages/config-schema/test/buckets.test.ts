import { describe, expect, it } from "vitest";
import { ConfigSchemaError, parseBuckets } from "../src/index.js";

describe("parseBuckets", () => {
  it("accepts a minimal bucket with default provider", () => {
    const result = parseBuckets([{ name: "Inputs" }]);
    expect(result[0]?.storageProvider).toBe("orchestrator");
  });

  it("accepts known providers", () => {
    const result = parseBuckets([
      { name: "S3Bucket", storageProvider: "s3", storageContainerPath: "bucket-name" },
      { name: "AzureBucket", storageProvider: "azure-blob" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("rejects unknown providers", () => {
    expect(() => parseBuckets([{ name: "X", storageProvider: "gcs" }])).toThrow(ConfigSchemaError);
  });

  it("rejects empty storageContainerPath", () => {
    expect(() => parseBuckets([{ name: "X", storageContainerPath: "" }])).toThrow(
      ConfigSchemaError,
    );
  });

  it("rejects duplicate names", () => {
    expect(() => parseBuckets([{ name: "Same" }, { name: "Same" }])).toThrow(ConfigSchemaError);
  });
});
