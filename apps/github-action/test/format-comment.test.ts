import { describe, expect, it } from "vitest";
import { formatPrComment } from "../src/index.js";

const successPlanBody = {
  correlationId: "corr-7",
  plan: {
    summary: {
      assets: { creates: 2, updates: 1, deletes: 0 },
      queues: { creates: 0, updates: 0, deletes: 0 },
      buckets: { creates: 1, updates: 0, deletes: 0 },
    },
  },
};

describe("formatPrComment", () => {
  it("renders a markdown table for a successful dry-run", () => {
    const text = formatPrComment("dry-run", 200, successPlanBody);
    expect(text).toContain("rpa-platform dry-run");
    expect(text).toContain("corr-7");
    expect(text).toContain("| Assets  | 2 | 1 | 0 |");
    expect(text).toContain("| Buckets | 1 | 0 | 0 |");
  });

  it("includes a success badge for a successful apply", () => {
    const text = formatPrComment("apply", 200, {
      ...successPlanBody,
      applyResult: { success: true },
    });
    expect(text).toContain("Apply succeeded");
  });

  it("includes a stop badge for a failed apply", () => {
    const text = formatPrComment("apply", 200, {
      ...successPlanBody,
      applyResult: { success: false, stoppedAt: 3 },
    });
    expect(text).toContain("Apply stopped at operation 3");
  });

  it("renders a failed-status block on 4xx", () => {
    const text = formatPrComment("apply", 403, { code: "permission_denied" });
    expect(text).toContain("rpa-platform apply — failed");
    expect(text).toContain("HTTP 403");
    expect(text).toContain("permission_denied");
  });

  it("handles missing summary gracefully (zeros everywhere)", () => {
    const text = formatPrComment("dry-run", 200, { correlationId: "c" });
    expect(text).toContain("| Assets  | 0 | 0 | 0 |");
  });
});
