import type { ProcessGraph } from "@rpa-platform/process-graph";

// ---------------------------------------------------------------------------
// Turns a ProcessGraph into a concrete 3D scene layout: where each system
// building stands, how tall it is, and the poly-line each pathway pipe follows.
// Kept pure and separate from the HTML so the geometry is deterministic and
// unit-testable — the renderer just draws what this produces.
// ---------------------------------------------------------------------------

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface SystemPlacement {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly surfaceCount: number;
  readonly stepCount: number;
}

export interface PathwayRoute {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly workflowId: string;
  readonly systemIds: readonly string[];
  /** Ground-plane points the pipe passes through: entry hub, then each system. */
  readonly points: readonly Vec2[];
}

export interface SceneModel {
  readonly entry: Vec2;
  readonly systems: readonly SystemPlacement[];
  readonly pathways: readonly PathwayRoute[];
}

const MIN_HEIGHT = 6;
const MAX_HEIGHT = 42;

export function buildSceneModel(graph: ProcessGraph): SceneModel {
  const systems = placeSystems(graph);
  const positionById = new Map(systems.map((s) => [s.id, { x: s.x, z: s.z }] as const));
  const entry: Vec2 = { x: 0, z: 0 };

  const pathways: PathwayRoute[] = graph.pathways
    .filter((p) => p.systemIds.length > 0)
    .map((p) => {
      const points: Vec2[] = [entry];
      for (const systemId of p.systemIds) {
        const pos = positionById.get(systemId);
        if (pos !== undefined) points.push(pos);
      }
      return {
        id: p.id,
        kind: p.kind,
        label: p.label,
        workflowId: p.workflowId,
        systemIds: p.systemIds,
        points,
      };
    })
    .filter((p) => p.points.length >= 2);

  return { entry, systems, pathways };
}

/** Places systems evenly around a ring; the busiest system gets the tallest tower. */
function placeSystems(graph: ProcessGraph): SystemPlacement[] {
  const ordered = [...graph.systems].sort((a, b) => b.stepCount - a.stepCount);
  const count = ordered.length;
  const radius = Math.max(20, count * 4.2);
  const maxSteps = Math.max(1, ...ordered.map((s) => s.stepCount));

  return ordered.map((system, i) => {
    const angle = count === 0 ? 0 : (i / count) * Math.PI * 2;
    const height = clamp(
      MIN_HEIGHT + (system.stepCount / maxSteps) * (MAX_HEIGHT - MIN_HEIGHT),
      MIN_HEIGHT,
      MAX_HEIGHT,
    );
    return {
      id: system.id,
      name: system.name,
      kind: system.kind,
      x: round(Math.cos(angle) * radius),
      z: round(Math.sin(angle) * radius),
      height: round(height),
      surfaceCount: system.surfaces.length,
      stepCount: system.stepCount,
    };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
