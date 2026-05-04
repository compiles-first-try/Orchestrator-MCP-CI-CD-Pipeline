import { z } from "zod";
import { odataList } from "./odata.js";
import type { RequestOptions, RestClient } from "./rest-client.js";

// Two-step bucket file upload per UiPath docs:
//   1. GET /odata/Buckets({id})/UiPath.Server.Configuration.OData.GetWriteUri
//        ?path=<path>&contentType=<mime>
//      → returns { Uri, Headers, RequiresAuth }.
//   2. PUT to the returned Uri with the file content and any required headers
//      (e.g. x-ms-blob-type for Azure).
// The PUT goes to a signed URL (S3/Azure/etc.) which embeds its own short-
// lived auth — our OAuth bearer is NOT attached.

const SignedUriResponse = z.object({
  Uri: z.string().min(1),
  // Header shape varies between Cloud revisions: sometimes a flat
  // {[name]: value} object, sometimes {Keys: [...], Values: [...]}. Capture
  // as `unknown` here and let extractStorageHeaders() handle both forms.
  Headers: z.unknown().optional(),
  RequiresAuth: z.boolean().optional(),
});

export const BucketFileEntity = z.object({
  FullPath: z.string(),
  Size: z.number().int().optional(),
  LastModified: z.string().optional(),
  ContentType: z.string().nullable().optional(),
});
export type BucketFileEntity = z.infer<typeof BucketFileEntity>;

export interface UploadOptions extends RequestOptions {
  readonly contentType?: string;
}

export class BucketFilesClient {
  readonly #rest: RestClient;
  constructor(rest: RestClient) {
    this.#rest = rest;
  }

  async upload(
    bucketId: number,
    path: string,
    content: string | Uint8Array,
    options: UploadOptions = {},
  ): Promise<void> {
    const query: Record<string, string> = { path };
    if (options.contentType !== undefined) {
      query.contentType = options.contentType;
    }
    const signed = await this.#rest.get(
      `/odata/Buckets(${bucketId})/UiPath.Server.Configuration.OData.GetWriteUri`,
      SignedUriResponse,
      { ...options, query },
    );
    const headers = extractStorageHeaders(signed.Headers);
    if (options.contentType !== undefined && headers["Content-Type"] === undefined) {
      headers["Content-Type"] = options.contentType;
    }
    await this.#rest.putRaw(signed.Uri, content, headers);
  }

  async download(bucketId: number, path: string, options: RequestOptions = {}): Promise<Uint8Array> {
    const signed = await this.#rest.get(
      `/odata/Buckets(${bucketId})/UiPath.Server.Configuration.OData.GetReadUri`,
      SignedUriResponse,
      { ...options, query: { ...options.query, path } },
    );
    const headers = extractStorageHeaders(signed.Headers);
    return this.#rest.getRaw(signed.Uri, headers);
  }

  async list(bucketId: number, options: RequestOptions = {}): Promise<readonly BucketFileEntity[]> {
    const result = await this.#rest.get(
      `/odata/Buckets(${bucketId})/UiPath.Server.Configuration.OData.GetFiles`,
      odataList(BucketFileEntity),
      options,
    );
    return result.value;
  }

  async delete(bucketId: number, path: string, options: RequestOptions = {}): Promise<void> {
    await this.#rest.delete(
      `/odata/Buckets(${bucketId})/UiPath.Server.Configuration.OData.DeleteFile`,
      { ...options, query: { ...options.query, path } },
    );
  }
}

// UiPath returns headers in two shapes depending on the Cloud revision —
// either `{Keys[], Values[]}` parallel arrays or a flat `{[name]: value}`
// record. Normalise to the flat form.
function extractStorageHeaders(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const keysCandidate = obj["Keys"];
  const valuesCandidate = obj["Values"];
  if (Array.isArray(keysCandidate) && Array.isArray(valuesCandidate)) {
    const out: Record<string, string> = {};
    for (let i = 0; i < keysCandidate.length; i++) {
      const k = keysCandidate[i];
      const v = valuesCandidate[i];
      if (typeof k === "string" && typeof v === "string") {
        out[k] = v;
      }
    }
    return out;
  }
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") flat[k] = v;
  }
  return flat;
}
