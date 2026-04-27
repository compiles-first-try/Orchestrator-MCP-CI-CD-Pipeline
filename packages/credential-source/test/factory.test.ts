import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEncryptionKey } from "@rpa-platform/shared";
import {
  AwsCredentialSource,
  createCredentialSource,
  ManualCredentialSource,
} from "../src/index.js";
import type { Database } from "@rpa-platform/db";

const KEY = parseEncryptionKey(randomBytes(32).toString("base64"));

describe("createCredentialSource", () => {
  it("returns ManualCredentialSource for type=manual", () => {
    const source = createCredentialSource({
      type: "manual",
      config: { db: {} as Database, encryptionKey: KEY },
    });
    expect(source).toBeInstanceOf(ManualCredentialSource);
    expect(source.type).toBe("manual");
  });

  it("returns AwsCredentialSource for type=aws", () => {
    const source = createCredentialSource({
      type: "aws",
      config: { region: "us-east-1", secretPrefix: "rpa/" },
    });
    expect(source).toBeInstanceOf(AwsCredentialSource);
    expect(source.type).toBe("aws");
  });
});
