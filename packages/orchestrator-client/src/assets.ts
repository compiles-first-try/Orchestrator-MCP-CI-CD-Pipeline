import { z } from "zod";
import { eqFilter, odataList } from "./odata.js";
import type { RequestOptions, RestClient } from "./rest-client.js";

// VERIFY: ValueType enum values confirmed by docs (Text(2)/Bool(3)/Integer(4)/Credential(5)).
// `WindowsCredential` and `KeyValueList` are historically supported but were
// not on the Enumerated Types doc page on 2026-05-02 — keep them out until
// confirmed against a live tenant.
export const AssetValueType = z.enum(["Text", "Bool", "Integer", "Credential"]);
export type AssetValueType = z.infer<typeof AssetValueType>;

export const AssetEntity = z.object({
  Id: z.number().int(),
  Name: z.string(),
  ValueType: AssetValueType,
  Description: z.string().nullable().optional(),
  StringValue: z.string().nullable().optional(),
  BoolValue: z.boolean().nullable().optional(),
  IntValue: z.number().int().nullable().optional(),
  CredentialUsername: z.string().nullable().optional(),
});
export type AssetEntity = z.infer<typeof AssetEntity>;

export interface AssetCreateInput {
  readonly Name: string;
  readonly ValueType: AssetValueType;
  readonly Description?: string;
  readonly StringValue?: string;
  readonly BoolValue?: boolean;
  readonly IntValue?: number;
  readonly CredentialUsername?: string;
  // Write-only field; never returned by GET. Required when ValueType=Credential.
  readonly CredentialPassword?: string;
}

export type AssetUpdateInput = Partial<Omit<AssetCreateInput, "Name" | "ValueType">>;

export class AssetsClient {
  readonly #rest: RestClient;
  constructor(rest: RestClient) {
    this.#rest = rest;
  }

  async list(options: RequestOptions = {}): Promise<readonly AssetEntity[]> {
    const result = await this.#rest.get("/odata/Assets", odataList(AssetEntity), options);
    return result.value;
  }

  async getByName(name: string, options: RequestOptions = {}): Promise<AssetEntity | undefined> {
    const result = await this.#rest.get("/odata/Assets", odataList(AssetEntity), {
      ...options,
      query: { ...options.query, $filter: eqFilter("Name", name), $top: 1 },
    });
    return result.value[0];
  }

  async create(input: AssetCreateInput, options: RequestOptions = {}): Promise<AssetEntity> {
    return this.#rest.post("/odata/Assets", input, AssetEntity, options);
  }

  async update(id: number, input: AssetUpdateInput, options: RequestOptions = {}): Promise<void> {
    await this.#rest.patch(`/odata/Assets(${id})`, input, z.unknown(), options);
  }

  async delete(id: number, options: RequestOptions = {}): Promise<void> {
    await this.#rest.delete(`/odata/Assets(${id})`, options);
  }
}
