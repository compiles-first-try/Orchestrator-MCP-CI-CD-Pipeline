import { z } from "zod";
import { eqFilter, odataList } from "./odata.js";
import type { RequestOptions, RestClient } from "./rest-client.js";

// QueueDefinitions endpoint = /odata/QueueDefinitions per UiPath docs.
// VERIFY: SpecificDataJsonSchema / OutputDataJsonSchema / AnalyticsDataJsonSchema
// are stringified JSON in the wire format on most UiPath docs revisions; if
// a future Cloud release returns them as objects, switch to z.union with
// z.string() and z.record().
export const QueueDefinitionEntity = z.object({
  Id: z.number().int(),
  Name: z.string(),
  Description: z.string().nullable().optional(),
  AcceptAutomaticallyRetry: z.boolean().optional(),
  MaxNumberOfRetries: z.number().int().nullable().optional(),
  EnforceUniqueReference: z.boolean().optional(),
  Encrypted: z.boolean().optional(),
  SpecificDataJsonSchema: z.string().nullable().optional(),
  OutputDataJsonSchema: z.string().nullable().optional(),
  AnalyticsDataJsonSchema: z.string().nullable().optional(),
});
export type QueueDefinitionEntity = z.infer<typeof QueueDefinitionEntity>;

export interface QueueCreateInput {
  readonly Name: string;
  readonly Description?: string;
  readonly AcceptAutomaticallyRetry?: boolean;
  readonly MaxNumberOfRetries?: number;
  readonly EnforceUniqueReference?: boolean;
  readonly Encrypted?: boolean;
  readonly SpecificDataJsonSchema?: string;
  readonly OutputDataJsonSchema?: string;
  readonly AnalyticsDataJsonSchema?: string;
}

export type QueueUpdateInput = Partial<Omit<QueueCreateInput, "Name">>;

export class QueuesClient {
  readonly #rest: RestClient;
  constructor(rest: RestClient) {
    this.#rest = rest;
  }

  async list(options: RequestOptions = {}): Promise<readonly QueueDefinitionEntity[]> {
    const result = await this.#rest.get(
      "/odata/QueueDefinitions",
      odataList(QueueDefinitionEntity),
      options,
    );
    return result.value;
  }

  async getByName(
    name: string,
    options: RequestOptions = {},
  ): Promise<QueueDefinitionEntity | undefined> {
    const result = await this.#rest.get("/odata/QueueDefinitions", odataList(QueueDefinitionEntity), {
      ...options,
      query: { ...options.query, $filter: eqFilter("Name", name), $top: 1 },
    });
    return result.value[0];
  }

  async create(input: QueueCreateInput, options: RequestOptions = {}): Promise<QueueDefinitionEntity> {
    return this.#rest.post("/odata/QueueDefinitions", input, QueueDefinitionEntity, options);
  }

  async update(id: number, input: QueueUpdateInput, options: RequestOptions = {}): Promise<void> {
    await this.#rest.patch(`/odata/QueueDefinitions(${id})`, input, z.unknown(), options);
  }

  async delete(id: number, options: RequestOptions = {}): Promise<void> {
    await this.#rest.delete(`/odata/QueueDefinitions(${id})`, options);
  }
}
