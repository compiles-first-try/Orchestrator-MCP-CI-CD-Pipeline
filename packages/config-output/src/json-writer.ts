import type { ResolvedConfig } from "./resolve.js";

// Stable key order so the JSON output is byte-identical between runs and
// diff-friendly under git review (Bucket → Git → reconciler reads).
export function writeConfigJson(resolved: ResolvedConfig): string {
  const payload = {
    schemaVersion: 1,
    tenant: resolved.tenant,
    settings: sortKeys(resolved.settings),
    constants: sortKeys(resolved.constants),
    assets: [...resolved.assets].sort((a, b) => a.name.localeCompare(b.name)),
    queues: [...resolved.queues].sort((a, b) => a.name.localeCompare(b.name)),
    buckets: [...resolved.buckets].sort((a, b) => a.name.localeCompare(b.name)),
    // Credentials are written WITHOUT secret values — only their definitions.
    // The reconciler resolves secrets at apply time via credential-source.
    credentials: [...resolved.credentials].sort((a, b) => a.name.localeCompare(b.name)),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function sortKeys<T>(record: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}
