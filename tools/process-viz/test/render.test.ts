import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildProcessGraph, ingestDirectory, type ProcessGraph } from "@rpa-platform/process-graph";
import { buildSceneModel } from "../src/scene.js";
import { renderProcessMapHtml } from "../src/render-html.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "process-graph",
  "test",
  "fixtures",
  "refx-demo",
);

describe("process-viz scene + render", () => {
  let graph: ProcessGraph;

  beforeAll(async () => {
    const ingested = await ingestDirectory(FIXTURE);
    graph = buildProcessGraph(ingested.sources, {
      name: ingested.name,
      source: ingested.source,
      entryPoint: ingested.entryPoint ?? "Main.xaml",
    });
  });

  it("places every system as a building with a positive height", () => {
    const scene = buildSceneModel(graph);
    expect(scene.systems).toHaveLength(graph.systems.length);
    for (const s of scene.systems) {
      expect(s.height).toBeGreaterThan(0);
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.z)).toBe(true);
    }
  });

  it("routes every non-trivial pathway through the entry hub", () => {
    const scene = buildSceneModel(graph);
    for (const p of scene.pathways) {
      expect(p.points.length).toBeGreaterThanOrEqual(2);
      expect(p.points[0]).toEqual(scene.entry);
    }
  });

  it("is deterministic", () => {
    expect(buildSceneModel(graph)).toEqual(buildSceneModel(graph));
  });

  it("renders a self-contained HTML document with the graph embedded and no unescaped </script>", () => {
    const html = renderProcessMapHtml(graph);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("window.__GRAPH__");
    expect(html).toContain("three.module.js");
    expect(html).toContain(graph.meta.name);
    // The embedded JSON must not contain a raw </script> that would break out.
    const dataBlock = html.slice(
      html.indexOf("window.__GRAPH__"),
      html.indexOf("window.__VIZ_STARTED__"),
    );
    expect(dataBlock.toLowerCase()).not.toContain("</script>");
  });
});
