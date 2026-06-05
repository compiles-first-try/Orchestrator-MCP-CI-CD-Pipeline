import { describe, it, expect } from "vitest";
import { computeCicdVersion, stripCicdSuffix, parseCicdSuffix } from "../src/version-manager.js";

describe("computeCicdVersion", () => {
  it("returns the original version when it does not exist", () => {
    const result = computeCicdVersion("1.0.0", []);
    expect(result.version).toBe("1.0.0");
    expect(result.wasBumped).toBe(false);
  });

  it("bumps to -cicd.1 when the exact version exists", () => {
    const result = computeCicdVersion("1.0.0", ["1.0.0"]);
    expect(result.version).toBe("1.0.0-cicd.1");
    expect(result.wasBumped).toBe(true);
  });

  it("bumps to -cicd.2 when -cicd.1 already exists", () => {
    const result = computeCicdVersion("1.0.0", ["1.0.0", "1.0.0-cicd.1"]);
    expect(result.version).toBe("1.0.0-cicd.2");
    expect(result.wasBumped).toBe(true);
  });

  it("bumps past existing cicd versions even with gaps", () => {
    const result = computeCicdVersion("1.0.0", ["1.0.0", "1.0.0-cicd.1", "1.0.0-cicd.5"]);
    expect(result.version).toBe("1.0.0-cicd.6");
    expect(result.wasBumped).toBe(true);
  });

  it("strips existing cicd suffix before computing", () => {
    const result = computeCicdVersion("1.0.0-cicd.1", ["1.0.0-cicd.1"]);
    expect(result.version).toBe("1.0.0-cicd.2");
    expect(result.wasBumped).toBe(true);
  });

  it("handles prerelease versions", () => {
    const result = computeCicdVersion("2.1.0-beta", ["2.1.0-beta"]);
    expect(result.version).toBe("2.1.0-beta-cicd.1");
    expect(result.wasBumped).toBe(true);
  });

  it("does not bump when version is not in the list", () => {
    const result = computeCicdVersion("2.0.0", ["1.0.0", "1.0.0-cicd.1"]);
    expect(result.version).toBe("2.0.0");
    expect(result.wasBumped).toBe(false);
  });
});

describe("stripCicdSuffix", () => {
  it("removes -cicd.N suffix", () => {
    expect(stripCicdSuffix("1.0.0-cicd.3")).toBe("1.0.0");
  });

  it("returns version unchanged if no suffix", () => {
    expect(stripCicdSuffix("1.0.0")).toBe("1.0.0");
  });

  it("handles prerelease versions", () => {
    expect(stripCicdSuffix("1.0.0-beta-cicd.1")).toBe("1.0.0-beta");
  });
});

describe("parseCicdSuffix", () => {
  it("parses a valid cicd suffix", () => {
    const result = parseCicdSuffix("1.0.0-cicd.5");
    expect(result).toEqual({ base: "1.0.0", cicdNumber: 5 });
  });

  it("returns undefined for versions without suffix", () => {
    expect(parseCicdSuffix("1.0.0")).toBeUndefined();
  });

  it("handles complex base versions", () => {
    const result = parseCicdSuffix("2.1.0-beta-cicd.3");
    expect(result).toEqual({ base: "2.1.0-beta", cicdNumber: 3 });
  });
});
