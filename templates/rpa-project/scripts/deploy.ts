#!/usr/bin/env npx tsx
//
// UiPath Orchestrator deployment script.
//
// Reads Data/Config.xlsx (the single source of truth) plus orchestrator-packages.json,
// and provisions the target Orchestrator tenant via REST/OData + OAuth2 client_credentials.
//
// Config.xlsx tabs the pipeline reads (the robot ignores these; it only reads
// Settings/Constants/Assets):
//   - Pipeline        : Key | Value            (FolderPath, RepoName, ProjectName)
//   - <Tenant> Assets : Name | Type | Value | Description  (one tab per tenant)
//   - Queues          : Name | Description | MaxRetries | AutoRetry | UniqueReference | Encrypted
//   - Buckets         : Name | Description
//
// orchestrator-packages.json holds nuget packages + libraries.
//
// Run modes:
//   npx tsx scripts/deploy.ts --validate            # parse + print only, NO network calls
//   DEPLOY_MODE=dry-run npx tsx scripts/deploy.ts   # read Orchestrator, report diffs, write nothing
//   npx tsx scripts/deploy.ts                       # apply (default)
//
// Safety: assets are ADDITIVE by default (create + update only). Orchestrator
// folders are often shared across projects, so we never delete assets unless
// you explicitly opt in with PRUNE_ASSETS=true.
//
// Credentials: credential-type assets NEVER take their secret from the spreadsheet.
// The pipeline reads CRED_<ASSETNAME>_USERNAME / CRED_<ASSETNAME>_PASSWORD from the
// environment (wire these to GitHub Secrets). If the password env var is absent,
// the credential asset is skipped with a warning.
//

import ExcelJS from "exceljs";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

// ============================================================================
// Types
// ============================================================================

type AssetType = "text" | "bool" | "integer" | "credential";

interface DesiredAsset {
  name: string;
  type: AssetType;
  value: string | number | boolean | null;
  description?: string;
}

interface DesiredQueue {
  name: string;
  description?: string;
  maxRetries: number;
  autoRetry: boolean;
  uniqueReference: boolean;
  encrypted: boolean;
}

interface DesiredBucket {
  name: string;
  description?: string;
}

interface PackageEntry {
  path?: string;
  name?: string;
  version?: string;
  autoVersion?: boolean;
}

interface ProcessEntry {
  name: string;
  packageId: string;
  version?: string;
  description?: string;
}

interface PipelineMeta {
  projectName?: string;
  repoName?: string;
  folderPath?: string;
}

interface ParsedConfig {
  meta: PipelineMeta;
  assets: DesiredAsset[];
  queues: DesiredQueue[];
  buckets: DesiredBucket[];
  packages: PackageEntry[];
  libraries: PackageEntry[];
  processes: ProcessEntry[];
}

interface ODataEntity {
  Id: number;
  Name: string;
  [key: string]: unknown;
}

interface FolderEntity {
  Id: number;
  DisplayName: string;
  FullyQualifiedName?: string;
  ParentId?: number | null;
}

interface PackageVersionEntity {
  Id?: string;
  Version: string;
  [key: string]: unknown;
}

interface ProcessReleaseEntity {
  Id: number;
  ProcessKey?: string;
  Name?: string;
  [key: string]: unknown;
}

interface DeploySummary {
  tenant: string;
  mode: string;
  project?: string;
  repo?: string;
  folderPath?: string;
  folder?: { path: string; action: string };
  assets?: { creates: number; updates: number; skipped: number; unchanged: number; pruned: number };
  queues?: { creates: number; unchanged: number };
  buckets?: { creates: number; unchanged: number };
  packages?: Array<{ name: string; version: string; action: string }>;
  libraries?: Array<{ name: string; version: string; action: string }>;
  processes?: Array<{ name: string; action: string }>;
  errors: Array<{ step: string; message: string }>;
}

type Scalar = string | number | boolean | null;

// ============================================================================
// Excel parsing
// ============================================================================

/** Flatten any ExcelJS cell value to a plain scalar. */
function cellToScalar(value: ExcelJS.CellValue): Scalar {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if ("error" in obj) return String(obj["error"]);
    if ("richText" in obj && Array.isArray(obj["richText"])) {
      return (obj["richText"] as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    }
    if ("hyperlink" in obj) return String(obj["text"] ?? obj["hyperlink"] ?? "");
    if ("formula" in obj || "sharedFormula" in obj) {
      const result = obj["result"];
      if (result === null || result === undefined) return null;
      if (result instanceof Date) return result.toISOString();
      return result as Scalar;
    }
  }
  return null;
}

/** Normalize a sheet/header/tenant token: lowercase, strip everything but a–z0–9. */
function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function getWorksheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  const target = normalizeToken(name);
  return workbook.worksheets.find((ws) => normalizeToken(ws.name) === target);
}

/** Read a sheet into rows of Map<normalizedHeader, Scalar>. Skips fully-empty rows. */
function sheetToRecords(sheet: ExcelJS.Worksheet): Array<Map<string, Scalar>> {
  const headerRow = sheet.getRow(1);
  const headers = new Map<number, string>(); // colNumber -> normalized header
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = normalizeToken(String(cellToScalar(cell.value) ?? ""));
    if (key !== "") headers.set(colNumber, key);
  });

  const records: Array<Map<string, Scalar>> = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = new Map<string, Scalar>();
    let hasAny = false;
    for (const [colNumber, header] of headers) {
      const scalar = cellToScalar(row.getCell(colNumber).value);
      if (scalar !== null && String(scalar).trim() !== "") hasAny = true;
      record.set(header, scalar);
    }
    if (hasAny) records.push(record);
  });
  return records;
}

function str(record: Map<string, Scalar>, key: string): string | undefined {
  const v = record.get(normalizeToken(key));
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function toBool(v: Scalar): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return ["true", "yes", "y", "1"].includes(v.trim().toLowerCase());
  return false;
}

function toInt(v: Scalar, fallback: number): number {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isNaN(n)) return Math.trunc(n);
  }
  return fallback;
}

function parseAssetType(raw: string | undefined): AssetType {
  const t = (raw ?? "text").trim().toLowerCase();
  if (t === "text" || t === "string") return "text";
  if (t === "integer" || t === "int" || t === "number") return "integer";
  if (t === "bool" || t === "boolean" || t === "flag") return "bool";
  if (t === "credential" || t === "cred") return "credential";
  throw new Error(`Unknown asset type "${raw}". Use: text | integer | bool | credential.`);
}

async function parseConfig(configPath: string, tenant: string): Promise<ParsedConfig> {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath} (set CONFIG_XLSX_PATH to override).`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(configPath);

  // --- Pipeline metadata ---
  const meta: PipelineMeta = {};
  const pipelineSheet = getWorksheet(workbook, "Pipeline");
  if (pipelineSheet !== undefined) {
    for (const record of sheetToRecords(pipelineSheet)) {
      const key = str(record, "Key");
      const value = str(record, "Value");
      if (key === undefined) continue;
      const nk = normalizeToken(key);
      if (nk === "folderpath") meta.folderPath = value;
      else if (nk === "reponame") meta.repoName = value;
      else if (nk === "projectname") meta.projectName = value;
    }
  }

  // --- Per-tenant assets ---
  const assetSheet = getWorksheet(workbook, `${tenant} Assets`);
  const assets: DesiredAsset[] = [];
  if (assetSheet !== undefined) {
    for (const record of sheetToRecords(assetSheet)) {
      const name = str(record, "Name");
      if (name === undefined) continue;
      const type = parseAssetType(str(record, "Type"));
      assets.push({
        name,
        type,
        value: record.get(normalizeToken("Value")) ?? null,
        description: str(record, "Description"),
      });
    }
  }

  // --- Queues ---
  const queues: DesiredQueue[] = [];
  const queueSheet = getWorksheet(workbook, "Queues");
  if (queueSheet !== undefined) {
    for (const record of sheetToRecords(queueSheet)) {
      const name = str(record, "Name");
      if (name === undefined) continue;
      queues.push({
        name,
        description: str(record, "Description"),
        maxRetries: toInt(record.get(normalizeToken("MaxRetries")) ?? null, 0),
        autoRetry: toBool(record.get(normalizeToken("AutoRetry")) ?? null),
        uniqueReference: toBool(record.get(normalizeToken("UniqueReference")) ?? null),
        encrypted: toBool(record.get(normalizeToken("Encrypted")) ?? null),
      });
    }
  }

  // --- Buckets ---
  const buckets: DesiredBucket[] = [];
  const bucketSheet = getWorksheet(workbook, "Buckets");
  if (bucketSheet !== undefined) {
    for (const record of sheetToRecords(bucketSheet)) {
      const name = str(record, "Name");
      if (name === undefined) continue;
      buckets.push({ name, description: str(record, "Description") });
    }
  }

  // --- Packages / libraries / processes (companion JSON) ---
  let packages: PackageEntry[] = [];
  let libraries: PackageEntry[] = [];
  let processes: ProcessEntry[] = [];
  const packagesPath = process.env["PACKAGES_JSON_PATH"] ?? "orchestrator-packages.json";
  if (fs.existsSync(packagesPath)) {
    let raw: { packages?: PackageEntry[]; libraries?: PackageEntry[]; processes?: ProcessEntry[] };
    try {
      raw = JSON.parse(fs.readFileSync(packagesPath, "utf-8")) as typeof raw;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse ${packagesPath}: ${detail}`);
    }
    packages = (raw.packages ?? []).filter((p) => p != null && (p.path !== undefined || p.name !== undefined));
    libraries = (raw.libraries ?? []).filter((p) => p != null && (p.path !== undefined || p.name !== undefined));
    // Drop malformed process entries (missing packageId/name) so undefined never
    // reaches eqFilter — warn so the typo is visible rather than silently ignored.
    processes = (raw.processes ?? []).filter((p) => {
      const ok = p != null && typeof p.packageId === "string" && p.packageId !== "" && typeof p.name === "string";
      if (!ok) console.warn(`[config] Skipping invalid process entry in ${packagesPath}: ${JSON.stringify(p)}`);
      return ok;
    });
  }

  return { meta, assets, queues, buckets, packages, libraries, processes };
}

// ============================================================================
// OAuth2 Token Manager
// ============================================================================

let cachedToken: { token: string; expiresAt: number } | undefined;

async function getToken(
  identityUrl: string,
  clientId: string,
  clientSecret: string,
  scopes: string,
): Promise<string> {
  if (cachedToken !== undefined && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: scopes,
  });

  const response = await fetch(identityUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`OAuth2 token request failed (HTTP ${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  // Refresh at 80% of lifetime to avoid edge-of-expiry failures.
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 800 };
  return cachedToken.token;
}

// ============================================================================
// REST client
// ============================================================================

interface ApiContext {
  baseUrl: string;
  identityUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  folderId?: number;
}

function folderHeaders(folderId: number | undefined): Record<string, string> {
  if (folderId === undefined) return {};
  return { "X-UIPATH-OrganizationUnitId": String(folderId) };
}

async function apiRequest(
  ctx: ApiContext,
  method: string,
  urlPath: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
  query?: Record<string, string>,
): Promise<Response> {
  const token = await getToken(ctx.identityUrl, ctx.clientId, ctx.clientSecret, ctx.scopes);
  const base = ctx.baseUrl.replace(/\/+$/u, "");
  const url = new URL(`${base}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`);
  if (query !== undefined) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...folderHeaders(ctx.folderId),
    ...(extraHeaders ?? {}),
  };

  const init: RequestInit =
    body === undefined
      ? { method, headers }
      : { method, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) };

  const response = await fetch(url.toString(), init);
  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`${method} ${urlPath} failed (HTTP ${response.status}): ${text}`);
  }
  return response;
}

async function apiGet<T>(ctx: ApiContext, urlPath: string, query?: Record<string, string>): Promise<T> {
  const response = await apiRequest(ctx, "GET", urlPath, undefined, undefined, query);
  return (await response.json()) as T;
}

async function apiPost<T>(ctx: ApiContext, urlPath: string, body: unknown): Promise<T> {
  const response = await apiRequest(ctx, "POST", urlPath, body);
  return (await response.json()) as T;
}

async function apiPatch(ctx: ApiContext, urlPath: string, body: unknown): Promise<void> {
  await apiRequest(ctx, "PATCH", urlPath, body);
}

async function apiDelete(ctx: ApiContext, urlPath: string): Promise<void> {
  await apiRequest(ctx, "DELETE", urlPath);
}

async function apiPostBinary(
  ctx: ApiContext,
  urlPath: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  const token = await getToken(ctx.identityUrl, ctx.clientId, ctx.clientSecret, ctx.scopes);
  const base = ctx.baseUrl.replace(/\/+$/u, "");
  const url = `${base}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      ...folderHeaders(ctx.folderId),
    },
    body: data,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`POST ${urlPath} (binary) failed (HTTP ${response.status}): ${text}`);
  }
}

function eqFilter(field: string, value: string): string {
  return `${field} eq '${value.replace(/'/gu, "''")}'`;
}

async function odataList<T>(ctx: ApiContext, urlPath: string, query?: Record<string, string>): Promise<T[]> {
  const result = await apiGet<{ value: T[] }>(ctx, urlPath, query);
  return result.value;
}

// ============================================================================
// CICD version manager
// ============================================================================

function computeCicdVersion(
  devVersion: string,
  existingVersions: readonly string[],
): { version: string; wasBumped: boolean } {
  if (!new Set(existingVersions).has(devVersion)) {
    return { version: devVersion, wasBumped: false };
  }
  const baseVersion = devVersion.replace(/-cicd\.\d+$/u, "");
  let maxCicd = 0;
  for (const v of existingVersions) {
    const match = v.match(/^(.+)-cicd\.(\d+)$/u);
    if (match !== null && match[1] === baseVersion && match[2] !== undefined) {
      maxCicd = Math.max(maxCicd, parseInt(match[2], 10));
    }
  }
  return { version: `${baseVersion}-cicd.${maxCicd + 1}`, wasBumped: true };
}

// ============================================================================
// Simple glob (no external dependency)
// ============================================================================

function simpleGlob(pattern: string, cwd: string): string[] {
  const parts = pattern.split("/");
  const filePattern = parts.pop() ?? "";
  const dirPath = parts.length > 0 ? path.resolve(cwd, parts.join("/")) : cwd;
  if (!fs.existsSync(dirPath)) return [];

  const regex = new RegExp(
    "^" + filePattern.replace(/\./gu, "\\.").replace(/\*\*/gu, ".*").replace(/\*/gu, "[^/]*") + "$",
    "u",
  );

  if (parts.includes("**")) {
    return walkDir(dirPath).filter((f) => regex.test(path.basename(f)));
  }
  return fs
    .readdirSync(dirPath)
    .filter((f) => regex.test(f))
    .map((f) => path.join(parts.join("/"), f));
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

function extractNupkgMetadata(filePath: string): { id: string; version: string } | undefined {
  const basename = path.basename(filePath, ".nupkg");
  const match = basename.match(/^(.+?)\.(\d+\.\d+\.\d+.*)$/u);
  if (match === null) return undefined;
  const id = match[1];
  const version = match[2];
  if (id === undefined || version === undefined) return undefined;
  return { id, version };
}

function buildMultipartBody(nupkgBytes: Uint8Array, filename: string): { body: Uint8Array; boundary: string } {
  const boundary = `----FormBoundary${randomUUID().replace(/-/gu, "")}`;
  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: application/octet-stream`,
    "",
  ].join("\r\n");
  const footer = `\r\n--${boundary}--\r\n`;

  const headerBytes = new TextEncoder().encode(header + "\r\n");
  const footerBytes = new TextEncoder().encode(footer);
  const body = new Uint8Array(headerBytes.length + nupkgBytes.length + footerBytes.length);
  body.set(headerBytes, 0);
  body.set(nupkgBytes, headerBytes.length);
  body.set(footerBytes, headerBytes.length + nupkgBytes.length);
  return { body, boundary };
}

// ============================================================================
// Environment
// ============================================================================

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (val === undefined || val === "") throw new Error(`Required environment variable ${name} is not set.`);
  return val;
}

function credEnvKey(assetName: string): string {
  return assetName.toUpperCase().replace(/[^A-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
}

// ============================================================================
// Folder operations (tenant-scoped — no folder header)
// ============================================================================

async function ensureFolderPath(ctx: ApiContext, folderPath: string): Promise<FolderEntity> {
  const segments = folderPath.split("/").filter(Boolean);
  if (segments.length === 0) throw new Error("Folder path must have at least one segment.");

  let parentId: number | undefined;
  let lastFolder: FolderEntity | undefined;

  for (let i = 0; i < segments.length; i++) {
    const fqn = segments.slice(0, i + 1).join("/");
    const segmentName = segments[i];
    if (segmentName === undefined) continue;

    const existing = await odataList<FolderEntity>(ctx, "/odata/Folders", {
      $filter: eqFilter("FullyQualifiedName", fqn),
      $top: "1",
    });

    if (existing.length > 0 && existing[0] !== undefined) {
      parentId = existing[0].Id;
      lastFolder = existing[0];
      continue;
    }

    const created = await apiPost<FolderEntity>(ctx, "/odata/Folders", {
      DisplayName: segmentName,
      ...(parentId !== undefined && { ParentId: parentId }),
      ProvisionType: "Manual",
    });
    parentId = created.Id;
    lastFolder = created;
  }

  if (lastFolder === undefined) throw new Error(`Could not ensure folder path: ${folderPath}`);
  return lastFolder;
}

async function folderExists(ctx: ApiContext, folderPath: string): Promise<FolderEntity | undefined> {
  const results = await odataList<FolderEntity>(ctx, "/odata/Folders", {
    $filter: eqFilter("FullyQualifiedName", folderPath),
    $top: "1",
  });
  return results[0];
}

// ============================================================================
// Asset sync (additive by default; credentials from env)
// ============================================================================

function assetValueFields(asset: DesiredAsset): Record<string, unknown> {
  switch (asset.type) {
    case "text":
      return { StringValue: asset.value === null ? "" : String(asset.value) };
    case "integer":
      return { IntValue: toInt(asset.value, 0) };
    case "bool":
      return { BoolValue: toBool(asset.value) };
    case "credential":
      return {}; // handled separately
  }
}

function valueTypeFor(type: AssetType): string {
  return { text: "Text", integer: "Integer", bool: "Bool", credential: "Credential" }[type];
}

function credentialEnv(asset: DesiredAsset): { username: string; password: string } | undefined {
  const key = credEnvKey(asset.name);
  const password = process.env[`CRED_${key}_PASSWORD`];
  if (password === undefined || password === "") return undefined;
  const username =
    process.env[`CRED_${key}_USERNAME`] ?? (asset.value === null ? "" : String(asset.value));
  return { username, password };
}

function assetNeedsUpdate(asset: DesiredAsset, existing: Record<string, unknown>): boolean {
  if (asset.description !== undefined && asset.description !== (existing["Description"] ?? "")) return true;
  switch (asset.type) {
    case "text":
      return existing["StringValue"] !== (asset.value === null ? "" : String(asset.value));
    case "integer":
      return existing["IntValue"] !== toInt(asset.value, 0);
    case "bool":
      return existing["BoolValue"] !== toBool(asset.value);
    case "credential":
      return false; // never auto-diff secrets
  }
}

async function syncAssets(
  ctx: ApiContext,
  desired: DesiredAsset[],
  mode: string,
  prune: boolean,
): Promise<NonNullable<DeploySummary["assets"]>> {
  const current = await odataList<ODataEntity>(ctx, "/odata/Assets");
  const currentByName = new Map(current.map((a) => [a.Name, a]));
  const desiredNames = new Set(desired.map((a) => a.name));

  let creates = 0;
  let updates = 0;
  let skipped = 0;
  let unchanged = 0;
  let pruned = 0;

  for (const asset of desired) {
    const existing = currentByName.get(asset.name);

    // Credential assets: secret must come from the environment, never the sheet.
    if (asset.type === "credential") {
      const cred = credentialEnv(asset);
      if (cred === undefined) {
        console.warn(
          `  [asset] SKIP credential ${asset.name}: set CRED_${credEnvKey(asset.name)}_PASSWORD ` +
            `(and optionally _USERNAME) in GitHub Secrets. Never put the secret in Config.xlsx.`,
        );
        skipped++;
        continue;
      }
      if (existing !== undefined) {
        // Do not overwrite an existing credential automatically.
        skipped++;
        continue;
      }
      if (mode === "apply") {
        console.log(`  [asset] CREATE credential: ${asset.name}`);
        await apiPost(ctx, "/odata/Assets", {
          Name: asset.name,
          ValueScope: "Global",
          ValueType: "Credential",
          CredentialUsername: cred.username,
          CredentialPassword: cred.password,
          ...(asset.description !== undefined && { Description: asset.description }),
        });
      } else {
        console.log(`  [asset] WOULD CREATE credential: ${asset.name}`);
      }
      creates++;
      continue;
    }

    const body = {
      Name: asset.name,
      ValueScope: "Global",
      ValueType: valueTypeFor(asset.type),
      ...(asset.description !== undefined && { Description: asset.description }),
      ...assetValueFields(asset),
    };

    if (existing === undefined) {
      if (mode === "apply") {
        console.log(`  [asset] CREATE: ${asset.name}`);
        await apiPost(ctx, "/odata/Assets", body);
      } else {
        console.log(`  [asset] WOULD CREATE: ${asset.name}`);
      }
      creates++;
    } else if (assetNeedsUpdate(asset, existing as Record<string, unknown>)) {
      if (mode === "apply") {
        console.log(`  [asset] UPDATE: ${asset.name}`);
        const { Name: _n, ValueType: _vt, ...rest } = body;
        await apiPatch(ctx, `/odata/Assets(${existing.Id})`, rest);
      } else {
        console.log(`  [asset] WOULD UPDATE: ${asset.name}`);
      }
      updates++;
    } else {
      unchanged++;
    }
  }

  // Pruning is OFF by default — shared folders make blind deletes dangerous.
  if (prune) {
    for (const existing of current) {
      if ((existing as Record<string, unknown>)["ValueType"] === "Credential") continue;
      if (!desiredNames.has(existing.Name)) {
        if (mode === "apply") {
          console.log(`  [asset] PRUNE: ${existing.Name}`);
          await apiDelete(ctx, `/odata/Assets(${existing.Id})`);
        } else {
          console.log(`  [asset] WOULD PRUNE: ${existing.Name}`);
        }
        pruned++;
      }
    }
  }

  return { creates, updates, skipped, unchanged, pruned };
}

// ============================================================================
// Queue sync (create-only)
// ============================================================================

async function syncQueues(
  ctx: ApiContext,
  desired: DesiredQueue[],
  mode: string,
): Promise<NonNullable<DeploySummary["queues"]>> {
  const current = await odataList<ODataEntity>(ctx, "/odata/QueueDefinitions");
  const currentByName = new Map(current.map((q) => [q.Name, q]));

  let creates = 0;
  let unchanged = 0;

  for (const queue of desired) {
    if (currentByName.has(queue.name)) {
      unchanged++;
      continue;
    }
    if (mode === "apply") {
      console.log(`  [queue] CREATE: ${queue.name}`);
      await apiPost(ctx, "/odata/QueueDefinitions", {
        Name: queue.name,
        ...(queue.description !== undefined && { Description: queue.description }),
        MaxNumberOfRetries: queue.maxRetries,
        AcceptAutomaticallyRetry: queue.autoRetry,
        EnforceUniqueReference: queue.uniqueReference,
        Encrypted: queue.encrypted,
      });
    } else {
      console.log(`  [queue] WOULD CREATE: ${queue.name}`);
    }
    creates++;
  }
  return { creates, unchanged };
}

// ============================================================================
// Bucket sync (create-only; Identifier is a client-generated GUID)
// ============================================================================

async function syncBuckets(
  ctx: ApiContext,
  desired: DesiredBucket[],
  mode: string,
): Promise<NonNullable<DeploySummary["buckets"]>> {
  const current = await odataList<ODataEntity>(ctx, "/odata/Buckets");
  const currentByName = new Map(current.map((b) => [b.Name, b]));

  let creates = 0;
  let unchanged = 0;

  for (const bucket of desired) {
    if (currentByName.has(bucket.name)) {
      unchanged++;
      continue;
    }
    if (mode === "apply") {
      console.log(`  [bucket] CREATE: ${bucket.name}`);
      await apiPost(ctx, "/odata/Buckets", {
        Name: bucket.name,
        Identifier: randomUUID(),
        ...(bucket.description !== undefined && { Description: bucket.description }),
      });
    } else {
      console.log(`  [bucket] WOULD CREATE: ${bucket.name}`);
    }
    creates++;
  }
  return { creates, unchanged };
}

// ============================================================================
// Package / library upload
// ============================================================================

// Fetch the versions already in Orchestrator for a package/library id.
// NOTE: GetPackageVersions is an OData *function* — its argument goes INLINE in
// parentheses, not via $filter (a $filter call returns HTTP 400).
async function fetchExistingVersions(
  ctx: ApiContext,
  kind: "package" | "library",
  id: string,
): Promise<string[]> {
  if (kind === "package") {
    const encId = id.replace(/'/gu, "''");
    const versions = await odataList<PackageVersionEntity>(
      ctx,
      `/odata/Processes/UiPath.Server.Configuration.OData.GetPackageVersions(packageId='${encId}')`,
    );
    return versions.map((v) => v.Version);
  }
  const existing = await odataList<PackageVersionEntity>(ctx, "/odata/Libraries", {
    $filter: eqFilter("Id", id),
  });
  return existing.map((v) => v.Version);
}

async function uploadPackages(
  ctx: ApiContext,
  entries: PackageEntry[],
  mode: string,
  kind: "package" | "library",
): Promise<Array<{ name: string; version: string; action: string }>> {
  const results: Array<{ name: string; version: string; action: string }> = [];
  // Libraries are tenant-scoped (no folder header).
  const uploadCtx = kind === "library" ? { ...ctx, folderId: undefined } : ctx;
  const uploadPath =
    kind === "library"
      ? "/odata/Libraries/UiPath.Server.Configuration.OData.UploadPackage"
      : "/odata/Processes/UiPath.Server.Configuration.OData.UploadPackage";

  for (const entry of entries) {
    const files = entry.path !== undefined ? simpleGlob(entry.path, process.cwd()) : [];
    if (entry.path !== undefined && files.length === 0) {
      console.warn(`  [${kind}] No files matched pattern: ${entry.path}`);
      continue;
    }

    for (const file of files) {
      const meta = extractNupkgMetadata(file);
      if (meta === undefined) {
        console.warn(`  [${kind}] Could not parse metadata from filename: ${file}`);
        continue;
      }

      const versionList = await fetchExistingVersions(uploadCtx, kind, meta.id);

      let targetVersion = meta.version;
      let action = "upload";

      if (versionList.includes(meta.version)) {
        if (entry.autoVersion !== false) {
          const computed = computeCicdVersion(meta.version, versionList);
          if (computed.wasBumped) {
            targetVersion = computed.version;
            action = "upload_bumped";
            console.log(`  [${kind}] ${meta.id}: ${meta.version} exists, bumped to ${targetVersion}`);
          }
        } else {
          console.log(`  [${kind}] ${meta.id}@${meta.version}: already exists, skipping`);
          results.push({ name: meta.id, version: meta.version, action: "skipped" });
          continue;
        }
      }

      if (mode === "apply") {
        console.log(`  [${kind}] UPLOAD: ${meta.id}@${targetVersion}`);
        const bytes = new Uint8Array(fs.readFileSync(path.resolve(file)));
        const { body, boundary } = buildMultipartBody(bytes, `${kind}.nupkg`);
        await apiPostBinary(uploadCtx, uploadPath, body, `multipart/form-data; boundary=${boundary}`);
        results.push({ name: meta.id, version: targetVersion, action });
      } else {
        console.log(`  [${kind}] WOULD UPLOAD: ${meta.id}@${targetVersion}`);
        results.push({ name: meta.id, version: targetVersion, action: `would_${action}` });
      }
    }
  }
  return results;
}

// ============================================================================
// Process sync
// ============================================================================

async function syncProcesses(
  ctx: ApiContext,
  desired: ProcessEntry[],
  mode: string,
): Promise<NonNullable<DeploySummary["processes"]>> {
  const results: NonNullable<DeploySummary["processes"]> = [];
  for (const proc of desired) {
    const existing = await odataList<ProcessReleaseEntity>(ctx, "/odata/Releases", {
      $filter: eqFilter("ProcessKey", proc.packageId),
      $top: "1",
    });
    if (existing.length > 0) {
      results.push({ name: proc.name, action: "exists" });
      continue;
    }
    if (mode === "apply") {
      console.log(`  [process] CREATE: ${proc.name}`);
      await apiPost(ctx, "/odata/Releases", {
        Name: proc.name,
        ProcessKey: proc.packageId,
        ProcessVersion: proc.version ?? "",
        ...(proc.description !== undefined && { Description: proc.description }),
      });
      results.push({ name: proc.name, action: "create" });
    } else {
      console.log(`  [process] WOULD CREATE: ${proc.name}`);
      results.push({ name: proc.name, action: "would_create" });
    }
  }
  return results;
}

// ============================================================================
// Reporting
// ============================================================================

function printParsed(config: ParsedConfig, tenant: string): void {
  console.log("");
  console.log(`[parsed] Project:   ${config.meta.projectName ?? "(unset)"}`);
  console.log(`[parsed] Repo:      ${config.meta.repoName ?? "(unset)"}`);
  console.log(`[parsed] Folder:    ${config.meta.folderPath ?? "(tenant root)"}`);
  console.log(`[parsed] Tenant:    ${tenant}`);
  console.log(`[parsed] Assets (${config.assets.length}):`);
  for (const a of config.assets) {
    const shown = a.type === "credential" ? "<from GitHub Secrets>" : JSON.stringify(a.value);
    console.log(`           - ${a.name} (${a.type}) = ${shown}`);
  }
  console.log(`[parsed] Queues (${config.queues.length}):`);
  for (const q of config.queues) {
    console.log(
      `           - ${q.name} [retries=${q.maxRetries} auto=${q.autoRetry} unique=${q.uniqueReference} enc=${q.encrypted}]`,
    );
  }
  console.log(`[parsed] Buckets (${config.buckets.length}):`);
  for (const b of config.buckets) console.log(`           - ${b.name}`);
  console.log(
    `[parsed] Packages (${config.packages.length}), Libraries (${config.libraries.length}), Processes (${config.processes.length})`,
  );
  if (config.assets.length === 0) {
    console.warn(
      `[parsed] NOTE: no assets parsed for tenant "${tenant}". ` +
        `Check that a "${tenant} Assets" tab exists in Config.xlsx (spacing/hyphens are tolerated, but the tenant word must match).`,
    );
  }
  console.log("");
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const validateOnly = process.argv.includes("--validate");

  const tenant = requiredEnv("TENANT");
  const configPath = process.env["CONFIG_XLSX_PATH"] ?? path.join("Data", "Config.xlsx");

  console.log(`[deploy] Reading config: ${configPath}`);
  const config = await parseConfig(configPath, tenant);
  printParsed(config, tenant);

  if (validateOnly) {
    console.log("[deploy] --validate: parsed config only, no network calls made.");
    return;
  }

  const mode = process.env["DEPLOY_MODE"] ?? "apply";
  const prune = (process.env["PRUNE_ASSETS"] ?? "false").toLowerCase() === "true";
  const baseUrl = requiredEnv("ORCHESTRATOR_BASE_URL");
  // Identity lives at the host root (https://cloud.uipath.com/identity_/connect/token),
  // NOT under /{org}/{tenant}/. Derive from the origin, not by string-replacing the path.
  const identityUrl =
    process.env["ORCHESTRATOR_IDENTITY_URL"] ?? `${new URL(baseUrl).origin}/identity_/connect/token`;
  const scopes =
    process.env["ORCHESTRATOR_SCOPES"] ??
    "OR.Assets OR.Folders OR.Queues OR.Buckets OR.Execution OR.Administration";

  const prefix = `ORCHESTRATOR_${tenant.toUpperCase()}`;
  const clientId = requiredEnv(`${prefix}_CLIENT_ID`);
  const clientSecret = requiredEnv(`${prefix}_CLIENT_SECRET`);

  console.log(`[deploy] Tenant: ${tenant}  Mode: ${mode}  PruneAssets: ${prune}`);

  const ctx: ApiContext = { baseUrl, identityUrl, clientId, clientSecret, scopes };
  const summary: DeploySummary = {
    tenant,
    mode,
    project: config.meta.projectName,
    repo: config.meta.repoName,
    folderPath: config.meta.folderPath,
    errors: [],
  };

  // Step 1: ensure folder
  if (config.meta.folderPath !== undefined) {
    console.log(`[deploy] Ensuring folder: ${config.meta.folderPath}`);
    try {
      if (mode === "apply") {
        const folder = await ensureFolderPath(ctx, config.meta.folderPath);
        ctx.folderId = folder.Id;
        summary.folder = { path: config.meta.folderPath, action: "ensured" };
        console.log(`[deploy] Folder ready: ID=${folder.Id}`);
      } else {
        const existing = await folderExists(ctx, config.meta.folderPath);
        summary.folder = {
          path: config.meta.folderPath,
          action: existing !== undefined ? "exists" : "would_create",
        };
        if (existing !== undefined) ctx.folderId = existing.Id;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Folder step failed: ${msg}`);
      summary.errors.push({ step: "folders", message: msg });
    }

    // SAFETY: if a folder was configured but we couldn't resolve its Id, ABORT.
    // Otherwise every folder-scoped write below would fall back to the tenant
    // default scope — creating assets in the wrong place, or (with PRUNE_ASSETS)
    // deleting unrelated assets. Never run folder-scoped mutations unscoped.
    if (mode === "apply" && ctx.folderId === undefined) {
      const msg = `Folder "${config.meta.folderPath}" could not be resolved; aborting before any folder-scoped writes.`;
      console.error(`[deploy] ${msg}`);
      summary.errors.push({ step: "folders", message: msg });
      fs.writeFileSync("deployment-summary.json", JSON.stringify(summary, null, 2));
      process.exit(1);
    }
  }

  // Step 2: assets
  if (config.assets.length > 0) {
    console.log(`[deploy] Syncing ${config.assets.length} assets...`);
    try {
      summary.assets = await syncAssets(ctx, config.assets, mode, prune);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Asset sync failed: ${msg}`);
      summary.errors.push({ step: "assets", message: msg });
    }
  }

  // Step 3: queues
  if (config.queues.length > 0) {
    console.log(`[deploy] Syncing ${config.queues.length} queues...`);
    try {
      summary.queues = await syncQueues(ctx, config.queues, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Queue sync failed: ${msg}`);
      summary.errors.push({ step: "queues", message: msg });
    }
  }

  // Step 4: buckets
  if (config.buckets.length > 0) {
    console.log(`[deploy] Syncing ${config.buckets.length} buckets...`);
    try {
      summary.buckets = await syncBuckets(ctx, config.buckets, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Bucket sync failed: ${msg}`);
      summary.errors.push({ step: "buckets", message: msg });
    }
  }

  // Step 5: packages
  if (config.packages.length > 0) {
    console.log(`[deploy] Processing ${config.packages.length} package entries...`);
    try {
      summary.packages = await uploadPackages(ctx, config.packages, mode, "package");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Package upload failed: ${msg}`);
      summary.errors.push({ step: "packages", message: msg });
    }
  }

  // Step 6: libraries
  if (config.libraries.length > 0) {
    console.log(`[deploy] Processing ${config.libraries.length} library entries...`);
    try {
      summary.libraries = await uploadPackages(ctx, config.libraries, mode, "library");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Library upload failed: ${msg}`);
      summary.errors.push({ step: "libraries", message: msg });
    }
  }

  // Step 7: processes
  if (config.processes.length > 0) {
    console.log(`[deploy] Syncing ${config.processes.length} processes...`);
    try {
      summary.processes = await syncProcesses(ctx, config.processes, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Process sync failed: ${msg}`);
      summary.errors.push({ step: "processes", message: msg });
    }
  }

  fs.writeFileSync("deployment-summary.json", JSON.stringify(summary, null, 2));

  if (summary.errors.length > 0) {
    console.error(`[deploy] Completed with ${summary.errors.length} error(s).`);
    process.exit(1);
  }
  console.log("[deploy] Deployment completed successfully.");
}

main().catch((err) => {
  console.error("[deploy] Fatal error:", err);
  process.exit(1);
});
