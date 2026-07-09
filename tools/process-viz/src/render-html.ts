import type { ProcessGraph } from "@rpa-platform/process-graph";
import { buildSceneModel } from "./scene.js";
import { CLIENT_JS } from "./client-script.js";
import { PATHWAY_COLORS, PATHWAY_LABELS, SYSTEM_COLORS } from "./palette.js";

const THREE_VERSION = "0.160.0";

/**
 * Renders a self-contained interactive 3D process map as a single HTML string.
 * The graph and scene layout are embedded inline; only the Three.js runtime is
 * pulled from a pinned CDN (documented for the reader — swap for a vendored
 * copy if the map must run fully offline).
 */
export function renderProcessMapHtml(graph: ProcessGraph): string {
  const sceneModel = buildSceneModel(graph);
  const legend = renderSystemLegend(graph);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(graph.meta.name)} — 3D Process Map</title>
<style>${CSS}</style>
</head>
<body>
  <canvas id="scene"></canvas>

  <div id="hud-top">
    <div class="hud-block">
      <div class="hud-eyebrow">RPA PROCESS MAP</div>
      <div id="hud-name" class="hud-name">—</div>
    </div>
    <div id="hud-stats" class="hud-stats">—</div>
  </div>

  <aside id="panel-left">
    <div class="panel-section">
      <div class="panel-title">SEARCH</div>
      <input id="search" placeholder="systems, files, tables, variables, endpoints…" autocomplete="off" />
      <div id="results"></div>
    </div>
    <div class="panel-section">
      <div class="panel-title">SCENARIOS <span class="hint">(pipes)</span></div>
      <div id="filters"></div>
      <button id="clear" class="clear-btn">Reset view</button>
    </div>
    <div class="panel-section">
      <div class="panel-title">SYSTEMS <span class="hint">(buildings)</span></div>
      <div id="legend">${legend}</div>
    </div>
  </aside>

  <aside id="panel-right">
    <div id="inspector"></div>
  </aside>

  <div id="hint-bar">
    <span><b>Drag</b> orbit</span>
    <span><b>Scroll</b> zoom</span>
    <span><b>Click</b> a building or pipe to inspect</span>
    <span class="muted">Buildings = systems · Pipes = scenarios · Height = activity volume</span>
  </div>

  <div id="load-error" class="hidden">
    Could not load the Three.js runtime from the CDN. Open this file with an internet connection,
    or vendor three@${THREE_VERSION} locally.
  </div>

  <script>
    window.__GRAPH__ = ${jsonScript(graph)};
    window.__SCENE__ = ${jsonScript(sceneModel)};
    window.__SYSTEM_COLORS__ = ${jsonScript(SYSTEM_COLORS)};
    window.__PATHWAY_COLORS__ = ${jsonScript(PATHWAY_COLORS)};
    window.__PATHWAY_LABELS__ = ${jsonScript(PATHWAY_LABELS)};
    setTimeout(function () {
      if (!window.__VIZ_STARTED__) { document.getElementById('load-error').classList.remove('hidden'); }
    }, 6000);
  </script>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    window.__VIZ_STARTED__ = true;
    ${CLIENT_JS}
  </script>
</body>
</html>
`;
}

function renderSystemLegend(graph: ProcessGraph): string {
  const kinds = new Map<string, number>();
  for (const system of graph.systems) kinds.set(system.kind, (kinds.get(system.kind) ?? 0) + 1);
  return [...kinds.entries()]
    .map(([kind, count]) => {
      const color = SYSTEM_COLORS[kind] ?? SYSTEM_COLORS["unknown"];
      return `<div class="legend-item"><span class="dot" style="background:${color}"></span>${escapeHtml(kind)} <span class="muted">(${count})</span></div>`;
    })
    .join("");
}

/** JSON for inline <script>; escape `<` so a `</script>` in data can't break out. */
function jsonScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</gu, "\\u003c")
    .replace(/\u2028/gu, "\\u2028")
    .replace(/\u2029/gu, "\\u2029");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

const CSS = `
:root {
  --bg: #05070d; --cyan: #00e5ff; --red: #ff2a4d; --amber: #ffb300;
  --panel: rgba(8, 14, 26, 0.82); --border: rgba(0, 229, 255, 0.28); --text: #cfe6f5; --muted: #6c8199;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--bg); color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
#scene { position: fixed; inset: 0; display: block; }
.hidden { display: none !important; }
.muted { color: var(--muted); }
.dim { color: var(--muted); font-size: 12px; line-height: 1.5; }

#hud-top { position: fixed; top: 0; left: 0; right: 0; display: flex; justify-content: space-between;
  align-items: flex-start; padding: 16px 22px; pointer-events: none;
  background: linear-gradient(180deg, rgba(5,7,13,0.85), rgba(5,7,13,0)); }
.hud-eyebrow { color: var(--red); font-size: 11px; letter-spacing: 3px; }
.hud-name { font-size: 22px; font-weight: 700; letter-spacing: 1px; text-shadow: 0 0 16px rgba(0,229,255,0.4); }
.hud-stats { color: var(--cyan); font-size: 12px; letter-spacing: 2px; padding-top: 8px; }

aside { position: fixed; top: 74px; bottom: 52px; width: 320px; background: var(--panel);
  border: 1px solid var(--border); backdrop-filter: blur(8px); overflow-y: auto;
  box-shadow: 0 0 40px rgba(0,0,0,0.5); }
#panel-left { left: 16px; padding: 6px 0; }
#panel-right { right: 16px; padding: 16px; }
.panel-section { padding: 14px 16px; border-bottom: 1px solid rgba(0,229,255,0.12); }
.panel-title { font-size: 11px; letter-spacing: 2.5px; color: var(--cyan); margin-bottom: 10px; }
.panel-title .hint { color: var(--muted); letter-spacing: 1px; }

#search { width: 100%; padding: 9px 10px; background: rgba(0,0,0,0.4); border: 1px solid var(--border);
  color: var(--text); font-family: inherit; font-size: 12px; outline: none; }
#search:focus { border-color: var(--cyan); box-shadow: 0 0 10px rgba(0,229,255,0.3); }
#results { margin-top: 8px; max-height: 240px; overflow-y: auto; }
.result { display: flex; gap: 8px; padding: 7px 8px; cursor: pointer; border-left: 2px solid transparent; }
.result:hover { background: rgba(0,229,255,0.08); border-left-color: var(--cyan); }
.result-kind { color: var(--amber); font-size: 10px; min-width: 34px; padding-top: 2px; }
.result-label { font-size: 12px; }
.result-detail { font-size: 11px; color: var(--muted); word-break: break-all; }

.filter { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 12px; cursor: pointer; }
.filter input { accent-color: var(--cyan); }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px currentColor; }
.clear-btn { margin-top: 10px; width: 100%; padding: 8px; background: rgba(255,42,77,0.12);
  border: 1px solid rgba(255,42,77,0.4); color: var(--red); font-family: inherit; font-size: 11px;
  letter-spacing: 1px; cursor: pointer; }
.clear-btn:hover { background: rgba(255,42,77,0.22); }
.legend-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }

#inspector h2 { margin: 0 0 10px; font-size: 17px; letter-spacing: 0.5px; }
#inspector h3 { margin: 18px 0 8px; font-size: 11px; letter-spacing: 2px; color: var(--cyan);
  border-top: 1px solid rgba(0,229,255,0.12); padding-top: 12px; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.chip { font-size: 10px; padding: 2px 8px; border: 1px solid var(--muted); border-radius: 10px;
  color: var(--muted); letter-spacing: 0.5px; white-space: nowrap; }
.row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
.row .k { color: var(--muted); }
.card { background: rgba(0,0,0,0.28); border: 1px solid rgba(0,229,255,0.14); padding: 9px 11px; margin-bottom: 7px; }
.card.hl { border-color: var(--amber); box-shadow: 0 0 12px rgba(255,179,0,0.3); }
.card-title { font-size: 13px; }
.card-detail { font-size: 11px; color: var(--muted); word-break: break-all; margin-top: 3px; }
.listitem { font-size: 12px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.pathitem { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.pathitem:hover { color: var(--cyan); }
.step .step-head { display: flex; gap: 8px; align-items: baseline; }
.step-n { color: var(--amber); font-size: 11px; min-width: 18px; }
.step-title { font-size: 13px; }
.step-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }

#hint-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 22px; justify-content: center;
  padding: 14px; font-size: 11px; color: var(--muted); letter-spacing: 1px;
  background: linear-gradient(0deg, rgba(5,7,13,0.9), rgba(5,7,13,0)); pointer-events: none; }
#hint-bar b { color: var(--cyan); }
#load-error { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  text-align: center; padding: 40px; color: var(--red); background: rgba(5,7,13,0.9); z-index: 10; }
`;
