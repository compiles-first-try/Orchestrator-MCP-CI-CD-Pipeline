import type { DecisionKind, StepKind, TransactionOp } from "./types.js";
import { classifyActivity } from "./system-catalog.js";

// ---------------------------------------------------------------------------
// Non-system roles an activity can play: control-flow decisions, REFramework
// transactions, workflow invocations, and the coarse step kind used for
// pathway derivation. Kept separate from system-catalog so the "what system"
// question and the "what control-flow role" question stay independent.
// ---------------------------------------------------------------------------

type Attrs = Readonly<Record<string, string>>;

function localName(type: string): string {
  const colon = type.lastIndexOf(":");
  return (colon >= 0 ? type.slice(colon + 1) : type).toLowerCase();
}

function attr(attrs: Attrs, ...names: readonly string[]): string | undefined {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(attrs)) {
    const local = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
    if (wanted.has(local.toLowerCase()) && value.trim() !== "") return value;
  }
  return undefined;
}

/** Returns the invoked workflow file name if this is an InvokeWorkflowFile. */
export function invokeTarget(type: string, attrs: Attrs): string | undefined {
  if (localName(type) !== "invokeworkflowfile") return undefined;
  return attr(attrs, "WorkflowFileName", "FileName");
}

export interface DecisionDraft {
  readonly kind: DecisionKind;
  readonly condition: string | undefined;
  readonly branches: readonly string[];
}

const DECISION_TABLE: Readonly<
  Record<string, { kind: DecisionKind; branches: readonly string[] }>
> = {
  if: { kind: "if", branches: ["Then", "Else"] },
  switch: { kind: "switch", branches: ["Cases", "Default"] },
  flowdecision: { kind: "flow-decision", branches: ["True", "False"] },
  flowswitch: { kind: "flow-switch", branches: ["Cases", "Default"] },
  while: { kind: "while", branches: ["Loop body", "Exit"] },
  dowhile: { kind: "do-while", branches: ["Loop body", "Exit"] },
  foreach: { kind: "for-each", branches: ["Each item"] },
  parallelforeach: { kind: "for-each", branches: ["Each item (parallel)"] },
  retryscope: { kind: "retry", branches: ["Retry", "Give up"] },
  statemachine: { kind: "state-machine", branches: ["Transitions"] },
  parallel: { kind: "parallel", branches: ["Branches"] },
};

export function decisionOf(type: string, attrs: Attrs): DecisionDraft | undefined {
  const entry = DECISION_TABLE[localName(type)];
  if (entry === undefined) return undefined;
  const condition = attr(attrs, "Condition", "Expression", "Values");
  return { kind: entry.kind, condition, branches: entry.branches };
}

const BUSINESS_EXCEPTION_PATTERN = /businessruleexception|businessexception/iu;

/** Detects whether a Throw/Rethrow raises a business rule exception. */
export function isBusinessExceptionThrow(type: string, attrs: Attrs): boolean {
  const name = localName(type);
  if (name !== "throw" && name !== "rethrow") return false;
  return Object.values(attrs).some((v) => BUSINESS_EXCEPTION_PATTERN.test(v));
}

export interface TransactionDraft {
  readonly op: TransactionOp;
  readonly label: string;
}

export function transactionOf(
  type: string,
  displayName: string | undefined,
  attrs: Attrs,
): TransactionDraft | undefined {
  const name = localName(type);
  const display = (displayName ?? "").toLowerCase();

  if (isBusinessExceptionThrow(type, attrs)) {
    return { op: "business-exception", label: displayName ?? "Throw Business Rule Exception" };
  }
  if (name === "settransactionstatus" || display.includes("set transaction status")) {
    return { op: "set-status", label: displayName ?? "Set Transaction Status" };
  }
  if (
    name === "addqueueitem" ||
    name === "addtransactionitem" ||
    name === "bulkaddqueueitems" ||
    display.includes("add queue item") ||
    display.includes("add transaction")
  ) {
    return { op: "add-queue-item", label: displayName ?? "Add Queue Item" };
  }
  if (
    name === "getqueueitem" ||
    name === "gettransactionitem" ||
    display.includes("get transaction")
  ) {
    return { op: "get", label: displayName ?? "Get Transaction Item" };
  }
  const invoked = invokeTarget(type, attrs);
  if (invoked !== undefined && /process/iu.test(invoked)) {
    return { op: "process", label: displayName ?? "Process Transaction" };
  }
  if (display.includes("process transaction")) {
    return { op: "process", label: displayName ?? "Process Transaction" };
  }
  return undefined;
}

const LOG_TYPES = new Set([
  "logmessage",
  "writeline",
  "addlogfields",
  "removelogfields",
  "comment",
]);
const ASSIGN_TYPES = new Set(["assign", "multipleassign", "assignmultiple"]);
const TRY_WRAPPERS: Readonly<Record<string, StepKind>> = {
  trycatch: "try",
  "trycatch.try": "try",
  "trycatch.finally": "finally",
  catch: "catch",
  finally: "finally",
};

/**
 * Coarse step kind, used for pathway derivation. System role wins first
 * (container/leaf/ui), then control-flow, then structural fallbacks.
 */
export function stepKindOf(type: string, attrs: Attrs): StepKind {
  const name = localName(type);
  if (invokeTarget(type, attrs) !== undefined) return "invoke";
  if (decisionOf(type, attrs) !== undefined) return "decision";
  if (name === "throw" || name === "rethrow") return "throw";
  if (TRY_WRAPPERS[name] !== undefined) return TRY_WRAPPERS[name]!;
  if (name === "retryscope") return "retry";
  if (LOG_TYPES.has(name)) return "log";
  if (ASSIGN_TYPES.has(name)) return "assign";

  const classification = classifyActivity(type, attrs);
  if (classification.role === "container") return "container";
  if (classification.role === "leaf") return "leaf";
  if (classification.role === "ui") return "ui";
  return "structural";
}

/** True for the branch-wrapper element tags XAML emits (If.Then, Catch, ...). */
export function branchWrapperLabel(type: string): string | undefined {
  const name = localName(type);
  if (name.endsWith(".then")) return "Then";
  if (name.endsWith(".else")) return "Else";
  if (name.endsWith(".body")) return "Body";
  if (name === "catch" || name.endsWith(".catch")) return "Catch";
  if (name.endsWith(".finally")) return "Finally";
  if (name.endsWith(".true")) return "True";
  if (name.endsWith(".false")) return "False";
  return undefined;
}
