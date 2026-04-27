import { describe, expect, it } from "vitest";
import { AwsCredentialSource } from "../src/index.js";
import { NotImplementedError } from "@rpa-platform/shared";

const source = new AwsCredentialSource({ region: "us-east-1", secretPrefix: "rpa/" });

describe("AwsCredentialSource (v1 stub)", () => {
  it("type discriminator is 'aws'", () => {
    expect(source.type).toBe("aws");
  });

  it("getValue throws NotImplementedError", async () => {
    await expect(
      source.getValue({ projectId: "p", tenant: "dev", name: "x" }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("setValue throws NotImplementedError", async () => {
    await expect(
      source.setValue({
        projectId: "p",
        tenant: "dev",
        name: "x",
        value: "y",
        setByUserId: "u",
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("listNames throws NotImplementedError", async () => {
    await expect(source.listNames({ projectId: "p", tenant: "dev" })).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("delete throws NotImplementedError", async () => {
    await expect(
      source.delete({ projectId: "p", tenant: "dev", name: "x" }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
});
