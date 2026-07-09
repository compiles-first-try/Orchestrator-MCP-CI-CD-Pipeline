import type { ArgumentDirection } from "@rpa-platform/xaml-parser";

// ---------------------------------------------------------------------------
// The ProcessGraph is a semantic model of a UiPath automation, distilled from
// the raw XAML into the concepts a person reasons about when they debug or
// review a bot: which *systems* it touches, which *data* flows through it,
// where it *decides*, which *transactions* it processes, and which *pathways*
// (scenarios) it can take. `tools/process-viz` renders this model as a 3D map;
// nothing in here depends on the renderer, so the model is reusable on its own.
// ---------------------------------------------------------------------------

/**
 * A category of external system a bot interacts with. Rendered as a *building*.
 */
export type SystemKind =
  | "browser"
  | "web-app"
  | "database"
  | "api"
  | "excel"
  | "email"
  | "file-system"
  | "pdf"
  | "terminal"
  | "orchestrator"
  | "credential-store"
  | "application"
  | "unknown";

/**
 * A specific *area* inside a system — the "login page", a page in a web app, a
 * database table, an API endpoint, an Excel worksheet, a mailbox, a file on
 * disk, a queue, an Orchestrator asset. Rendered as a *floor / door* on a
 * building.
 */
export type SurfaceKind =
  | "login"
  | "page"
  | "table"
  | "endpoint"
  | "worksheet"
  | "mailbox"
  | "file"
  | "screen"
  | "queue"
  | "asset"
  | "credential"
  | "unknown";

export interface SystemSurface {
  readonly id: string;
  readonly kind: SurfaceKind;
  /** Human label, e.g. "Login page", "Orders table", "GET /api/v1/orders". */
  readonly label: string;
  /** Raw evidence: the URL, file path, table name, endpoint, selector. */
  readonly detail: string | undefined;
  readonly workflowIds: readonly string[];
  readonly stepIds: readonly string[];
}

export interface SystemNode {
  readonly id: string;
  readonly kind: SystemKind;
  /** e.g. "Web Browser", "SQL Database", "Excel", "Outlook", "Orchestrator". */
  readonly name: string;
  readonly surfaces: readonly SystemSurface[];
  /** How many activity steps touch this system — drives building height. */
  readonly stepCount: number;
}

// ---- Data: variables + arguments + their values --------------------------

export type DataKind = "argument" | "variable";

export interface DataNode {
  readonly id: string;
  readonly kind: DataKind;
  readonly name: string;
  readonly dataType: string;
  /** Only set for arguments. */
  readonly direction: ArgumentDirection | undefined;
  /** Default value / literal, when the XAML declares one. */
  readonly value: string | undefined;
  readonly annotation: string | undefined;
  readonly scope: string | undefined;
  readonly workflowId: string;
}

// ---- Steps: the ordered activities, atoms of every pathway ---------------

export type StepKind =
  | "container"
  | "leaf"
  | "ui"
  | "decision"
  | "transaction"
  | "invoke"
  | "log"
  | "assign"
  | "try"
  | "catch"
  | "finally"
  | "retry"
  | "throw"
  | "structural";

export interface StepNode {
  readonly id: string;
  readonly workflowId: string;
  /** Document order within the workflow (pre-order walk of the activity tree). */
  readonly order: number;
  readonly depth: number;
  readonly kind: StepKind;
  readonly activityType: string;
  readonly label: string;
  readonly annotation: string | undefined;
  readonly systemId: string | undefined;
  readonly surfaceId: string | undefined;
  readonly parentStepId: string | undefined;
}

// ---- Decisions -----------------------------------------------------------

export type DecisionKind =
  | "if"
  | "switch"
  | "flow-decision"
  | "flow-switch"
  | "while"
  | "do-while"
  | "for-each"
  | "retry"
  | "state-machine"
  | "parallel";

export interface DecisionNode {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly label: string;
  readonly condition: string | undefined;
  readonly workflowId: string;
  readonly stepId: string;
  /** Branch labels: ["Then", "Else"] or ["Case: Approved", "Default"]. */
  readonly branches: readonly string[];
}

// ---- Transactions (REFramework dispatcher/performer) ---------------------

export type TransactionOp =
  | "get"
  | "process"
  | "set-status"
  | "add-queue-item"
  | "business-exception";

export interface TransactionNode {
  readonly id: string;
  readonly op: TransactionOp;
  readonly label: string;
  readonly workflowId: string;
  readonly stepId: string;
}

// ---- Pathways: one route per scenario ------------------------------------

export type PathwayKind =
  | "happy-path"
  | "business-exception"
  | "system-exception"
  | "retry"
  | "branch";

export interface Pathway {
  readonly id: string;
  readonly kind: PathwayKind;
  readonly label: string;
  readonly workflowId: string;
  readonly description: string | undefined;
  /** Ordered step ids the scenario walks through. */
  readonly stepIds: readonly string[];
  /** Distinct systems the scenario traverses — drives which pipes light up. */
  readonly systemIds: readonly string[];
}

// ---- Workflows: the .xaml files being executed ---------------------------

export interface WorkflowNode {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly annotation: string | undefined;
  readonly isEntryPoint: boolean;
  readonly argumentIds: readonly string[];
  readonly variableIds: readonly string[];
  readonly stepIds: readonly string[];
  /** Workflow ids this workflow invokes via InvokeWorkflowFile. */
  readonly invokes: readonly string[];
  readonly invokedBy: readonly string[];
  readonly systemIds: readonly string[];
}

// ---- Edges (typed relationships for graph rendering) ---------------------

export type EdgeKind = "invoke" | "uses-system";

export interface Edge {
  readonly id: string;
  readonly kind: EdgeKind;
  readonly from: string;
  readonly to: string;
  readonly label: string | undefined;
}

// ---- Search index --------------------------------------------------------

export type SearchEntryKind =
  | "workflow"
  | "system"
  | "surface"
  | "data"
  | "decision"
  | "transaction"
  | "pathway"
  | "step";

export interface SearchEntry {
  readonly id: string;
  readonly kind: SearchEntryKind;
  readonly label: string;
  readonly detail: string | undefined;
  /** Lower-cased keywords the UI matches a query against. */
  readonly terms: readonly string[];
}

export interface ProcessGraphMeta {
  readonly name: string;
  readonly source: string;
  readonly workflowCount: number;
  readonly systemCount: number;
  readonly stepCount: number;
  readonly pathwayCount: number;
  readonly generatedNote: string;
}

export interface ProcessGraph {
  readonly meta: ProcessGraphMeta;
  readonly workflows: readonly WorkflowNode[];
  readonly systems: readonly SystemNode[];
  readonly data: readonly DataNode[];
  readonly decisions: readonly DecisionNode[];
  readonly transactions: readonly TransactionNode[];
  readonly pathways: readonly Pathway[];
  readonly steps: readonly StepNode[];
  readonly edges: readonly Edge[];
  readonly search: readonly SearchEntry[];
}

/** A single parsed workflow file, the unit the builder consumes. */
export interface WorkflowSource {
  readonly name: string;
  readonly path: string;
  readonly parsed: import("@rpa-platform/xaml-parser").ParsedXaml;
}
