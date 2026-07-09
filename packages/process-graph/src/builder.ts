import type { ActivityInfo } from "@rpa-platform/xaml-parser";
import {
  branchWrapperLabel,
  decisionOf,
  invokeTarget,
  isBusinessExceptionThrow,
  stepKindOf,
  transactionOf,
} from "./activity-roles.js";
import { buildSearchIndex } from "./search.js";
import {
  GENERIC_UI_SYSTEM,
  classifyActivity,
  type SurfaceDraft,
  type SystemDraft,
} from "./system-catalog.js";
import type {
  DataNode,
  DecisionNode,
  Edge,
  Pathway,
  ProcessGraph,
  StepNode,
  SystemNode,
  SystemSurface,
  TransactionNode,
  WorkflowNode,
  WorkflowSource,
} from "./types.js";

export interface BuildOptions {
  /** Display name for the process, e.g. the repo or package name. */
  readonly name: string;
  /** Where the XAML came from (a path, a .nupkg, a repo url) — for provenance. */
  readonly source: string;
  /** Entry-point workflow file name, if known (from project.json). */
  readonly entryPoint?: string;
  /** Cap on how many decision-branch pathways to emit (keeps the map legible). */
  readonly maxBranchPathways?: number;
}

const DEFAULT_MAX_BRANCH_PATHWAYS = 16;

/**
 * Converts a set of parsed workflow files into a ProcessGraph. Pure and
 * deterministic: same inputs always yield the same graph (ids are derived from
 * names and document order, never from randomness or time).
 */
export function buildProcessGraph(
  sources: readonly WorkflowSource[],
  options: BuildOptions,
): ProcessGraph {
  const builder = new GraphBuilder(sources, options);
  return builder.build();
}

// ---- Internal build state ------------------------------------------------

interface BuildStep {
  readonly node: StepNode;
  readonly tryRole: TryRole;
  readonly caughtType: string | undefined;
  readonly branchGroupId: string | undefined;
  readonly isBusinessThrow: boolean;
}

type TryRole = "try" | "catch" | "finally" | "retry" | undefined;

interface WalkContext {
  readonly workflowId: string;
  readonly depth: number;
  readonly parentStepId: string | undefined;
  readonly ambient: { systemId: string; surfaceId: string | undefined } | undefined;
  readonly tryRole: TryRole;
  readonly caughtType: string | undefined;
  readonly branchGroupId: string | undefined;
}

interface SystemAccumulator {
  readonly id: string;
  readonly kind: SystemDraft["kind"];
  readonly name: string;
  readonly surfaces: Map<string, SurfaceAccumulator>;
  readonly stepIds: Set<string>;
}

interface SurfaceAccumulator {
  readonly id: string;
  readonly kind: SurfaceDraft["kind"];
  readonly label: string;
  readonly detail: string | undefined;
  readonly workflowIds: Set<string>;
  readonly stepIds: Set<string>;
}

interface BranchGroup {
  readonly id: string;
  readonly decisionStepId: string;
  readonly label: string;
}

class GraphBuilder {
  private readonly options: BuildOptions;
  private readonly sources: readonly WorkflowSource[];
  private readonly workflowIdByName = new Map<string, string>();
  private readonly systems = new Map<string, SystemAccumulator>();
  private readonly branchGroups = new Map<string, BranchGroup>();
  private readonly steps: BuildStep[] = [];
  private readonly data: DataNode[] = [];
  private readonly decisions: DecisionNode[] = [];
  private readonly transactions: TransactionNode[] = [];
  private readonly invokeTargets = new Map<string, Set<string>>(); // workflowId -> raw file names
  private stepCounter = 0;
  private surfaceCounter = 0;
  private systemCounter = 0;

  constructor(sources: readonly WorkflowSource[], options: BuildOptions) {
    this.sources = sources;
    this.options = options;
    this.assignWorkflowIds();
  }

  build(): ProcessGraph {
    const workflows = this.sources.map((source) => this.buildWorkflow(source));
    this.resolveInvokes(workflows);

    const systems = this.finalizeSystems();
    const pathways = this.derivePathways(workflows);
    const steps = this.steps.map((s) => s.node);
    const edges = this.buildEdges(workflows);

    const graph: Omit<ProcessGraph, "search" | "meta"> = {
      workflows: this.attachWorkflowSystems(workflows),
      systems,
      data: this.data,
      decisions: this.decisions,
      transactions: this.transactions,
      pathways,
      steps,
      edges,
    };
    const search = buildSearchIndex(graph);
    const meta = {
      name: this.options.name,
      source: this.options.source,
      workflowCount: workflows.length,
      systemCount: systems.length,
      stepCount: steps.length,
      pathwayCount: pathways.length,
      generatedNote:
        "Derived statically from XAML — surfaces reflect declared attributes; runtime values are not resolved.",
    };
    return { meta, ...graph, search };
  }

  // ---- Workflow identity -------------------------------------------------

  private assignWorkflowIds(): void {
    const used = new Set<string>();
    for (const source of this.sources) {
      let slug = `wf:${slugify(baseName(source.name))}`;
      let suffix = 2;
      while (used.has(slug)) slug = `wf:${slugify(baseName(source.name))}-${suffix++}`;
      used.add(slug);
      this.workflowIdByName.set(source.name, slug);
    }
  }

  private workflowId(name: string): string {
    const id = this.workflowIdByName.get(name);
    if (id === undefined) throw new Error(`Unknown workflow: ${name}`);
    return id;
  }

  // ---- Per-workflow walk -------------------------------------------------

  private buildWorkflow(source: WorkflowSource): WorkflowNode {
    const workflowId = this.workflowId(source.name);
    const argumentIds: string[] = [];
    const variableIds: string[] = [];

    source.parsed.arguments.forEach((arg, i) => {
      const id = `data:${workflowId}:arg:${i}`;
      this.data.push({
        id,
        kind: "argument",
        name: arg.name,
        dataType: arg.type,
        direction: arg.direction,
        value: arg.defaultValue,
        annotation: arg.annotation,
        scope: source.name,
        workflowId,
      });
      argumentIds.push(id);
    });
    source.parsed.variables.forEach((variable, i) => {
      const id = `data:${workflowId}:var:${i}`;
      this.data.push({
        id,
        kind: "variable",
        name: variable.name,
        dataType: variable.type,
        direction: undefined,
        value: variable.defaultValue,
        annotation: undefined,
        scope: variable.scope,
        workflowId,
      });
      variableIds.push(id);
    });

    const stepIdsBefore = this.steps.length;
    const rootContext: WalkContext = {
      workflowId,
      depth: 0,
      parentStepId: undefined,
      ambient: undefined,
      tryRole: undefined,
      caughtType: undefined,
      branchGroupId: undefined,
    };
    for (const activity of source.parsed.activities) {
      this.walk(activity, rootContext);
    }
    const stepIds = this.steps.slice(stepIdsBefore).map((s) => s.node.id);

    return {
      id: workflowId,
      name: source.name,
      path: source.path,
      annotation: source.parsed.rootAnnotation,
      isEntryPoint: false, // set later
      argumentIds,
      variableIds,
      stepIds,
      invokes: [],
      invokedBy: [],
      systemIds: [],
    };
  }

  private walk(activity: ActivityInfo, ctx: WalkContext): void {
    const wrapper = this.wrapperContext(activity, ctx);
    if (wrapper !== undefined) {
      // Wrapper elements (If.Then, TryCatch.Catches, Catch, ActivityAction ...)
      // do not become visible steps — they only refine the context that their
      // descendants inherit.
      for (const child of activity.children) this.walk(child, wrapper);
      return;
    }

    const step = this.emitStep(activity, ctx);
    const childContext = this.contextForChildren(activity, ctx, step);
    for (const child of activity.children) this.walk(child, childContext);
  }

  /** Returns a refined context if this node is a structural wrapper, else undefined. */
  private wrapperContext(activity: ActivityInfo, ctx: WalkContext): WalkContext | undefined {
    const local = activity.type.toLowerCase();
    if (
      local.endsWith("activityaction") ||
      local.endsWith("activityfunc") ||
      local.endsWith(".catches")
    ) {
      return ctx; // transparent unwrap
    }
    const label = branchWrapperLabel(activity.type);
    if (label === undefined) return undefined;

    if (label === "Catch") {
      const caughtType =
        firstAttr(activity, "TypeArguments", "x:TypeArguments") ?? "System.Exception";
      return { ...ctx, tryRole: "catch", caughtType };
    }
    if (label === "Finally") return { ...ctx, tryRole: "finally" };
    if (label === "Body" && ctx.tryRole === undefined) {
      // RetryScope.Body / repeat bodies keep their surrounding role unless we
      // are already inside a retry decision (handled when the decision emits).
      return ctx;
    }
    // If.Then / If.Else / FlowDecision.True/.False open a decision branch.
    const branchGroupId =
      ctx.parentStepId !== undefined ? `${ctx.parentStepId}#${label}` : undefined;
    if (branchGroupId !== undefined && !this.branchGroups.has(branchGroupId)) {
      this.branchGroups.set(branchGroupId, {
        id: branchGroupId,
        decisionStepId: ctx.parentStepId!,
        label,
      });
    }
    return { ...ctx, branchGroupId: branchGroupId ?? ctx.branchGroupId };
  }

  private emitStep(activity: ActivityInfo, ctx: WalkContext): BuildStep {
    const stepId = `step:${this.stepCounter++}`;
    const classification = classifyActivity(activity.type, activity.attributes);
    const kind = stepKindOf(activity.type, activity.attributes);
    const { systemId, surfaceId } = this.resolveSystem(classification, ctx, stepId, activity);

    const node: StepNode = {
      id: stepId,
      workflowId: ctx.workflowId,
      order: this.steps.filter((s) => s.node.workflowId === ctx.workflowId).length,
      depth: ctx.depth,
      kind,
      activityType: shortType(activity.type),
      label: activity.displayName ?? shortType(activity.type),
      annotation: activity.annotation,
      systemId,
      surfaceId,
      parentStepId: ctx.parentStepId,
    };

    this.recordDecision(activity, ctx, node);
    this.recordTransaction(activity, ctx, node);
    this.recordInvoke(activity, ctx);

    const step: BuildStep = {
      node,
      tryRole: ctx.tryRole,
      caughtType: ctx.caughtType,
      branchGroupId: ctx.branchGroupId,
      isBusinessThrow: isBusinessExceptionThrow(activity.type, activity.attributes),
    };
    this.steps.push(step);
    return step;
  }

  /** Resolves which system + surface a step touches, honouring scope inheritance. */
  private resolveSystem(
    classification: ReturnType<typeof classifyActivity>,
    ctx: WalkContext,
    stepId: string,
    activity: ActivityInfo,
  ): { systemId: string | undefined; surfaceId: string | undefined } {
    if (classification.role === "container" || classification.role === "leaf") {
      const draft = classification.system ?? GENERIC_UI_SYSTEM;
      const system = this.getOrCreateSystem(draft, stepId);
      const surfaceId = this.attachSurface(system, classification.surface, ctx.workflowId, stepId);
      return { systemId: system.id, surfaceId };
    }
    if (classification.role === "ui") {
      if (ctx.ambient !== undefined) {
        const system = this.systemById(ctx.ambient.systemId);
        system.stepIds.add(stepId);
        const ownSurface = this.attachSurface(
          system,
          classification.surface,
          ctx.workflowId,
          stepId,
        );
        return { systemId: system.id, surfaceId: ownSurface ?? ctx.ambient.surfaceId };
      }
      const system = this.getOrCreateSystem(GENERIC_UI_SYSTEM, stepId);
      const surfaceId = this.attachSurface(system, classification.surface, ctx.workflowId, stepId);
      return { systemId: system.id, surfaceId };
    }
    void activity;
    return { systemId: undefined, surfaceId: undefined };
  }

  private contextForChildren(
    activity: ActivityInfo,
    ctx: WalkContext,
    step: BuildStep,
  ): WalkContext {
    const base: WalkContext = { ...ctx, depth: ctx.depth + 1, parentStepId: step.node.id };
    // A container activity becomes the ambient system for everything beneath it.
    if (step.node.kind === "container" && step.node.systemId !== undefined) {
      return { ...base, ambient: { systemId: step.node.systemId, surfaceId: step.node.surfaceId } };
    }
    if (step.node.kind === "retry") {
      return { ...base, tryRole: "retry" };
    }
    if (step.node.kind === "try") {
      return { ...base, tryRole: "try" };
    }
    return base;
  }

  // ---- Systems + surfaces -------------------------------------------------

  private getOrCreateSystem(draft: SystemDraft, stepId: string): SystemAccumulator {
    const key = `${draft.kind}::${draft.name}`;
    let system = this.systems.get(key);
    if (system === undefined) {
      system = {
        id: `sys:${this.systemCounter++}`,
        kind: draft.kind,
        name: draft.name,
        surfaces: new Map(),
        stepIds: new Set(),
      };
      this.systems.set(key, system);
    }
    system.stepIds.add(stepId);
    return system;
  }

  private systemById(id: string): SystemAccumulator {
    for (const system of this.systems.values()) if (system.id === id) return system;
    throw new Error(`Unknown system id: ${id}`);
  }

  private attachSurface(
    system: SystemAccumulator,
    surface: SurfaceDraft | undefined,
    workflowId: string,
    stepId: string,
  ): string | undefined {
    if (surface === undefined) return undefined;
    const key = `${surface.kind}::${surface.label}::${surface.detail ?? ""}`;
    let acc = system.surfaces.get(key);
    if (acc === undefined) {
      acc = {
        id: `surface:${this.surfaceCounter++}`,
        kind: surface.kind,
        label: surface.label,
        detail: surface.detail,
        workflowIds: new Set(),
        stepIds: new Set(),
      };
      system.surfaces.set(key, acc);
    }
    acc.workflowIds.add(workflowId);
    acc.stepIds.add(stepId);
    return acc.id;
  }

  private finalizeSystems(): SystemNode[] {
    return [...this.systems.values()].map((system) => {
      const surfaces: SystemSurface[] = [...system.surfaces.values()].map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        detail: s.detail,
        workflowIds: [...s.workflowIds],
        stepIds: [...s.stepIds],
      }));
      return {
        id: system.id,
        kind: system.kind,
        name: system.name,
        surfaces,
        stepCount: system.stepIds.size,
      };
    });
  }

  // ---- Decisions / transactions / invokes --------------------------------

  private recordDecision(activity: ActivityInfo, ctx: WalkContext, step: StepNode): void {
    const draft = decisionOf(activity.type, activity.attributes);
    if (draft === undefined) return;
    this.decisions.push({
      id: `decision:${this.decisions.length}`,
      kind: draft.kind,
      label: step.label,
      condition: draft.condition,
      workflowId: ctx.workflowId,
      stepId: step.id,
      branches: [...draft.branches],
    });
  }

  private recordTransaction(activity: ActivityInfo, ctx: WalkContext, step: StepNode): void {
    const draft = transactionOf(activity.type, activity.displayName, activity.attributes);
    if (draft === undefined) return;
    this.transactions.push({
      id: `txn:${this.transactions.length}`,
      op: draft.op,
      label: draft.label,
      workflowId: ctx.workflowId,
      stepId: step.id,
    });
  }

  private recordInvoke(activity: ActivityInfo, ctx: WalkContext): void {
    const target = invokeTarget(activity.type, activity.attributes);
    if (target === undefined) return;
    const set = this.invokeTargets.get(ctx.workflowId) ?? new Set<string>();
    set.add(target);
    this.invokeTargets.set(ctx.workflowId, set);
  }

  private resolveInvokes(workflows: WorkflowNode[]): void {
    const byBase = new Map<string, string>();
    for (const wf of workflows) byBase.set(baseName(wf.name).toLowerCase(), wf.id);

    const invokedBy = new Map<string, Set<string>>();
    const mutable = new Map<string, WorkflowNode & { invokes: string[] }>();
    for (const wf of workflows) mutable.set(wf.id, { ...wf, invokes: [] });

    for (const [workflowId, targets] of this.invokeTargets) {
      for (const target of targets) {
        const targetId = byBase.get(baseName(target).toLowerCase());
        if (targetId === undefined || targetId === workflowId) continue;
        const node = mutable.get(workflowId)!;
        if (!node.invokes.includes(targetId)) node.invokes.push(targetId);
        const set = invokedBy.get(targetId) ?? new Set<string>();
        set.add(workflowId);
        invokedBy.set(targetId, set);
      }
    }

    // Fold resolved invoke relationships + entry-point flag back into the list.
    const entryName = this.options.entryPoint;
    workflows.forEach((wf, i) => {
      const node = mutable.get(wf.id)!;
      const invokedBySet = invokedBy.get(wf.id);
      const isEntry =
        entryName !== undefined
          ? baseName(wf.name).toLowerCase() === baseName(entryName).toLowerCase()
          : /^main$/iu.test(baseName(wf.name)) ||
            (invokedBySet === undefined && node.invokes.length > 0);
      workflows[i] = {
        ...wf,
        invokes: node.invokes,
        invokedBy: invokedBySet === undefined ? [] : [...invokedBySet],
        isEntryPoint: isEntry,
      };
    });
    // Guarantee at least one entry point.
    if (!workflows.some((w) => w.isEntryPoint) && workflows.length > 0) {
      workflows[0] = { ...workflows[0]!, isEntryPoint: true };
    }
  }

  private attachWorkflowSystems(workflows: WorkflowNode[]): WorkflowNode[] {
    return workflows.map((wf) => {
      const systemIds = new Set<string>();
      for (const step of this.steps) {
        if (step.node.workflowId === wf.id && step.node.systemId !== undefined) {
          systemIds.add(step.node.systemId);
        }
      }
      return { ...wf, systemIds: [...systemIds] };
    });
  }

  private buildEdges(workflows: WorkflowNode[]): Edge[] {
    const edges: Edge[] = [];
    let counter = 0;
    for (const wf of workflows) {
      for (const target of wf.invokes) {
        edges.push({
          id: `edge:${counter++}`,
          kind: "invoke",
          from: wf.id,
          to: target,
          label: "invokes",
        });
      }
      for (const systemId of wf.systemIds) {
        edges.push({
          id: `edge:${counter++}`,
          kind: "uses-system",
          from: wf.id,
          to: systemId,
          label: "uses",
        });
      }
    }
    return edges;
  }

  // ---- Pathways ----------------------------------------------------------

  private derivePathways(workflows: WorkflowNode[]): Pathway[] {
    const pathways: Pathway[] = [];
    let counter = 0;
    const budget = { branch: this.options.maxBranchPathways ?? DEFAULT_MAX_BRANCH_PATHWAYS };

    for (const wf of workflows) {
      const steps = this.steps.filter((s) => s.node.workflowId === wf.id);
      pathways.push(...this.workflowPathways(wf, steps, () => `path:${counter++}`, budget));
    }
    return pathways;
  }

  private workflowPathways(
    wf: WorkflowNode,
    steps: readonly BuildStep[],
    nextId: () => string,
    budget: { branch: number },
  ): Pathway[] {
    const result: Pathway[] = [];
    // A step is "meaningful" for a scenario if it does or decides something —
    // i.e. anything except the structural wrappers (Sequence, TryCatch shell).
    const meaningful = (s: BuildStep): boolean =>
      s.node.kind !== "structural" &&
      s.node.kind !== "try" &&
      s.node.kind !== "catch" &&
      s.node.kind !== "finally";

    // Happy path: everything not inside a catch block.
    const happy = steps.filter((s) => s.tryRole !== "catch" && meaningful(s));
    if (happy.length > 0) {
      result.push(
        this.pathway(
          nextId(),
          "happy-path",
          `${cleanName(wf.name)} — happy path`,
          wf.id,
          happy,
          "The normal, exception-free route through this workflow.",
        ),
      );
    }

    // Exception pathways: group catch steps by the exception they handle.
    const catchGroups = groupBy(
      steps.filter((s) => s.tryRole === "catch" && meaningful(s)),
      (s) => s.caughtType ?? "System.Exception",
    );
    for (const [caughtType, group] of catchGroups) {
      const business = /businessruleexception|businessexception/iu.test(caughtType);
      result.push(
        this.pathway(
          nextId(),
          business ? "business-exception" : "system-exception",
          `${cleanName(wf.name)} — handle ${shortType(caughtType)}`,
          wf.id,
          group,
          business
            ? "Business rule exception is caught and handled here."
            : "Technical/system exception recovery path.",
        ),
      );
    }

    // A raised business exception (Throw BusinessRuleException) is its own scenario.
    const businessThrows = steps.filter((s) => s.isBusinessThrow);
    if (businessThrows.length > 0 && !result.some((p) => p.kind === "business-exception")) {
      result.push(
        this.pathway(
          nextId(),
          "business-exception",
          `${cleanName(wf.name)} — business exception raised`,
          wf.id,
          businessThrows,
          "A business rule is violated and the transaction is flagged as a business exception.",
        ),
      );
    }

    // Retry scenario.
    const retrySteps = steps.filter((s) => s.tryRole === "retry" && meaningful(s));
    if (retrySteps.length > 0) {
      result.push(
        this.pathway(
          nextId(),
          "retry",
          `${cleanName(wf.name)} — retry`,
          wf.id,
          retrySteps,
          "Steps re-executed by a Retry Scope until they succeed or the limit is hit.",
        ),
      );
    }

    // Decision branches (capped so large flows stay legible).
    const branchGroups = groupBy(
      steps.filter((s) => s.branchGroupId !== undefined && meaningful(s)),
      (s) => s.branchGroupId!,
    );
    for (const [groupId, group] of branchGroups) {
      if (budget.branch <= 0) break;
      const meta = this.branchGroups.get(groupId);
      if (meta === undefined) continue;
      const decisionLabel =
        this.decisions.find((d) => d.stepId === meta.decisionStepId)?.label ?? "Decision";
      budget.branch -= 1;
      result.push(
        this.pathway(
          nextId(),
          "branch",
          `${decisionLabel} → ${meta.label}`,
          wf.id,
          group,
          `Branch taken when '${decisionLabel}' resolves to ${meta.label}.`,
        ),
      );
    }
    return result;
  }

  private pathway(
    id: string,
    kind: Pathway["kind"],
    label: string,
    workflowId: string,
    steps: readonly BuildStep[],
    description: string,
  ): Pathway {
    const stepIds = steps.map((s) => s.node.id);
    const systemIds = [
      ...new Set(steps.map((s) => s.node.systemId).filter((x): x is string => x !== undefined)),
    ];
    return { id, kind, label, workflowId, description, stepIds, systemIds };
  }
}

// ---- small helpers -------------------------------------------------------

function firstAttr(activity: ActivityInfo, ...names: readonly string[]): string | undefined {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(activity.attributes)) {
    const local = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
    if (wanted.has(local.toLowerCase()) || wanted.has(key.toLowerCase())) return value;
  }
  return undefined;
}

function shortType(type: string): string {
  const colon = type.lastIndexOf(":");
  return colon >= 0 ? type.slice(colon + 1) : type;
}

function baseName(name: string): string {
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  const file = slash >= 0 ? name.slice(slash + 1) : name;
  return file.replace(/\.xaml$/iu, "");
}

function cleanName(name: string): string {
  return baseName(name);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "wf"
  );
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}
