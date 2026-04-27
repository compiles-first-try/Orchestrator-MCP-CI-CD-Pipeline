import { describe, expect, it } from "vitest";
import { InMemoryAuditWriter } from "../src/index.js";

describe("InMemoryAuditWriter", () => {
  it("records every entry passed to write()", async () => {
    const writer = new InMemoryAuditWriter();
    await writer.write({
      action: "reconcile.dry_run",
      success: true,
      correlationId: "c-1",
    });
    await writer.write({
      action: "reconcile.apply",
      success: false,
      correlationId: "c-2",
      error: "boom",
      transport: "rest_fallback",
    });
    expect(writer.entries).toHaveLength(2);
    expect(writer.entries[0]?.action).toBe("reconcile.dry_run");
    expect(writer.entries[1]?.transport).toBe("rest_fallback");
    expect(writer.entries[1]?.error).toBe("boom");
  });

  it("preserves before/after payloads as supplied", async () => {
    const writer = new InMemoryAuditWriter();
    await writer.write({
      action: "asset.update",
      success: true,
      correlationId: "c-3",
      before: { value: "old" },
      after: { value: "new" },
    });
    expect(writer.entries[0]?.before).toEqual({ value: "old" });
    expect(writer.entries[0]?.after).toEqual({ value: "new" });
  });
});
