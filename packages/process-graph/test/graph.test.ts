import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildProcessGraph, ingestDirectory } from "../src/index.js";
import type { ProcessGraph } from "../src/index.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "refx-demo");

describe("process-graph over a REFramework-style project", () => {
  let graph: ProcessGraph;

  beforeAll(async () => {
    const ingested = await ingestDirectory(FIXTURE);
    graph = buildProcessGraph(ingested.sources, {
      name: ingested.name,
      source: ingested.source,
      ...(ingested.entryPoint !== undefined ? { entryPoint: ingested.entryPoint } : {}),
    });
  });

  it("ingests the process metadata from project.json", async () => {
    const ingested = await ingestDirectory(FIXTURE);
    expect(ingested.name).toBe("Invoice Processing Bot");
    expect(ingested.entryPoint).toBe("Main.xaml");
    expect(ingested.sources).toHaveLength(4);
    expect(ingested.warnings).toEqual([]);
  });

  it("marks Main as the entry point and resolves its invoke call-graph", () => {
    const main = graph.workflows.find((w) => w.name === "Main.xaml");
    expect(main?.isEntryPoint).toBe(true);
    const invokedNames = (main?.invokes ?? [])
      .map((id) => graph.workflows.find((w) => w.id === id)?.name)
      .sort();
    expect(invokedNames).toEqual([
      "Framework/GetTransactionData.xaml",
      "Framework/SetTransactionStatus.xaml",
      "Process.xaml",
    ]);

    const process = graph.workflows.find((w) => w.name === "Process.xaml");
    expect(process?.invokedBy).toContain(main?.id);
  });

  it("detects systems as buildings with the right kinds", () => {
    const kinds = new Set(graph.systems.map((s) => s.kind));
    expect(kinds).toContain("browser");
    expect(kinds).toContain("database");
    expect(kinds).toContain("excel");
    expect(kinds).toContain("email");
    expect(kinds).toContain("orchestrator");
  });

  it("detects surfaces (areas) within systems, including the login page and a DB table", () => {
    const browser = graph.systems.find((s) => s.kind === "browser");
    const surfaceLabels = (browser?.surfaces ?? []).map((s) => s.label);
    expect(surfaceLabels).toContain("Login page");
    expect(surfaceLabels.some((l) => l.includes("finance.contoso.com/invoices/new"))).toBe(true);
    const loginSurface = browser?.surfaces.find((s) => s.kind === "login");
    expect(loginSurface?.detail).toBe("https://finance.contoso.com/login");

    const db = graph.systems.find((s) => s.kind === "database");
    expect((db?.surfaces ?? []).some((s) => s.label === "Ledger table")).toBe(true);

    const excel = graph.systems.find((s) => s.kind === "excel");
    expect((excel?.surfaces ?? []).some((s) => s.label.startsWith("Rules"))).toBe(true);
  });

  it("captures variables and arguments with their values", () => {
    const invoiceArg = graph.data.find((d) => d.name === "in_InvoiceId");
    expect(invoiceArg?.kind).toBe("argument");
    expect(invoiceArg?.direction).toBe("In");
    const retry = graph.data.find((d) => d.name === "RetryCounter");
    expect(retry?.kind).toBe("variable");
    expect(retry?.value).toBe("0");
  });

  it("detects the decision point in Process", () => {
    const ifDecision = graph.decisions.find((d) => d.kind === "if");
    expect(ifDecision?.label).toBe("Amount within tolerance?");
    expect(ifDecision?.condition).toBe("[IsWithinTolerance]");
    expect(ifDecision?.branches).toEqual(["Then", "Else"]);
  });

  it("detects REFramework transactions including a business exception", () => {
    const ops = new Set(graph.transactions.map((t) => t.op));
    expect(ops).toContain("get");
    expect(ops).toContain("set-status");
    expect(ops).toContain("process");
    expect(ops).toContain("business-exception");
  });

  it("derives one pathway per scenario", () => {
    const process = graph.workflows.find((w) => w.name === "Process.xaml");
    const processPathways = graph.pathways.filter((p) => p.workflowId === process?.id);
    const kinds = new Set(processPathways.map((p) => p.kind));
    expect(kinds).toContain("happy-path");
    expect(kinds).toContain("business-exception");
    expect(kinds).toContain("branch");

    const main = graph.workflows.find((w) => w.name === "Main.xaml");
    const mainKinds = new Set(
      graph.pathways.filter((p) => p.workflowId === main?.id).map((p) => p.kind),
    );
    expect(mainKinds).toContain("system-exception");
  });

  it("pathways carry the systems they traverse (for pipe routing)", () => {
    const happy = graph.pathways.find((p) => p.kind === "happy-path" && p.systemIds.length > 0);
    expect(happy).toBeDefined();
    expect(happy?.systemIds.every((id) => graph.systems.some((s) => s.id === id))).toBe(true);
  });

  it("builds a search index that finds systems, surfaces and data by keyword", () => {
    const ledger = graph.search.filter((e) => e.terms.includes("ledger"));
    expect(ledger.some((e) => e.kind === "surface")).toBe(true);
    const invoiceId = graph.search.find((e) => e.kind === "data" && e.label === "in_InvoiceId");
    expect(invoiceId).toBeDefined();
    expect(graph.search.some((e) => e.kind === "pathway")).toBe(true);
  });

  it("populates meta counts", () => {
    expect(graph.meta.name).toBe("Invoice Processing Bot");
    expect(graph.meta.workflowCount).toBe(4);
    expect(graph.meta.systemCount).toBe(graph.systems.length);
    expect(graph.meta.stepCount).toBe(graph.steps.length);
    expect(graph.meta.pathwayCount).toBe(graph.pathways.length);
  });
});
