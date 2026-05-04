import { describe, expect, it } from "vitest";
import { createStaticTokenSource } from "../src/static-token-source.js";

describe("createStaticTokenSource", () => {
  it("returns the configured token and Bearer type by default", async () => {
    const source = createStaticTokenSource({ token: "pat-abc-123" });
    const result = await source.getToken();
    expect(result).toEqual({ token: "pat-abc-123", tokenType: "Bearer" });
  });

  it("accepts an explicit tokenType override", async () => {
    const source = createStaticTokenSource({ token: "x", tokenType: "Token" });
    const result = await source.getToken();
    expect(result.tokenType).toBe("Token");
  });

  it("throws when token is empty", () => {
    expect(() => createStaticTokenSource({ token: "" })).toThrow();
  });
});
