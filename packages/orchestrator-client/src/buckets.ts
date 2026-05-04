import { z } from "zod";
import { eqFilter, odataList } from "./odata.js";
import type { RequestOptions, RestClient } from "./rest-client.js";

// Buckets endpoint = /odata/Buckets per UiPath docs.
// VERIFY: StorageProvider enum values (Orchestrator/Amazon/Azure/AzureKeyVault/
// AmazonRoleBased/Minio/Gcp) — the docs we read on 2026-05-02 did not enumerate
// them. We accept any string here and let the caller validate via
// packages/config-schema's `STORAGE_PROVIDERS` constant.
export const BucketEntity = z.object({
  Id: z.number().int(),
  Name: z.string(),
  Description: z.string().nullable().optional(),
  Identifier: z.string().optional(),
  StorageProvider: z.string().optional(),
  ExternalName: z.string().nullable().optional(),
  StorageContainer: z.string().nullable().optional(),
  StorageParameters: z.string().nullable().optional(),
  CredentialStoreId: z.number().int().nullable().optional(),
  Password: z.string().nullable().optional(),
});
export type BucketEntity = z.infer<typeof BucketEntity>;

export interface BucketCreateInput {
  readonly Name: string;
  readonly Description?: string;
  readonly StorageProvider?: string;
  readonly ExternalName?: string;
  readonly StorageContainer?: string;
  readonly StorageParameters?: string;
  readonly CredentialStoreId?: number;
  readonly Password?: string;
}

export type BucketUpdateInput = Partial<Omit<BucketCreateInput, "Name">>;

export class BucketsClient {
  readonly #rest: RestClient;
  constructor(rest: RestClient) {
    this.#rest = rest;
  }

  async list(options: RequestOptions = {}): Promise<readonly BucketEntity[]> {
    const result = await this.#rest.get("/odata/Buckets", odataList(BucketEntity), options);
    return result.value;
  }

  async getByName(name: string, options: RequestOptions = {}): Promise<BucketEntity | undefined> {
    const result = await this.#rest.get("/odata/Buckets", odataList(BucketEntity), {
      ...options,
      query: { ...options.query, $filter: eqFilter("Name", name), $top: 1 },
    });
    return result.value[0];
  }

  async create(input: BucketCreateInput, options: RequestOptions = {}): Promise<BucketEntity> {
    return this.#rest.post("/odata/Buckets", input, BucketEntity, options);
  }

  async update(id: number, input: BucketUpdateInput, options: RequestOptions = {}): Promise<void> {
    await this.#rest.patch(`/odata/Buckets(${id})`, input, z.unknown(), options);
  }

  async delete(id: number, options: RequestOptions = {}): Promise<void> {
    await this.#rest.delete(`/odata/Buckets(${id})`, options);
  }
}
