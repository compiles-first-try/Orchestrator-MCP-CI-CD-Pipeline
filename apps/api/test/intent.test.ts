import { describe, expect, it } from "vitest";
import { IntentParseError, createKeywordIntentParser } from "../src/intent/parser.js";

describe("createKeywordIntentParser", () => {
  const parser = createKeywordIntentParser();

  it("parses a structured /rpa new payload", () => {
    const intent = parser.parseProjectIntent('demo-bot "Daily order processing" owners=alice@harvard.edu framework=2.0.0');
    expect(intent).toEqual({
      name: "demo-bot",
      description: "Daily order processing",
      owners: ["alice@harvard.edu"],
      frameworkVersion: "2.0.0",
    });
  });

  it("captures multiple owners separated by commas", () => {
    const intent = parser.parseProjectIntent("demo-bot owners=alice@harvard.edu,bob@harvard.edu");
    expect(intent.owners.sort()).toEqual(["alice@harvard.edu", "bob@harvard.edu"]);
  });

  it("treats bare email-shaped tokens as owners", () => {
    const intent = parser.parseProjectIntent('demo-bot "x" carol@harvard.edu');
    expect(intent.owners).toContain("carol@harvard.edu");
  });

  it("falls back to bare-token description when no quoted string is given", () => {
    const intent = parser.parseProjectIntent("demo-bot a free-text description");
    expect(intent.description).toBe("a free-text description");
  });

  it("throws IntentParseError when the project name cannot be inferred", () => {
    expect(() => parser.parseProjectIntent("\"only a description\"")).toThrow(IntentParseError);
  });

  it("rejects names with whitespace via the NAME_PATTERN guard", () => {
    // 'demo bot' splits into two bare tokens; the second isn't a valid name
    // so 'demo' becomes the name and 'bot' becomes part of the description.
    const intent = parser.parseProjectIntent("demo bot");
    expect(intent.name).toBe("demo");
  });
});
