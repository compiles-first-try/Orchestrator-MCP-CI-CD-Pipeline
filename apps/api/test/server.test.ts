import { describe, expect, it } from "vitest";
import type { Reconciler } from "@rpa-platform/reconciler";
import { loadEnv } from "../src/config.js";
import type { IdentityResolver } from "../src/identity.js";
import { buildServer } from "../src/server.js";

const STUB_ENV = {
  DATABASE_URL: "postgres://test",
  PLATFORM_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  API_PORT: "3000",
  LOG_LEVEL: "silent" as const,
};

const reconciler = {} as Reconciler;
const identity: IdentityResolver = {
  async resolveBySlackEmail() {
    return undefined;
  },
};

describe("API server", () => {
  it("boots with valid env and serves /healthz", async () => {
    const env = loadEnv(STUB_ENV);
    const app = buildServer({ env, reconciler, identity });
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it("attaches an x-correlation-id header to responses", async () => {
    const env = loadEnv(STUB_ENV);
    const app = buildServer({ env, reconciler, identity });
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.headers["x-correlation-id"]).toBeDefined();
    await app.close();
  });

  it("propagates an inbound x-correlation-id when supplied", async () => {
    const env = loadEnv(STUB_ENV);
    const app = buildServer({ env, reconciler, identity });
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-correlation-id": "abc-123" },
    });
    expect(response.headers["x-correlation-id"]).toBe("abc-123");
    await app.close();
  });

  it("rejects an invalid env config", () => {
    expect(() => loadEnv({ DATABASE_URL: "" })).toThrow();
  });
});
