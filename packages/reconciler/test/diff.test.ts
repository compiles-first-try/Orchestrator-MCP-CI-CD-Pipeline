import { describe, expect, it } from "vitest";
import { assetsEqual, bucketsEqual, diffByName, queuesEqual } from "../src/diff.js";
import type { Asset, Bucket, Queue } from "@rpa-platform/config-schema";
import type { AssetEntity, BucketEntity, QueueDefinitionEntity } from "@rpa-platform/orchestrator-client";

describe("diffByName", () => {
  it("classifies into creates/updates/deletes by Name", () => {
    const desired: { name: string; tag: string }[] = [
      { name: "A", tag: "x" },
      { name: "B", tag: "x" },
    ];
    const current: { Name: string; tag: string }[] = [
      { Name: "B", tag: "x" }, // unchanged
      { Name: "C", tag: "x" }, // delete
    ];
    const equals = (d: { tag: string }, c: { tag: string }): boolean => d.tag === c.tag;
    const result = diffByName(desired, current, equals);
    expect(result.creates.map((d) => d.name)).toEqual(["A"]);
    expect(result.updates).toHaveLength(0);
    expect(result.deletes.map((c) => c.Name)).toEqual(["C"]);
  });
});

describe("assetsEqual", () => {
  it("matches a text asset by value + description", () => {
    const d: Asset = { name: "X", type: "text", value: "v" };
    const c: AssetEntity = { Id: 1, Name: "X", ValueType: "Text", StringValue: "v" };
    expect(assetsEqual(d, c)).toBe(true);
  });

  it("flags integer asset with different IntValue as not equal", () => {
    const d: Asset = { name: "X", type: "integer", value: 1 };
    const c: AssetEntity = { Id: 1, Name: "X", ValueType: "Integer", IntValue: 2 };
    expect(assetsEqual(d, c)).toBe(false);
  });

  it("flags ValueType mismatch as not equal", () => {
    const d: Asset = { name: "X", type: "text", value: "v" };
    const c: AssetEntity = { Id: 1, Name: "X", ValueType: "Bool", BoolValue: true };
    expect(assetsEqual(d, c)).toBe(false);
  });
});

describe("queuesEqual", () => {
  it("ignores undefined desired fields (no override = no change)", () => {
    const d: Queue = {
      name: "Q",
      autoRetry: false,
      maxRetries: 3,
      uniqueReference: false,
      encrypted: false,
    };
    const c: QueueDefinitionEntity = {
      Id: 1,
      Name: "Q",
      AcceptAutomaticallyRetry: false,
      MaxNumberOfRetries: 3,
      EnforceUniqueReference: false,
      Encrypted: false,
    };
    expect(queuesEqual(d, c)).toBe(true);
  });

  it("flags maxRetries divergence as not equal", () => {
    const d: Queue = {
      name: "Q",
      autoRetry: false,
      maxRetries: 5,
      uniqueReference: false,
      encrypted: false,
    };
    const c: QueueDefinitionEntity = {
      Id: 1,
      Name: "Q",
      AcceptAutomaticallyRetry: false,
      MaxNumberOfRetries: 3,
      EnforceUniqueReference: false,
      Encrypted: false,
    };
    expect(queuesEqual(d, c)).toBe(false);
  });
});

describe("bucketsEqual", () => {
  it("treats provider case-insensitively", () => {
    const d: Bucket = { name: "config", provider: "orchestrator" };
    const c: BucketEntity = { Id: 1, Name: "config", StorageProvider: "Orchestrator" };
    expect(bucketsEqual(d, c)).toBe(true);
  });
});
