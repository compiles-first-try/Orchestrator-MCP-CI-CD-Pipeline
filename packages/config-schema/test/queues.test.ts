import { describe, expect, it } from "vitest";
import { QueuesFile } from "../src/queues.js";

describe("QueuesFile", () => {
  it("applies defaults when optional fields are omitted", () => {
    const result = QueuesFile.parse({
      schemaVersion: 1,
      queues: [{ name: "MyQueue" }],
    });
    expect(result.queues[0]).toMatchObject({
      name: "MyQueue",
      autoRetry: false,
      maxRetries: 3,
      uniqueReference: false,
      encrypted: false,
    });
  });

  it("accepts all optional fields", () => {
    const result = QueuesFile.safeParse({
      schemaVersion: 1,
      queues: [
        {
          name: "Featureful",
          description: "everything wired",
          autoRetry: true,
          maxRetries: 5,
          uniqueReference: true,
          encrypted: true,
          specificDataJsonSchema: { type: "object" },
          outputDataJsonSchema: { type: "object" },
          analyticsDataJsonSchema: { type: "object" },
          tags: ["tagA"],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative maxRetries", () => {
    const result = QueuesFile.safeParse({
      schemaVersion: 1,
      queues: [{ name: "Bad", maxRetries: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects maxRetries above the cap", () => {
    const result = QueuesFile.safeParse({
      schemaVersion: 1,
      queues: [{ name: "Bad", maxRetries: 10000 }],
    });
    expect(result.success).toBe(false);
  });

  it("flags duplicate queue names", () => {
    const result = QueuesFile.safeParse({
      schemaVersion: 1,
      queues: [{ name: "Dup" }, { name: "Dup" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("duplicate queue name"))).toBe(true);
    }
  });
});
