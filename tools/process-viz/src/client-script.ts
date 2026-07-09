// The in-browser Three.js application, emitted verbatim into the generated
// HTML inside a <script type="module">. It is authored WITHOUT backticks or
// ${} so it can live inside the render-html template literal without escaping
// gymnastics — DOM is built with createElement and strings are concatenated.
export const CLIENT_JS = `
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const GRAPH = window.__GRAPH__;
const SCENE = window.__SCENE__;
const SYSTEM_COLORS = window.__SYSTEM_COLORS__;
const PATHWAY_COLORS = window.__PATHWAY_COLORS__;
const PATHWAY_LABELS = window.__PATHWAY_LABELS__;

function index(arr) { const m = {}; for (const x of arr) { m[x.id] = x; } return m; }
const systemById = index(GRAPH.systems);
const workflowById = index(GRAPH.workflows);
const pathwayById = index(GRAPH.pathways);
const stepById = index(GRAPH.steps);
const decisionByStep = {}; for (const d of GRAPH.decisions) { decisionByStep[d.stepId] = d; }
const txnByStep = {}; for (const t of GRAPH.transactions) { txnByStep[t.stepId] = t; }

function colorFor(kind) { return SYSTEM_COLORS[kind] || SYSTEM_COLORS.unknown; }
function pathColor(kind) { return PATHWAY_COLORS[kind] || '#ffffff'; }
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) { node.className = cls; }
  if (text !== undefined && text !== null) { node.textContent = String(text); }
  return node;
}

// ---- Three.js setup ------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.FogExp2(0x05070d, 0.0028);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
camera.position.set(0, 110, 190);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 8, 0);

scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x0a0a12, 0.85));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
keyLight.position.set(80, 160, 60);
scene.add(keyLight);

const grid = new THREE.GridHelper(2000, 160, 0x1e4a8a, 0x0f2038);
grid.material.transparent = true;
grid.material.opacity = 0.4;
scene.add(grid);

// ---- Entry hub -----------------------------------------------------------
const hub = new THREE.Mesh(
  new THREE.OctahedronGeometry(4.5),
  new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00b8d4, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.3 })
);
hub.position.set(SCENE.entry.x, 7, SCENE.entry.z);
hub.userData = { pick: 'entry' };
scene.add(hub);
scene.add(makeLabel('PROCESS ENTRY', '#00e5ff', SCENE.entry.x, 15, SCENE.entry.z));

// ---- Buildings (systems) -------------------------------------------------
const buildingMeshes = [];
const buildingById = {};
for (const s of SCENE.systems) {
  const width = Math.min(18, 7 + s.surfaceCount * 1.6);
  const geo = new THREE.BoxGeometry(width, s.height, width);
  const base = colorFor(s.kind);
  const mat = new THREE.MeshStandardMaterial({
    color: base, emissive: base, emissiveIntensity: 0.28, metalness: 0.35, roughness: 0.55, transparent: true, opacity: 0.94
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(s.x, s.height / 2, s.z);
  mesh.userData = { pick: 'system', id: s.id, baseColor: base, baseOpacity: 0.94 };
  scene.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: base, transparent: true, opacity: 0.6 }));
  edges.position.copy(mesh.position);
  scene.add(edges);
  mesh.userData.edges = edges;
  // Stack thin bands = one per surface (area of the system).
  for (let i = 0; i < Math.min(s.surfaceCount, 8); i++) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.4, 0.4, width + 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 })
    );
    band.position.set(s.x, (i + 1) * (s.height / (Math.min(s.surfaceCount, 8) + 1)), s.z);
    scene.add(band);
  }
  scene.add(makeLabel(s.name, base, s.x, s.height + 6, s.z));
  buildingMeshes.push(mesh);
  buildingById[s.id] = { mesh: mesh, placement: s };
}

// ---- Pathways (pipes) ----------------------------------------------------
const pipeGroups = {};   // id -> THREE.Object3D
const pipeMeshes = [];
for (const p of SCENE.pathways) {
  const pts = curvePoints(p.systemIds);
  if (pts.length < 2) { continue; }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  const color = pathColor(p.kind);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(24, pts.length * 8), 0.7, 8, false),
    new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 })
  );
  tube.userData = { pick: 'pathway', id: p.id, kind: p.kind, baseColor: color };
  scene.add(tube);
  pipeGroups[p.id] = tube;
  pipeMeshes.push(tube);
}

function curvePoints(systemIds) {
  const arr = [new THREE.Vector3(SCENE.entry.x, 7, SCENE.entry.z)];
  let prev = arr[0];
  for (const id of systemIds) {
    const b = buildingById[id];
    if (!b) { continue; }
    const target = new THREE.Vector3(b.placement.x, Math.max(8, b.placement.height * 0.55), b.placement.z);
    const mid = new THREE.Vector3((prev.x + target.x) / 2, Math.max(prev.y, target.y) + 12, (prev.z + target.z) / 2);
    arr.push(mid, target);
    prev = target;
  }
  return arr;
}

// ---- Text label sprites --------------------------------------------------
function makeLabel(text, color, x, y, z) {
  const canvasEl = document.createElement('canvas');
  const ctx = canvasEl.getContext('2d');
  ctx.font = '600 40px ui-monospace, Menlo, monospace';
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  canvasEl.width = w; canvasEl.height = 64;
  ctx.font = '600 40px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(5,10,20,0.72)';
  ctx.fillRect(0, 0, w, 64);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, 62);
  ctx.fillStyle = color; ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, 34);
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(w / 6, 64 / 6, 1);
  sprite.position.set(x, y, z);
  sprite.userData = { isLabel: true };
  return sprite;
}

// ---- Selection + highlight ----------------------------------------------
const activeKinds = {};
for (const k of Object.keys(PATHWAY_COLORS)) { activeKinds[k] = true; }
let isolatedPathway = null;
let selectedSystem = null;

function applyVisibility() {
  for (const p of SCENE.pathways) {
    const mesh = pipeGroups[p.id];
    if (!mesh) { continue; }
    let visible = activeKinds[p.kind] !== false;
    if (isolatedPathway && p.id !== isolatedPathway) { visible = false; }
    if (selectedSystem && p.systemIds.indexOf(selectedSystem) < 0) { visible = false; }
    mesh.visible = visible;
    mesh.material.opacity = (isolatedPathway === p.id) ? 1.0 : 0.85;
  }
  for (const m of buildingMeshes) {
    const dim = selectedSystem && m.userData.id !== selectedSystem;
    m.material.opacity = dim ? 0.25 : m.userData.baseOpacity;
    if (m.userData.edges) { m.userData.edges.material.opacity = dim ? 0.15 : 0.6; }
  }
}

// ---- Raycast picking -----------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', function (e) { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', function (e) {
  if (!downXY) { return; }
  const moved = Math.abs(e.clientX - downXY[0]) + Math.abs(e.clientY - downXY[1]);
  downXY = null;
  if (moved > 6) { return; }
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(buildingMeshes.concat(pipeMeshes).concat([hub]), false);
  if (!hits.length) { return; }
  const ud = hits[0].object.userData;
  if (ud.pick === 'system') { selectSystem(ud.id); }
  else if (ud.pick === 'pathway') { selectPathway(ud.id); }
  else if (ud.pick === 'entry') { showEntry(); }
});

// ---- Camera focus tween --------------------------------------------------
let focusTarget = null;
let focusPos = null;
function focusOn(x, y, z) {
  focusTarget = new THREE.Vector3(x, y, z);
  const dirVec = new THREE.Vector3(x, y, z).sub(controls.target).normalize();
  focusPos = new THREE.Vector3(x, y + 45, z).add(dirVec.multiplyScalar(-70));
  focusPos.y = Math.max(focusPos.y, 30);
}

// ---- Inspector panel -----------------------------------------------------
const inspector = document.getElementById('inspector');
function setInspector(nodes) {
  inspector.innerHTML = '';
  for (const n of nodes) { inspector.appendChild(n); }
  inspector.scrollTop = 0;
}
function chip(text, color) {
  const c = el('span', 'chip', text);
  if (color) { c.style.borderColor = color; c.style.color = color; }
  return c;
}
function row(k, v) {
  const r = el('div', 'row');
  r.appendChild(el('span', 'k', k));
  r.appendChild(el('span', 'v', v));
  return r;
}

function selectSystem(id) {
  selectedSystem = id; isolatedPathway = null;
  const b = buildingById[id];
  if (b) { focusOn(b.placement.x, b.placement.height * 0.5, b.placement.z); }
  applyVisibility();
  const sys = systemById[id];
  const nodes = [];
  nodes.push(el('h2', null, sys.name));
  const meta = el('div', 'meta');
  meta.appendChild(chip(sys.kind, colorFor(sys.kind)));
  meta.appendChild(chip(sys.stepCount + ' steps'));
  meta.appendChild(chip(sys.surfaces.length + ' areas'));
  nodes.push(meta);

  nodes.push(el('h3', null, 'Areas in use'));
  if (!sys.surfaces.length) { nodes.push(el('p', 'dim', 'No specific area detected from XAML attributes.')); }
  for (const surf of sys.surfaces) {
    const s = el('div', 'card');
    s.appendChild(chip(surf.kind));
    s.appendChild(el('div', 'card-title', surf.label));
    if (surf.detail) { s.appendChild(el('div', 'card-detail', surf.detail)); }
    nodes.push(s);
  }

  const throughPaths = GRAPH.pathways.filter(function (p) { return p.systemIds.indexOf(id) >= 0; });
  nodes.push(el('h3', null, 'Pathways through here (' + throughPaths.length + ')'));
  for (const p of throughPaths) { nodes.push(pathwayLink(p)); }

  const usingWfs = GRAPH.workflows.filter(function (w) { return w.systemIds.indexOf(id) >= 0; });
  nodes.push(el('h3', null, 'Workflows touching it'));
  for (const w of usingWfs) { nodes.push(el('div', 'listitem', w.name)); }
  setInspector(nodes);
}

function pathwayLink(p) {
  const item = el('div', 'listitem pathitem');
  const dot = el('span', 'dot'); dot.style.background = pathColor(p.kind); item.appendChild(dot);
  item.appendChild(el('span', null, p.label));
  item.addEventListener('click', function () { selectPathway(p.id); });
  return item;
}

function selectPathway(id) {
  isolatedPathway = id; selectedSystem = null;
  applyVisibility();
  const p = pathwayById[id];
  const nodes = [];
  nodes.push(el('h2', null, p.label));
  const meta = el('div', 'meta');
  meta.appendChild(chip(PATHWAY_LABELS[p.kind] || p.kind, pathColor(p.kind)));
  meta.appendChild(chip((workflowById[p.workflowId] || {}).name || 'workflow'));
  nodes.push(meta);
  if (p.description) { nodes.push(el('p', 'dim', p.description)); }

  const first = p.systemIds[0] && buildingById[p.systemIds[0]];
  if (first) { focusOn(first.placement.x, 20, first.placement.z); }

  nodes.push(el('h3', null, 'Steps (' + p.stepIds.length + ')'));
  let order = 1;
  for (const stepId of p.stepIds) {
    const step = stepById[stepId];
    if (!step) { continue; }
    const s = el('div', 'card step');
    const head = el('div', 'step-head');
    head.appendChild(el('span', 'step-n', order++));
    head.appendChild(el('span', 'step-title', step.label));
    s.appendChild(head);
    const tags = el('div', 'step-tags');
    tags.appendChild(chip(step.kind));
    if (step.systemId && systemById[step.systemId]) { tags.appendChild(chip(systemById[step.systemId].name, colorFor(systemById[step.systemId].kind))); }
    if (decisionByStep[stepId]) { tags.appendChild(chip('decision: ' + decisionByStep[stepId].branches.join('/'))); }
    if (txnByStep[stepId]) { tags.appendChild(chip('txn: ' + txnByStep[stepId].op)); }
    s.appendChild(tags);
    if (step.annotation) { s.appendChild(el('div', 'card-detail', step.annotation)); }
    nodes.push(s);
  }
  setInspector(nodes);
}

function showEntry() {
  selectedSystem = null; isolatedPathway = null; applyVisibility();
  focusOn(0, 10, 0);
  const nodes = [];
  nodes.push(el('h2', null, GRAPH.meta.name));
  const meta = el('div', 'meta');
  meta.appendChild(chip(GRAPH.meta.workflowCount + ' workflows'));
  meta.appendChild(chip(GRAPH.meta.systemCount + ' systems'));
  meta.appendChild(chip(GRAPH.meta.pathwayCount + ' pathways'));
  nodes.push(meta);
  nodes.push(el('p', 'dim', GRAPH.meta.generatedNote));
  nodes.push(el('h3', null, 'Entry workflows'));
  for (const w of GRAPH.workflows.filter(function (x) { return x.isEntryPoint; })) {
    const item = el('div', 'card');
    item.appendChild(el('div', 'card-title', w.name));
    if (w.annotation) { item.appendChild(el('div', 'card-detail', w.annotation)); }
    nodes.push(item);
  }
  nodes.push(el('h3', null, 'Transactions'));
  for (const t of GRAPH.transactions) { nodes.push(el('div', 'listitem', t.op + ' — ' + t.label)); }
  setInspector(nodes);
}

// ---- Search --------------------------------------------------------------
const searchInput = document.getElementById('search');
const searchResults = document.getElementById('results');
const KIND_ICON = { workflow: 'WF', system: 'SYS', surface: 'AREA', data: 'DATA', decision: 'IF', transaction: 'TXN', pathway: 'PATH', step: 'STEP' };
searchInput.addEventListener('input', function () {
  const q = searchInput.value.trim().toLowerCase();
  searchResults.innerHTML = '';
  if (q.length < 2) { return; }
  const tokens = q.split(/[^a-z0-9]+/).filter(function (t) { return t.length > 0; });
  const scored = [];
  for (const entry of GRAPH.search) {
    let score = 0;
    for (const tok of tokens) {
      for (const term of entry.terms) {
        if (term === tok) { score += 3; } else if (term.indexOf(tok) === 0) { score += 2; } else if (term.indexOf(tok) >= 0) { score += 1; }
      }
    }
    if (score > 0) { scored.push([score, entry]); }
  }
  scored.sort(function (a, b) { return b[0] - a[0]; });
  for (const pair of scored.slice(0, 40)) {
    const entry = pair[1];
    const item = el('div', 'result');
    item.appendChild(el('span', 'result-kind', KIND_ICON[entry.kind] || entry.kind));
    const body = el('div', 'result-body');
    body.appendChild(el('div', 'result-label', entry.label));
    if (entry.detail) { body.appendChild(el('div', 'result-detail', entry.detail)); }
    item.appendChild(body);
    item.addEventListener('click', function () { selectSearchEntry(entry); });
    searchResults.appendChild(item);
  }
  if (!scored.length) { searchResults.appendChild(el('div', 'result dim', 'No matches')); }
});

function selectSearchEntry(entry) {
  if (entry.kind === 'system') { selectSystem(entry.id); return; }
  if (entry.kind === 'pathway') { selectPathway(entry.id); return; }
  if (entry.kind === 'surface') {
    const owner = GRAPH.systems.find(function (s) { return s.surfaces.some(function (f) { return f.id === entry.id; }); });
    if (owner) { selectSystem(owner.id); }
    return;
  }
  if (entry.kind === 'workflow') { showWorkflow(entry.id); return; }
  if (entry.kind === 'decision' || entry.kind === 'transaction') {
    const step = stepById[(GRAPH.decisions.concat(GRAPH.transactions).find(function (x) { return x.id === entry.id; }) || {}).stepId];
    if (step && step.systemId) { selectSystem(step.systemId); }
    else if (step) { showWorkflow(step.workflowId); }
    return;
  }
  if (entry.kind === 'data') {
    const d = GRAPH.data.find(function (x) { return x.id === entry.id; });
    if (d) { showWorkflow(d.workflowId, d); }
    return;
  }
}

function showWorkflow(id, highlightData) {
  const w = workflowById[id];
  if (!w) { return; }
  selectedSystem = null; isolatedPathway = null; applyVisibility();
  const nodes = [];
  nodes.push(el('h2', null, w.name));
  const meta = el('div', 'meta');
  if (w.isEntryPoint) { meta.appendChild(chip('entry point', '#00e5ff')); }
  meta.appendChild(chip(w.stepIds.length + ' steps'));
  meta.appendChild(chip(w.argumentIds.length + ' args'));
  meta.appendChild(chip(w.variableIds.length + ' vars'));
  nodes.push(meta);
  if (w.annotation) { nodes.push(el('p', 'dim', w.annotation)); }

  nodes.push(el('h3', null, 'Invokes'));
  for (const tid of w.invokes) { nodes.push(el('div', 'listitem', (workflowById[tid] || {}).name || tid)); }
  if (!w.invokes.length) { nodes.push(el('p', 'dim', 'Leaf workflow (no sub-workflows).')); }

  nodes.push(el('h3', null, 'Arguments & variables'));
  for (const did of w.argumentIds.concat(w.variableIds)) {
    const d = GRAPH.data.find(function (x) { return x.id === did; });
    if (!d) { continue; }
    const c = el('div', 'card');
    if (highlightData && highlightData.id === did) { c.classList.add('hl'); }
    const title = el('div', 'card-title', d.name + (d.direction ? ' [' + d.direction + ']' : ''));
    c.appendChild(title);
    c.appendChild(el('div', 'card-detail', d.dataType + (d.value ? '  =  ' + d.value : '')));
    nodes.push(c);
  }
  setInspector(nodes);
}

// ---- Filters (scenarios) -------------------------------------------------
const filterBox = document.getElementById('filters');
const kindCounts = {};
for (const p of SCENE.pathways) { kindCounts[p.kind] = (kindCounts[p.kind] || 0) + 1; }
for (const kind of Object.keys(PATHWAY_COLORS)) {
  if (!kindCounts[kind]) { continue; }
  const line = el('label', 'filter');
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = true;
  cb.addEventListener('change', function () { activeKinds[kind] = cb.checked; applyVisibility(); });
  line.appendChild(cb);
  const dot = el('span', 'dot'); dot.style.background = pathColor(kind); line.appendChild(dot);
  line.appendChild(el('span', null, (PATHWAY_LABELS[kind] || kind) + ' (' + kindCounts[kind] + ')'));
  filterBox.appendChild(line);
}
document.getElementById('clear').addEventListener('click', function () {
  selectedSystem = null; isolatedPathway = null; searchInput.value = ''; searchResults.innerHTML = '';
  applyVisibility(); showEntry();
});

// ---- HUD readouts --------------------------------------------------------
document.getElementById('hud-name').textContent = GRAPH.meta.name;
document.getElementById('hud-stats').textContent =
  GRAPH.meta.workflowCount + ' WF · ' + GRAPH.meta.systemCount + ' SYS · ' + GRAPH.meta.stepCount + ' STEPS · ' + GRAPH.meta.pathwayCount + ' PATHS';

// ---- Resize + animate ----------------------------------------------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.016;
  hub.rotation.y += 0.01;
  hub.position.y = 7 + Math.sin(t * 2) * 0.6;
  if (focusTarget) {
    controls.target.lerp(focusTarget, 0.08);
    camera.position.lerp(focusPos, 0.08);
    if (camera.position.distanceTo(focusPos) < 0.6) { focusTarget = null; focusPos = null; }
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();
showEntry();
applyVisibility();
`;
