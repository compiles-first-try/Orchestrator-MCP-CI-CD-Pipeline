#!/usr/bin/env npx tsx
//
// Self-contained UiPath Orchestrator deployment script.
// Zero monorepo dependencies — only needs Node.js 20+ and `npx tsx` to run.
//
// Reads orchestrator-manifest.json from the project root and syncs resources
// (folders, assets, queues, buckets, packages, libraries, processes) to the
// target Orchestrator tenant via REST/OData + OAuth2 client_credentials.
//

import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Types
// ============================================================================

interface ManifestAsset {
  name: string;
  type: "text" | "bool" | "integer" | "credential";
  value?: string | boolean | number;
  description?: string;
  perEnvironment?: Record<string, unknown>;
}

interface ManifestQueue {
  name: string;
  description?: string;
  maxRetries?: number;
  autoRetry?: boolean;
  uniqueReference?: boolean;
  encrypted?: boolean;
}

interface ManifestBucket {
  name: string;
  description?: string;
}

interface ManifestPackage {
  path: string;
  autoVersion?: boolean;
}

interface ManifestProcess {
  name: string;
  packageId: string;
  description?: string;
}

interface Manifest {
  project: string;
  folderPath?: string;
  assets?: ManifestAsset[];
  queues?: ManifestQueue[];
  buckets?: ManifestBucket[];
  packages?: ManifestPackage[];
  libraries?: ManifestPackage[];
  processes?: ManifestProcess[];
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

interface ProcessEntity {
  Id: number;
  ProcessKey?: string;
  Name?: string;
  [key: string]: unknown;
}

interface DeploySummary {
  tenant: string;
  mode: string;
  project: string;
  folders?: Array<{ path: string; action: string }>;
  assets?: { creates: number; updates: number; deletes: number; unchanged: number };
  queues?: { creates: number; unchanged: number };
  buckets?: { creates: number; unchanged: number };
  packages?: Array<{ name: string; version: string; action: string }>;
  libraries?: Array<{ name: string; version: string; action: string }>;
  processes?: Array<{ name: string; action: string }>;
  errors: Array<{ step: string; message: string }>;
}

// ============================================================================
// OAuth2 Token Manager
// ============================================================================

let cachedToken: { token: string; expiresAt: number } | undefined;

async function getToken(identityUrl: string, clientId: string, clientSecret: string, scopes: string): Promise<string> {
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
  // Refresh at 80% of lifetime to avoid edge-of-expiry failures
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 800,
  };
  return cachedToken.token;
}

// ============================================================================
// REST Client
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
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
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

async function apiPostBinary(ctx: ApiContext, urlPath: string, data: Uint8Array, contentType: string): Promise<void> {
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

// OData $filter helper
function eqFilter(field: string, value: string): string {
  return `${field} eq '${value.replace(/'/gu, "''")}'`;
}

// OData list helper — extract .value array from response
async function odataList<T>(ctx: ApiContext, urlPath: string, query?: Record<string, string>): Promise<T[]> {
  const result = await apiGet<{ value: T[] }>(ctx, urlPath, query);
  return result.value;
}

// ============================================================================
// CICD Version Manager
// ============================================================================

interface CicdVersionResult {
  version: string;
  wasBumped: boolean;
}

function computeCicdVersion(devVersion: string, existingVersions: readonly string[]): CicdVersionResult {
  const existingSet = new Set(existingVersions);
  if (!existingSet.has(devVersion)) {
    return { version: devVersion, wasBumped: false };
  }

  const baseVersion = devVersion.replace(/-cicd\.\d+$/u, "");
  let maxCicdNumber = 0;

  for (const v of existingVersions) {
    const match = v.match(/^(.+)-cicd\.(\d+)$/u);
    if (match !== null) {
      const base = match[1];
      const num = match[2];
      if (base === baseVersion && num !== undefined) {
        maxCicdNumber = Math.max(maxCicdNumber, parseInt(num, 10));
      }
    }
  }

  const version = `${baseVersion}-cicd.${maxCicdNumber + 1}`;
  return { version, wasBumped: true };
}

// ============================================================================
// Simple Glob (no external dependency)
// ============================================================================

function simpleGlob(pattern: string, cwd: string): string[] {
  // Handle patterns like "output/*.nupkg", "*.nupkg", "dist/**/*.nupkg"
  const parts = pattern.split("/");
  const filePattern = parts.pop() ?? "";
  const dirPath = parts.length > 0 ? path.resolve(cwd, parts.join("/")) : cwd;

  if (!fs.existsSync(dirPath)) return [];

  // Convert glob pattern to regex (handles * and **)
  const regex = new RegExp(
    "^" + filePattern.replace(/\./gu, "\\.").replace(/\*\*/gu, ".*").replace(/\*/gu, "[^/]*") + "$",
    "u",
  );

  if (parts.includes("**")) {
    return walkDir(dirPath).filter((f) => regex.test(path.basename(f)));
  }

  return fs.readdirSync(dirPath)
    .filter((f) => regex.test(f))
    .map((f) => path.join(parts.join("/"), f));
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

// ============================================================================
// NuGet Helpers
// ============================================================================

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
  const boundary = `----FormBoundary${Date.now()}`;
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
  if (val === undefined || val === "") {
    throw new Error(`Required environment variable ${name} is not set.`);
  }
  return val;
}

// ============================================================================
// Folder Operations
// ============================================================================

async function ensureFolderPath(ctx: ApiContext, folderPath: string): Promise<FolderEntity> {
  const segments = folderPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("Folder path must have at least one segment.");
  }

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

  if (lastFolder === undefined) {
    throw new Error(`Could not ensure folder path: ${folderPath}`);
  }
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
// Asset Sync
// ============================================================================

function resolvePerEnvironment(asset: ManifestAsset, tenant: string): string | boolean | number | undefined {
  if (asset.perEnvironment !== undefined && tenant in asset.perEnvironment) {
    return asset.perEnvironment[tenant] as string | boolean | number;
  }
  return asset.value;
}

function buildAssetBody(asset: ManifestAsset, value: string | boolean | number | undefined): Record<string, unknown> {
  const typeMap: Record<string, string> = { text: "Text", bool: "Bool", integer: "Integer", credential: "Credential" };
  const base: Record<string, unknown> = {
    Name: asset.name,
    ValueType: typeMap[asset.type] ?? "Text",
    ...(asset.description !== undefined && { Description: asset.description }),
  };

  switch (asset.type) {
    case "text": return { ...base, StringValue: String(value ?? "") };
    case "bool": return { ...base, BoolValue: Boolean(value) };
    case "integer": return { ...base, IntValue: Number(value ?? 0) };
    default: return base;
  }
}

function assetNeedsUpdate(
  asset: ManifestAsset,
  value: string | boolean | number | undefined,
  existing: Record<string, unknown>,
): boolean {
  if (asset.description !== undefined && asset.description !== (existing["Description"] ?? "")) return true;
  switch (asset.type) {
    case "text": return existing["StringValue"] !== String(value ?? "");
    case "bool": return existing["BoolValue"] !== Boolean(value);
    case "integer": return existing["IntValue"] !== Number(value ?? 0);
    default: return false;
  }
}

async function syncAssets(
  ctx: ApiContext,
  desired: ManifestAsset[],
  tenant: string,
  mode: string,
): Promise<DeploySummary["assets"]> {
  const current = await odataList<ODataEntity>(ctx, "/odata/Assets");
  const currentByName = new Map(current.map((a) => [a.Name, a]));
  const desiredNames = new Set(desired.map((a) => a.name));

  let creates = 0, updates = 0, deletes = 0, unchanged = 0;

  for (const asset of desired) {
    const value = resolvePerEnvironment(asset, tenant);
    const existing = currentByName.get(asset.name);
    const body = buildAssetBody(asset, value);

    if (existing === undefined) {
      if (mode === "apply") {
        console.log(`  [asset] CREATE: ${asset.name}`);
        await apiPost(ctx, "/odata/Assets", body);
      } else {
        console.log(`  [asset] WOULD CREATE: ${asset.name}`);
      }
      creates++;
    } else if (assetNeedsUpdate(asset, value, existing as Record<string, unknown>)) {
      if (mode === "apply") {
        console.log(`  [asset] UPDATE: ${asset.name}`);
        const { Name: _, ValueType: _2, ...rest } = body;
        await apiPatch(ctx, `/odata/Assets(${existing.Id})`, rest);
      } else {
        console.log(`  [asset] WOULD UPDATE: ${asset.name}`);
      }
      updates++;
    } else {
      unchanged++;
    }
  }

  for (const existing of current) {
    if ((existing as Record<string, unknown>)["ValueType"] === "Credential") continue;
    if (!desiredNames.has(existing.Name)) {
      if (mode === "apply") {
        console.log(`  [asset] DELETE: ${existing.Name}`);
        await apiDelete(ctx, `/odata/Assets(${existing.Id})`);
      } else {
        console.log(`  [asset] WOULD DELETE: ${existing.Name}`);
      }
      deletes++;
    }
  }

  return { creates, updates, deletes, unchanged };
}

// ============================================================================
// Queue Sync
// ============================================================================

async function syncQueues(ctx: ApiContext, desired: ManifestQueue[], mode: string): Promise<DeploySummary["queues"]> {
  const current = await odataList<ODataEntity>(ctx, "/odata/QueueDefinitions");
  const currentByName = new Map(current.map((q) => [q.Name, q]));

  let creates = 0, unchanged = 0;

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
        MaxNumberOfRetries: queue.maxRetries ?? 0,
        AcceptAutomaticallyRetry: queue.autoRetry ?? false,
        EnforceUniqueReference: queue.uniqueReference ?? false,
        Encrypted: queue.encrypted ?? false,
      });
    } else {
      console.log(`  [queue] WOULD CREATE: ${queue.name}`);
    }
    creates++;
  }

  return { creates, unchanged };
}

// ============================================================================
// Bucket Sync
// ============================================================================

async function syncBuckets(ctx: ApiContext, desired: ManifestBucket[], mode: string): Promise<DeploySummary["buckets"]> {
  const current = await odataList<ODataEntity>(ctx, "/odata/Buckets");
  const currentByName = new Map(current.map((b) => [b.Name, b]));

  let creates = 0, unchanged = 0;

  for (const bucket of desired) {
    if (currentByName.has(bucket.name)) {
      unchanged++;
      continue;
    }
    if (mode === "apply") {
      console.log(`  [bucket] CREATE: ${bucket.name}`);
      await apiPost(ctx, "/odata/Buckets", {
        Name: bucket.name,
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
// Package Upload
// ============================================================================

async function uploadPackages(
  ctx: ApiContext,
  entries: ManifestPackage[],
  mode: string,
): Promise<NonNullable<DeploySummary["packages"]>> {
  const results: NonNullable<DeploySummary["packages"]> = [];

  for (const entry of entries) {
    const files = simpleGlob(entry.path, process.cwd());
    if (files.length === 0) {
      console.warn(`  [package] No files matched pattern: ${entry.path}`);
      continue;
    }

    for (const file of files) {
      const meta = extractNupkgMetadata(file);
      if (meta === undefined) {
        console.warn(`  [package] Could not parse metadata from filename: ${file}`);
        continue;
      }

      const existingVersions = await odataList<PackageVersionEntity>(
        ctx,
        "/odata/Processes/UiPath.Server.Configuration.OData.GetPackageVersions",
        { $filter: eqFilter("Id", meta.id) },
      );
      const versionList = existingVersions.map((v) => v.Version);

      let targetVersion = meta.version;
      let action = "upload";

      if (versionList.includes(meta.version)) {
        if (entry.autoVersion !== false) {
          const computed = computeCicdVersion(meta.version, versionList);
          if (computed.wasBumped) {
            targetVersion = computed.version;
            action = "upload_bumped";
            console.log(`  [package] ${meta.id}: version ${meta.version} exists, bumped to ${targetVersion}`);
          }
        } else {
          console.log(`  [package] ${meta.id}@${meta.version}: already exists, skipping`);
          results.push({ name: meta.id, version: meta.version, action: "skipped" });
          continue;
        }
      }

      if (mode === "apply") {
        console.log(`  [package] UPLOAD: ${meta.id}@${targetVersion}`);
        const bytes = new Uint8Array(fs.readFileSync(path.resolve(file)));
        const { body, boundary } = buildMultipartBody(bytes, "package.nupkg");
        await apiPostBinary(ctx, "/odata/Processes/UiPath.Server.Configuration.OData.UploadPackage", body, `multipart/form-data; boundary=${boundary}`);
        results.push({ name: meta.id, version: targetVersion, action });
      } else {
        console.log(`  [package] WOULD UPLOAD: ${meta.id}@${targetVersion}`);
        results.push({ name: meta.id, version: targetVersion, action: `would_${action}` });
      }
    }
  }

  return results;
}

// ============================================================================
// Library Upload
// ============================================================================

async function uploadLibraries(
  ctx: ApiContext,
  entries: ManifestPackage[],
  mode: string,
): Promise<NonNullable<DeploySummary["libraries"]>> {
  const results: NonNullable<DeploySummary["libraries"]> = [];
  // Libraries are tenant-scoped, not folder-scoped
  const libCtx = { ...ctx, folderId: undefined };

  for (const entry of entries) {
    const files = simpleGlob(entry.path, process.cwd());
    if (files.length === 0) {
      console.warn(`  [library] No files matched pattern: ${entry.path}`);
      continue;
    }

    for (const file of files) {
      const meta = extractNupkgMetadata(file);
      if (meta === undefined) {
        console.warn(`  [library] Could not parse metadata from filename: ${file}`);
        continue;
      }

      const existing = await odataList<PackageVersionEntity>(libCtx, "/odata/Libraries", {
        $filter: eqFilter("Id", meta.id),
      });
      const versionList = existing.map((v) => v.Version);

      let targetVersion = meta.version;
      let action = "upload";

      if (versionList.includes(meta.version)) {
        if (entry.autoVersion !== false) {
          const computed = computeCicdVersion(meta.version, versionList);
          if (computed.wasBumped) {
            targetVersion = computed.version;
            action = "upload_bumped";
            console.log(`  [library] ${meta.id}: version ${meta.version} exists, bumped to ${targetVersion}`);
          }
        } else {
          console.log(`  [library] ${meta.id}@${meta.version}: already exists, skipping`);
          results.push({ name: meta.id, version: meta.version, action: "skipped" });
          continue;
        }
      }

      if (mode === "apply") {
        console.log(`  [library] UPLOAD: ${meta.id}@${targetVersion}`);
        const bytes = new Uint8Array(fs.readFileSync(path.resolve(file)));
        const { body, boundary } = buildMultipartBody(bytes, "library.nupkg");
        await apiPostBinary(libCtx, "/odata/Libraries/UiPath.Server.Configuration.OData.UploadPackage", body, `multipart/form-data; boundary=${boundary}`);
        results.push({ name: meta.id, version: targetVersion, action });
      } else {
        console.log(`  [library] WOULD UPLOAD: ${meta.id}@${targetVersion}`);
        results.push({ name: meta.id, version: targetVersion, action: `would_${action}` });
      }
    }
  }

  return results;
}

// ============================================================================
// Process Sync
// ============================================================================

async function syncProcesses(
  ctx: ApiContext,
  desired: ManifestProcess[],
  mode: string,
): Promise<NonNullable<DeploySummary["processes"]>> {
  const results: NonNullable<DeploySummary["processes"]> = [];

  for (const proc of desired) {
    const existing = await odataList<ProcessEntity>(ctx, "/odata/Releases", {
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
        ProcessVersion: "",
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
// Main
// ============================================================================

async function main(): Promise<void> {
  const manifestPath = path.resolve("orchestrator-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("No orchestrator-manifest.json found in project root.");
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  const tenant = requiredEnv("TENANT");
  const mode = process.env["DEPLOY_MODE"] ?? "apply";
  const baseUrl = requiredEnv("ORCHESTRATOR_BASE_URL");
  const identityUrl =
    process.env["ORCHESTRATOR_IDENTITY_URL"] ??
    baseUrl.replace(/\/orchestrator_?\/?$/u, "/identity_/connect/token");
  const scopes =
    process.env["ORCHESTRATOR_SCOPES"] ?? "OR.Assets OR.Folders OR.Queues OR.Buckets OR.Execution OR.Administration";

  const prefix = `ORCHESTRATOR_${tenant.toUpperCase()}`;
  const clientId = requiredEnv(`${prefix}_CLIENT_ID`);
  const clientSecret = requiredEnv(`${prefix}_CLIENT_SECRET`);

  console.log(`[deploy] Project: ${manifest.project}`);
  console.log(`[deploy] Tenant: ${tenant}`);
  console.log(`[deploy] Mode: ${mode}`);

  const ctx: ApiContext = { baseUrl, identityUrl, clientId, clientSecret, scopes };

  const summary: DeploySummary = {
    tenant,
    mode,
    project: manifest.project,
    errors: [],
  };

  // Step 1: Ensure folder structure
  if (manifest.folderPath !== undefined) {
    console.log(`[deploy] Ensuring folder path: ${manifest.folderPath}`);
    if (mode === "apply") {
      try {
        const folder = await ensureFolderPath(ctx, manifest.folderPath);
        ctx.folderId = folder.Id;
        summary.folders = [{ path: manifest.folderPath, action: "ensured" }];
        console.log(`[deploy] Folder ready: ID=${folder.Id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[deploy] Failed to ensure folder: ${msg}`);
        summary.errors.push({ step: "folders", message: msg });
      }
    } else {
      const existing = await folderExists(ctx, manifest.folderPath);
      summary.folders = [{ path: manifest.folderPath, action: existing !== undefined ? "exists" : "would_create" }];
      if (existing !== undefined) ctx.folderId = existing.Id;
    }
  }

  // Step 2: Sync assets
  if (manifest.assets !== undefined && manifest.assets.length > 0) {
    console.log(`[deploy] Syncing ${manifest.assets.length} assets...`);
    try {
      summary.assets = await syncAssets(ctx, manifest.assets, tenant, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Asset sync failed: ${msg}`);
      summary.errors.push({ step: "assets", message: msg });
    }
  }

  // Step 3: Sync queues
  if (manifest.queues !== undefined && manifest.queues.length > 0) {
    console.log(`[deploy] Syncing ${manifest.queues.length} queues...`);
    try {
      summary.queues = await syncQueues(ctx, manifest.queues, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Queue sync failed: ${msg}`);
      summary.errors.push({ step: "queues", message: msg });
    }
  }

  // Step 4: Sync buckets
  if (manifest.buckets !== undefined && manifest.buckets.length > 0) {
    console.log(`[deploy] Syncing ${manifest.buckets.length} buckets...`);
    try {
      summary.buckets = await syncBuckets(ctx, manifest.buckets, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Bucket sync failed: ${msg}`);
      summary.errors.push({ step: "buckets", message: msg });
    }
  }

  // Step 5: Upload packages
  if (manifest.packages !== undefined && manifest.packages.length > 0) {
    console.log(`[deploy] Processing ${manifest.packages.length} package entries...`);
    try {
      summary.packages = await uploadPackages(ctx, manifest.packages, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Package upload failed: ${msg}`);
      summary.errors.push({ step: "packages", message: msg });
    }
  }

  // Step 6: Upload libraries
  if (manifest.libraries !== undefined && manifest.libraries.length > 0) {
    console.log(`[deploy] Processing ${manifest.libraries.length} library entries...`);
    try {
      summary.libraries = await uploadLibraries(ctx, manifest.libraries, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Library upload failed: ${msg}`);
      summary.errors.push({ step: "libraries", message: msg });
    }
  }

  // Step 7: Sync processes
  if (manifest.processes !== undefined && manifest.processes.length > 0) {
    console.log(`[deploy] Syncing ${manifest.processes.length} processes...`);
    try {
      summary.processes = await syncProcesses(ctx, manifest.processes, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[deploy] Process sync failed: ${msg}`);
      summary.errors.push({ step: "processes", message: msg });
    }
  }

  // Write summary
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
