import { z } from "zod";
import { eqFilter, odataList } from "./odata.js";
import type { RequestOptions, RestClient } from "./rest-client.js";

export const FolderEntity = z.object({
  Id: z.number().int(),
  Key: z.string().optional(),
  DisplayName: z.string(),
  FullyQualifiedName: z.string().optional(),
  Description: z.string().nullable().optional(),
  ParentId: z.number().int().nullable().optional(),
  ParentKey: z.string().nullable().optional(),
  IsActive: z.boolean().optional(),
  FeedType: z.string().optional(),
  ProvisionType: z.string().optional(),
});
export type FolderEntity = z.infer<typeof FolderEntity>;

export interface FolderCreateInput {
  readonly DisplayName: string;
  readonly Description?: string;
  readonly ParentId?: number;
  readonly ParentKey?: string;
  readonly ProvisionType?: "Manual" | "Automatic";
  readonly FeedType?: "Shared" | "FolderHierarchy" | "Personal";
}

export type FolderUpdateInput = Partial<Omit<FolderCreateInput, "ParentId" | "ParentKey">>;

export class FoldersClient {
  readonly #rest: RestClient;
  constructor(rest: RestClient) {
    this.#rest = rest;
  }

  async list(options: RequestOptions = {}): Promise<readonly FolderEntity[]> {
    const result = await this.#rest.get("/odata/Folders", odataList(FolderEntity), options);
    return result.value;
  }

  async getByDisplayName(
    name: string,
    options: RequestOptions = {},
  ): Promise<FolderEntity | undefined> {
    const result = await this.#rest.get("/odata/Folders", odataList(FolderEntity), {
      ...options,
      query: { ...options.query, $filter: eqFilter("DisplayName", name), $top: 1 },
    });
    return result.value[0];
  }

  async getByFullyQualifiedName(
    fqn: string,
    options: RequestOptions = {},
  ): Promise<FolderEntity | undefined> {
    const result = await this.#rest.get("/odata/Folders", odataList(FolderEntity), {
      ...options,
      query: { ...options.query, $filter: eqFilter("FullyQualifiedName", fqn), $top: 1 },
    });
    return result.value[0];
  }

  async create(input: FolderCreateInput, options: RequestOptions = {}): Promise<FolderEntity> {
    return this.#rest.post("/odata/Folders", input, FolderEntity, options);
  }

  async update(id: number, input: FolderUpdateInput, options: RequestOptions = {}): Promise<void> {
    await this.#rest.patch(`/odata/Folders(${id})`, input, z.unknown(), options);
  }

  async delete(id: number, options: RequestOptions = {}): Promise<void> {
    await this.#rest.delete(`/odata/Folders(${id})`, options);
  }

  async ensurePath(
    folderPath: string,
    options: RequestOptions = {},
  ): Promise<FolderEntity> {
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
      const existing = await this.getByFullyQualifiedName(fqn, options);
      if (existing !== undefined) {
        parentId = existing.Id;
        lastFolder = existing;
        continue;
      }
      const created = await this.create(
        {
          DisplayName: segmentName,
          ...(parentId !== undefined && { ParentId: parentId }),
          ProvisionType: "Manual",
        },
        options,
      );
      parentId = created.Id;
      lastFolder = created;
    }

    if (lastFolder === undefined) {
      throw new Error(`Could not ensure folder path: ${folderPath}`);
    }
    return lastFolder;
  }
}
