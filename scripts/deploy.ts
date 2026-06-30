import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import {
  OrchestratorClient,
  computeCicdVersion,
  type AssetCreateInput,
  type FolderEntity,
} from "@rpa-platform/orchestrator-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  errors?: Array<{ step: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const TENANT = requiredEnv("TENANT");
const DEPLOY_MODE = process.env["DEPLOY_MODE"] ?? "apply";

const BASE_URL = requiredEnv("ORCHESTRATOR_BASE_URL");
const IDENTITY_URL =
  process.env["ORCHESTRATOR_IDENTITY_URL"] ??
  BASE_URL.replace(/\/orchestrator_?\/?$/u, "/identity_/connect/token");
const SCOPES =
  process.env["ORCHESTRATOR_SCOPES"] ?? "OR.Assets OR.Folders OR.Queues OR.Buckets OR.Execution OR.Administration";

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (val === undefined || val === "") {
    throw new Error(`Required environment variable ${name} is not set.`);
  }
  return val;
}

function tenantCredentials(): { clientId: string; clientSecret: string } {
  const prefix = `ORCHESTRATOR_${TENANT.toUpperCase()}`;
  return {
    clientId: requiredEnv(`${prefix}_CLIENT_ID`),
    clientSecret: requiredEnv(`${prefix}_CLIENT_SECRET`),
  };
}

// ---------------------------------------------------------------------------
// NuGet helpers
// ---------------------------------------------------------------------------

function extractNupkgMetadata(
  filePath: string,
): { id: string; version: string } | undefined {
  const basename = path.basename(filePath, ".nupkg");
  const match = basename.match(/^(.+?)\.(\d+\.\d+\.\d+.*)$/u);
  if (match === null) return undefined;
  return { id: match[1], version: match[2] };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const manifestPath = path.resolve("orchestrator-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("No orchestrator-manifest.json found in project root.");
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`[deploy] Project: ${manifest.project}`);
  console.log(`[deploy] Tenant: ${TENANT}`);
  console.log(`[deploy] Mode: ${DEPLOY_MODE}`);

  const creds = tenantCredentials();
  const client = new OrchestratorClient({
    baseUrl: BASE_URL,
    tenantConfig: {
      identityTokenUrl: IDENTITY_URL,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      scopes: SCOPES.split(/\s+/u),
    },
  });

  const summary: DeploySummary = {
    tenant: TENANT,
    mode: DEPLOY_MODE,
    project: manifest.project,
    errors: [],
  };

  let folder: FolderEntity | undefined;

  // Step 1: Ensure folder structure exists
  if (manifest.folderPath !== undefined) {
    console.log(`[deploy] Ensuring folder path: ${manifest.folderPath}`);
    if (DEPLOY_MODE === "apply") {
      try {
        folder = await client.folders.ensurePath(manifest.folderPath);
        summary.folders = [{ path: manifest.folderPath, action: "ensured" }];
        console.log(`[deploy] Folder ready: ID=${folder.Id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[deploy] Failed to ensure folder: ${msg}`);
        summary.errors!.push({ step: "folders", message: msg });
      }
    } else {
      const existing = await client.folders.getByFullyQualifiedName(manifest.folderPath);
      summary.folders = [{
        path: manifest.folderPath,
        action: existing !== undefined ? "exists" : "would_create",
      }];
      folder = existing;
    }
  }

  const folderCtx = folder !== undefined ? { folderId: folder.Id } : undefined;

  // Step 2: Sync assets
  if (manifest.assets !== undefined && manifest.assets.length > 0) {
    console.log(`[deploy] Syncing ${manifest.assets.length} assets...`);
    summary.assets = await syncAssets(client, manifest.assets, folderCtx);
  }

  // Step 3: Sync queues
  if (manifest.queues !== undefined && manifest.queues.length > 0) {
    console.log(`[deploy] Syncing ${manifest.queues.length} queues...`);
    summary.queues = await syncQueues(client, manifest.queues, folderCtx);
  }

  // Step 4: Sync buckets
  if (manifest.buckets !== undefined && manifest.buckets.length > 0) {
    console.log(`[deploy] Syncing ${manifest.buckets.length} buckets...`);
    summary.buckets = await syncBuckets(client, manifest.buckets, folderCtx);
  }

  // Step 5: Upload packages
  if (manifest.packages !== undefined && manifest.packages.length > 0) {
    console.log(`[deploy] Processing ${manifest.packages.length} package entries...`);
    summary.packages = await uploadPackages(client, manifest.packages, folderCtx);
  }

  // Step 6: Upload libraries
  if (manifest.libraries !== undefined && manifest.libraries.length > 0) {
    console.log(`[deploy] Processing ${manifest.libraries.length} library entries...`);
    summary.libraries = await uploadLibraries(client, manifest.libraries);
  }

  // Step 7: Sync processes
  if (manifest.processes !== undefined && manifest.processes.length > 0) {
    console.log(`[deploy] Syncing ${manifest.processes.length} processes...`);
    summary.processes = await syncProcesses(client, manifest.processes, folderCtx);
  }

  // Write summary
  fs.writeFileSync("deployment-summary.json", JSON.stringify(summary, null, 2));

  const hasErrors = summary.errors !== undefined && summary.errors.length > 0;
  if (hasErrors) {
    console.error(`[deploy] Completed with ${summary.errors!.length} error(s).`);
    process.exit(1);
  }

  console.log("[deploy] Deployment completed successfully.");
}

// ---------------------------------------------------------------------------
// Asset sync
// ---------------------------------------------------------------------------

async function syncAssets(
  client: OrchestratorClient,
  desired: ManifestAsset[],
  folder?: { folderId: number },
): Promise<DeploySummary["assets"]> {
  const current = await client.assets.list(folder !== undefined ? { folder } : {});
  const currentByName = new Map(current.map((a) => [a.Name, a]));
  const desiredNames = new Set(desired.map((a) => a.name));

  let creates = 0;
  let updates = 0;
  let deletes = 0;
  let unchanged = 0;

  for (const asset of desired) {
    const value = resolvePerEnvironment(asset, TENANT);
    const existing = currentByName.get(asset.name);
    const input = buildAssetInput(asset, value);

    if (existing === undefined) {
      if (DEPLOY_MODE === "apply") {
        console.log(`  [asset] CREATE: ${asset.name}`);
        await client.assets.create(input, folder !== undefined ? { folder } : {});
      } else {
        console.log(`  [asset] WOULD CREATE: ${asset.name}`);
      }
      creates++;
    } else if (assetNeedsUpdate(asset, value, existing)) {
      if (DEPLOY_MODE === "apply") {
        console.log(`  [asset] UPDATE: ${asset.name}`);
        const { Name: _, ValueType: _2, ...rest } = input;
        await client.assets.update(existing.Id, rest, folder !== undefined ? { folder } : {});
      } else {
        console.log(`  [asset] WOULD UPDATE: ${asset.name}`);
      }
      updates++;
    } else {
      unchanged++;
    }
  }

  // Delete assets that are in Orchestrator but not in manifest
  for (const existing of current) {
    if (existing.ValueType === "Credential") continue;
    if (!desiredNames.has(existing.Name)) {
      if (DEPLOY_MODE === "apply") {
        console.log(`  [asset] DELETE: ${existing.Name}`);
        await client.assets.delete(existing.Id, folder !== undefined ? { folder } : {});
      } else {
        console.log(`  [asset] WOULD DELETE: ${existing.Name}`);
      }
      deletes++;
    }
  }

  return { creates, updates, deletes, unchanged };
}

function resolvePerEnvironment(
  asset: ManifestAsset,
  tenant: string,
): string | boolean | number | undefined {
  if (asset.perEnvironment !== undefined && tenant in asset.perEnvironment) {
    return asset.perEnvironment[tenant] as string | boolean | number;
  }
  return asset.value;
}

function buildAssetInput(
  asset: ManifestAsset,
  value: string | boolean | number | undefined,
): AssetCreateInput {
  const base: AssetCreateInput = {
    Name: asset.name,
    ValueType: asset.type === "text" ? "Text" : asset.type === "bool" ? "Bool" : asset.type === "integer" ? "Integer" : "Credential",
    ...(asset.description !== undefined && { Description: asset.description }),
  };

  switch (asset.type) {
    case "text":
      return { ...base, StringValue: String(value ?? "") };
    case "bool":
      return { ...base, BoolValue: Boolean(value) };
    case "integer":
      return { ...base, IntValue: Number(value ?? 0) };
    default:
      return base;
  }
}

function assetNeedsUpdate(
  asset: ManifestAsset,
  value: string | boolean | number | undefined,
  existing: { StringValue?: string | null; BoolValue?: boolean | null; IntValue?: number | null; Description?: string | null },
): boolean {
  if (asset.description !== undefined && asset.description !== (existing.Description ?? "")) {
    return true;
  }
  switch (asset.type) {
    case "text":
      return existing.StringValue !== String(value ?? "");
    case "bool":
      return existing.BoolValue !== Boolean(value);
    case "integer":
      return existing.IntValue !== Number(value ?? 0);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Queue sync
// ---------------------------------------------------------------------------

async function syncQueues(
  client: OrchestratorClient,
  desired: ManifestQueue[],
  folder?: { folderId: number },
): Promise<DeploySummary["queues"]> {
  const current = await client.queues.list(folder !== undefined ? { folder } : {});
  const currentByName = new Map(current.map((q) => [q.Name, q]));

  let creates = 0;
  let unchanged = 0;

  for (const queue of desired) {
    const existing = currentByName.get(queue.name);
    if (existing === undefined) {
      if (DEPLOY_MODE === "apply") {
        console.log(`  [queue] CREATE: ${queue.name}`);
        await client.queues.create(
          {
            Name: queue.name,
            ...(queue.description !== undefined && { Description: queue.description }),
            MaxNumberOfRetries: queue.maxRetries ?? 0,
            AcceptAutomaticallyRetry: queue.autoRetry ?? false,
            EnforceUniqueReference: queue.uniqueReference ?? false,
            Encrypted: queue.encrypted ?? false,
          },
          folder !== undefined ? { folder } : {},
        );
      } else {
        console.log(`  [queue] WOULD CREATE: ${queue.name}`);
      }
      creates++;
    } else {
      unchanged++;
    }
  }

  return { creates, unchanged };
}

// ---------------------------------------------------------------------------
// Bucket sync
// ---------------------------------------------------------------------------

async function syncBuckets(
  client: OrchestratorClient,
  desired: ManifestBucket[],
  folder?: { folderId: number },
): Promise<DeploySummary["buckets"]> {
  const current = await client.buckets.list(folder !== undefined ? { folder } : {});
  const currentByName = new Map(current.map((b) => [b.Name, b]));

  let creates = 0;
  let unchanged = 0;

  for (const bucket of desired) {
    const existing = currentByName.get(bucket.name);
    if (existing === undefined) {
      if (DEPLOY_MODE === "apply") {
        console.log(`  [bucket] CREATE: ${bucket.name}`);
        await client.buckets.create(
          {
            Name: bucket.name,
            ...(bucket.description !== undefined && { Description: bucket.description }),
          },
          folder !== undefined ? { folder } : {},
        );
      } else {
        console.log(`  [bucket] WOULD CREATE: ${bucket.name}`);
      }
      creates++;
    } else {
      unchanged++;
    }
  }

  return { creates, unchanged };
}

// ---------------------------------------------------------------------------
// Package upload
// ---------------------------------------------------------------------------

async function uploadPackages(
  client: OrchestratorClient,
  entries: ManifestPackage[],
  folder?: { folderId: number },
): Promise<DeploySummary["packages"]> {
  const results: NonNullable<DeploySummary["packages"]> = [];

  for (const entry of entries) {
    const files = await glob(entry.path, { cwd: process.cwd() });
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

      const existingVersions = await client.packages.getVersions(meta.id, folder !== undefined ? { folder } : {});
      const versionList = existingVersions.map((v) => v.Version);

      const autoVersion = entry.autoVersion !== false;
      let targetVersion = meta.version;
      let action = "upload";

      if (versionList.includes(meta.version)) {
        if (autoVersion) {
          const computed = computeCicdVersion(meta.version, versionList);
          if (computed.wasBumped) {
            targetVersion = computed.version;
            action = "upload_bumped";
            console.log(`  [package] ${meta.id}: version ${meta.version} exists, bumped to ${targetVersion}`);
          } else {
            targetVersion = computed.version;
          }
        } else {
          console.log(`  [package] ${meta.id}@${meta.version}: already exists, skipping`);
          results.push({ name: meta.id, version: meta.version, action: "skipped" });
          continue;
        }
      }

      if (DEPLOY_MODE === "apply") {
        console.log(`  [package] UPLOAD: ${meta.id}@${targetVersion}`);
        const bytes = new Uint8Array(fs.readFileSync(path.resolve(file)));
        await client.packages.upload(bytes, folder !== undefined ? { folder } : {});
        results.push({ name: meta.id, version: targetVersion, action });
      } else {
        console.log(`  [package] WOULD UPLOAD: ${meta.id}@${targetVersion}`);
        results.push({ name: meta.id, version: targetVersion, action: `would_${action}` });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Library upload
// ---------------------------------------------------------------------------

async function uploadLibraries(
  client: OrchestratorClient,
  entries: ManifestPackage[],
): Promise<DeploySummary["libraries"]> {
  const results: NonNullable<DeploySummary["libraries"]> = [];

  for (const entry of entries) {
    const files = await glob(entry.path, { cwd: process.cwd() });
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

      const exists = await client.libraries.versionExists(meta.id, meta.version);
      if (exists) {
        if (entry.autoVersion !== false) {
          const allVersions = await client.libraries.getVersions(meta.id);
          const versionList = allVersions.map((v) => v.Version);
          const computed = computeCicdVersion(meta.version, versionList);
          if (computed.wasBumped) {
            console.log(`  [library] ${meta.id}: version ${meta.version} exists, bumped to ${computed.version}`);
          }
        } else {
          console.log(`  [library] ${meta.id}@${meta.version}: already exists, skipping`);
          results.push({ name: meta.id, version: meta.version, action: "skipped" });
          continue;
        }
      }

      if (DEPLOY_MODE === "apply") {
        console.log(`  [library] UPLOAD: ${meta.id}@${meta.version}`);
        const bytes = new Uint8Array(fs.readFileSync(path.resolve(file)));
        await client.libraries.upload(bytes);
        results.push({ name: meta.id, version: meta.version, action: "upload" });
      } else {
        console.log(`  [library] WOULD UPLOAD: ${meta.id}@${meta.version}`);
        results.push({ name: meta.id, version: meta.version, action: "would_upload" });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Process sync
// ---------------------------------------------------------------------------

async function syncProcesses(
  client: OrchestratorClient,
  desired: ManifestProcess[],
  folder?: { folderId: number },
): Promise<DeploySummary["processes"]> {
  const results: NonNullable<DeploySummary["processes"]> = [];

  for (const proc of desired) {
    const existing = await client.processes.getByProcessKey(
      proc.packageId,
      folder !== undefined ? { folder } : {},
    );

    if (existing === undefined) {
      if (DEPLOY_MODE === "apply") {
        console.log(`  [process] CREATE: ${proc.name}`);
        await client.processes.create(
          {
            Name: proc.name,
            ProcessKey: proc.packageId,
            ProcessVersion: "",
            ...(proc.description !== undefined && { Description: proc.description }),
          },
          folder !== undefined ? { folder } : {},
        );
      } else {
        console.log(`  [process] WOULD CREATE: ${proc.name}`);
      }
      results.push({ name: proc.name, action: DEPLOY_MODE === "apply" ? "create" : "would_create" });
    } else {
      results.push({ name: proc.name, action: "exists" });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("[deploy] Fatal error:", err);
  process.exit(1);
});
