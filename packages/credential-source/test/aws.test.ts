import { describe, expect, it } from "vitest";
import { NotImplementedError } from "@rpa-platform/shared";
import { AwsCredentialSource } from "../src/aws.js";

describe("AwsCredentialSource (v2 stub)", () => {
  it("constructs without throwing", () => {
    expect(() => new AwsCredentialSource()).not.toThrow();
    expect(() => new AwsCredentialSource({ region: "us-east-1" })).not.toThrow();
  });

  it("throws NotImplementedError on resolve()", async () => {
    const source = new AwsCredentialSource();
    await expect(source.resolve("arn:aws:secretsmanager:...:foo")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("identifies itself as kind 'aws'", () => {
    expect(new AwsCredentialSource().kind).toBe("aws");
  });
});
