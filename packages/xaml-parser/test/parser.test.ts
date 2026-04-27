import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseXaml, XamlParseError } from "../src/index.js";

const fixturePath = fileURLToPath(new URL("./fixtures/simple.xaml", import.meta.url));
const simpleXaml = readFileSync(fixturePath, "utf8");

describe("parseXaml", () => {
  it("rejects empty input", () => {
    expect(() => parseXaml("")).toThrow(XamlParseError);
  });

  it("rejects non-string input", () => {
    expect(() => parseXaml(undefined as unknown as string)).toThrow(XamlParseError);
  });

  it("returns an empty metadata when the document has no Activity root", () => {
    const result = parseXaml("<?xml version='1.0'?><Empty/>");
    expect(result.root?.tag).toBe("Empty");
    expect(result.arguments).toEqual([]);
    expect(result.variables).toEqual([]);
    expect(result.annotations).toEqual([]);
  });

  it("extracts arguments with direction parsed from the Type wrapper", () => {
    const result = parseXaml(simpleXaml);
    expect(result.arguments).toHaveLength(3);
    expect(result.arguments).toContainEqual({
      name: "in_OrchestratorUrl",
      type: "x:String",
      direction: "in",
      defaultValue: undefined,
    });
    expect(result.arguments).toContainEqual({
      name: "out_Result",
      type: "x:String",
      direction: "out",
      defaultValue: undefined,
    });
    expect(result.arguments).toContainEqual({
      name: "io_Counter",
      type: "x:Int32",
      direction: "inout",
      defaultValue: undefined,
    });
  });

  it("extracts variables with their scope path", () => {
    const result = parseXaml(simpleXaml);
    const names = result.variables.map((v) => v.name).sort();
    expect(names).toEqual(["EnableLogging", "InnerCounter", "MaxRows"]);
    const inner = result.variables.find((v) => v.name === "InnerCounter");
    expect(inner?.type).toBe("x:Int32");
    expect(inner?.defaultValue).toBe("0");
    expect(inner?.scopePath.length).toBeGreaterThan(1);
  });

  it("extracts annotations with their containing activity tag and path", () => {
    const result = parseXaml(simpleXaml);
    expect(result.annotations).toHaveLength(2);
    const top = result.annotations.find((a) => a.text === "This is the top-level sequence");
    expect(top?.activityTag).toBe("Sequence");
    expect(top?.displayName).toBe("Top sequence");
    const inner = result.annotations.find((a) => a.text === "Inner annotation");
    expect(inner?.path.length).toBeGreaterThan(top?.path.length ?? 0);
  });

  it("builds an activity tree rooted at the top-level Activity content", () => {
    const result = parseXaml(simpleXaml);
    expect(result.root?.tag).toBe("Activity");
    const sequence = result.root?.children.find((c) => c.tag === "Sequence");
    expect(sequence).toBeDefined();
    expect(sequence?.displayName).toBe("Top sequence");
    expect(sequence?.children.map((c) => c.tag)).toEqual(["WriteLine", "Sequence"]);
  });

  it("throws XamlParseError when XML is malformed", () => {
    expect(() => parseXaml("<unclosed")).toThrow(XamlParseError);
  });

  it("does not include the x:Members container as an activity child", () => {
    const result = parseXaml(simpleXaml);
    const tags = result.root?.children.map((c) => c.tag) ?? [];
    expect(tags).not.toContain("x:Members");
    expect(tags).not.toContain("Members");
  });

  it("does not include Variables containers as activity children", () => {
    const result = parseXaml(simpleXaml);
    const sequence = result.root?.children.find((c) => c.tag === "Sequence");
    const childTags = sequence?.children.map((c) => c.tag) ?? [];
    expect(childTags).not.toContain("Sequence.Variables");
  });
});
