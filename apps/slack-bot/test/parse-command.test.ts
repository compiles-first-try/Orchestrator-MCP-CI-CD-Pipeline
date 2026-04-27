import { describe, expect, it } from "vitest";
import { parseCommandText } from "../src/index.js";

describe("parseCommandText", () => {
  it("returns help for empty input", () => {
    expect(parseCommandText("")).toEqual({ subcommand: "help", args: [] });
    expect(parseCommandText("   ")).toEqual({ subcommand: "help", args: [] });
  });

  it("lowercases the subcommand", () => {
    expect(parseCommandText("STATUS")).toEqual({ subcommand: "status", args: [] });
  });

  it("splits on whitespace and preserves arg order", () => {
    expect(parseCommandText("config set demo-bot dev key value")).toEqual({
      subcommand: "config",
      args: ["set", "demo-bot", "dev", "key", "value"],
    });
  });

  it("collapses runs of whitespace", () => {
    expect(parseCommandText("config   set    a")).toEqual({
      subcommand: "config",
      args: ["set", "a"],
    });
  });
});
