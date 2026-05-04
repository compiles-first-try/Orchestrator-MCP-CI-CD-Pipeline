import type { Asset, Bucket, Credential, Queue } from "@rpa-platform/config-schema";
import type {
  AssetEntity,
  BucketEntity,
  QueueDefinitionEntity,
} from "@rpa-platform/orchestrator-client";
import type { ItemDiff } from "./types.js";

export function diffByName<TDesired extends { name: string }, TCurrent extends { Name: string }>(
  desired: readonly TDesired[],
  current: readonly TCurrent[],
  fieldsEqual: (desired: TDesired, current: TCurrent) => boolean,
): ItemDiff<TDesired, TCurrent> {
  const currentByName = new Map<string, TCurrent>();
  for (const c of current) currentByName.set(c.Name, c);

  const creates: TDesired[] = [];
  const updates: { current: TCurrent; desired: TDesired }[] = [];
  const desiredNames = new Set<string>();

  for (const d of desired) {
    desiredNames.add(d.name);
    const match = currentByName.get(d.name);
    if (match === undefined) {
      creates.push(d);
    } else if (!fieldsEqual(d, match)) {
      updates.push({ current: match, desired: d });
    }
  }

  const deletes: TCurrent[] = [];
  for (const c of current) {
    if (!desiredNames.has(c.Name)) deletes.push(c);
  }

  return { creates, updates, deletes };
}

// Per-entity equality functions. We intentionally only compare fields the
// platform manages — server-computed fields (Id, audit timestamps, etc.) are
// ignored. ASSUMPTION: an undefined override field on the desired side means
// "do not change", not "set to null". The reconciler treats those as equal
// when the current value exists.

export function assetsEqual(d: Asset, c: AssetEntity): boolean {
  if (typeNameForAsset(d) !== c.ValueType) return false;
  if (descriptionsDiffer(d.description, c.Description)) return false;
  return assetValueEquals(d, c);
}

export function queuesEqual(d: Queue, c: QueueDefinitionEntity): boolean {
  return (
    !descriptionsDiffer(d.description, c.Description) &&
    boolEquals(d.autoRetry, c.AcceptAutomaticallyRetry) &&
    numberEquals(d.maxRetries, c.MaxNumberOfRetries) &&
    boolEquals(d.uniqueReference, c.EnforceUniqueReference) &&
    boolEquals(d.encrypted, c.Encrypted)
  );
}

export function bucketsEqual(d: Bucket, c: BucketEntity): boolean {
  if (descriptionsDiffer(d.description, c.Description)) return false;
  if (d.provider !== undefined && c.StorageProvider !== undefined) {
    if (d.provider.toLowerCase() !== c.StorageProvider.toLowerCase()) return false;
  }
  if (d.externalName !== undefined && d.externalName !== c.ExternalName) return false;
  return true;
}

// Credentials are materialised as Assets of ValueType=Credential. Equality
// checks the identity fields; the secret is always re-applied on update
// because we cannot read it back from Orchestrator (write-only).
export function credentialsEqualAssetShell(d: Credential, c: AssetEntity): boolean {
  if (c.ValueType !== "Credential") return false;
  if (descriptionsDiffer(d.description, c.Description)) return false;
  if (d.username !== undefined && d.username !== c.CredentialUsername) return false;
  return true;
}

export function typeNameForAsset(asset: Asset): "Text" | "Bool" | "Integer" | "Credential" {
  switch (asset.type) {
    case "text":
      return "Text";
    case "bool":
      return "Bool";
    case "integer":
      return "Integer";
    // keyValueList is parked behind a VERIFY note; if it lands, map here.
    default:
      return "Text";
  }
}

function assetValueEquals(d: Asset, c: AssetEntity): boolean {
  switch (d.type) {
    case "text":
      return c.StringValue === d.value;
    case "bool":
      return c.BoolValue === d.value;
    case "integer":
      return c.IntValue === d.value;
    default:
      return false;
  }
}

function descriptionsDiffer(desired: string | undefined, current: string | null | undefined): boolean {
  if (desired === undefined) return false;
  return desired !== (current ?? "");
}

function boolEquals(d: boolean | undefined, c: boolean | undefined): boolean {
  if (d === undefined) return true;
  return d === c;
}

function numberEquals(d: number | undefined, c: number | null | undefined): boolean {
  if (d === undefined) return true;
  return d === c;
}
