import { describe, expect, it } from "vitest";
import { CORRELATION_HEADER, createApp, InMemoryAuditWriter } from "../src/index.js";

async function buildApp() {
  const auditWriter = new InMemoryAuditWriter();
  const app = await createApp({ auditWriter, logLevel: "fatal" });
  return { app, auditWriter };
}

describe("apps/api server skeleton", () => {
  it("GET /health returns 200 ok", async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("GET /ready returns 200 ready", async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
    await app.close();
  });

  it("attaches a correlation id when none is provided", async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    const headerValue = response.headers[CORRELATION_HEADER];
    expect(typeof headerValue).toBe("string");
    expect((headerValue as string).length).toBeGreaterThan(0);
    await app.close();
  });

  it("propagates an inbound correlation id to the response", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { [CORRELATION_HEADER]: "test-corr-1" },
    });
    expect(response.headers[CORRELATION_HEADER]).toBe("test-corr-1");
    await app.close();
  });

  it("decorates the app with the audit writer for routes to consume", async () => {
    const { app, auditWriter } = await buildApp();
    expect(app.auditWriter).toBe(auditWriter);
    await app.close();
  });
});
