import { describe, expect, it } from "vitest";
import { callReconcile, ReconcileCallError } from "../src/index.js";

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function recordingFetch(
  status: number,
  responseBody: unknown,
): { fetch: typeof globalThis.fetch; recorded: RecordedRequest[] } {
  const recorded: RecordedRequest[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k] = v;
    }
    recorded.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : "",
    });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetch, recorded };
}

const baseInput = {
  apiUrl: "https://api.example/orchestrator",
  apiToken: "test-token",
  projectName: "demo-bot",
  tenant: "dev" as const,
  branch: "dev",
  commitSha: "abc1234",
};

describe("callReconcile", () => {
  it("posts to /reconcile/dry-run with the bearer token and JSON body", async () => {
    const { fetch, recorded } = recordingFetch(200, { ok: true });
    const result = await callReconcile({
      ...baseInput,
      mode: "dry-run",
      fetch,
    });
    expect(result.status).toBe(200);
    expect(recorded).toHaveLength(1);
    const call = recorded[0];
    expect(call?.url).toBe("https://api.example/orchestrator/reconcile/dry-run");
    expect(call?.method).toBe("POST");
    expect(call?.headers["Authorization"]).toBe("Bearer test-token");
    expect(call?.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(call?.body ?? "{}") as Record<string, unknown>;
    expect(body).toEqual({
      projectName: "demo-bot",
      tenant: "dev",
      branch: "dev",
      commitSha: "abc1234",
    });
  });

  it("posts to /reconcile/apply when mode=apply", async () => {
    const { fetch, recorded } = recordingFetch(200, {});
    await callReconcile({ ...baseInput, mode: "apply", fetch });
    expect(recorded[0]?.url).toBe("https://api.example/orchestrator/reconcile/apply");
  });

  it("strips a trailing slash from apiUrl", async () => {
    const { fetch, recorded } = recordingFetch(200, {});
    await callReconcile({
      ...baseInput,
      apiUrl: "https://api.example/orchestrator/",
      mode: "dry-run",
      fetch,
    });
    expect(recorded[0]?.url).toBe("https://api.example/orchestrator/reconcile/dry-run");
  });

  it("forwards approverLogin and correlationId as headers when provided", async () => {
    const { fetch, recorded } = recordingFetch(200, {});
    await callReconcile({
      ...baseInput,
      mode: "apply",
      approverLogin: "alice",
      correlationId: "corr-1",
      fetch,
    });
    expect(recorded[0]?.headers["X-RPA-Approver-Login"]).toBe("alice");
    expect(recorded[0]?.headers["X-Correlation-Id"]).toBe("corr-1");
  });

  it("returns the parsed response body for 2xx", async () => {
    const { fetch } = recordingFetch(200, { hello: "world" });
    const result = await callReconcile({ ...baseInput, mode: "dry-run", fetch });
    expect(result.body).toEqual({ hello: "world" });
  });

  it("returns the parsed body even on 4xx without throwing", async () => {
    const { fetch } = recordingFetch(403, { code: "permission_denied" });
    const result = await callReconcile({ ...baseInput, mode: "apply", fetch });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ code: "permission_denied" });
  });

  it("throws ReconcileCallError when fetch rejects", async () => {
    const fetch: typeof globalThis.fetch = () => Promise.reject(new Error("ECONNRESET"));
    await expect(callReconcile({ ...baseInput, mode: "dry-run", fetch })).rejects.toBeInstanceOf(
      ReconcileCallError,
    );
  });
});
