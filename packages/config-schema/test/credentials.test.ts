import { describe, expect, it } from "vitest";
import { ConfigSchemaError, parseCredentials } from "../src/index.js";

describe("parseCredentials", () => {
  it("accepts each kind", () => {
    const result = parseCredentials([
      { name: "ServiceAccount", kind: "username-password" },
      { name: "VendorApiKey", kind: "api-key" },
      { name: "GraphToken", kind: "oauth-token" },
    ]);
    expect(result).toHaveLength(3);
  });

  it("rejects unknown kind", () => {
    expect(() => parseCredentials([{ name: "X", kind: "ssh-key" }])).toThrow(ConfigSchemaError);
  });

  it("rejects duplicate names", () => {
    expect(() =>
      parseCredentials([
        { name: "Same", kind: "api-key" },
        { name: "Same", kind: "api-key" },
      ]),
    ).toThrow(ConfigSchemaError);
  });

  it("rejects bad name", () => {
    expect(() => parseCredentials([{ name: "1bad", kind: "api-key" }])).toThrow(ConfigSchemaError);
  });
});
