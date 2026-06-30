import { z } from "zod";
import { eqFilter, odataList } from "./odata.js";
import type { RequestOptions, RestClient } from "./rest-client.js";

export const PackageEntity = z.object({
  Key: z.string().optional(),
  Id: z.string().optional(),
  Title: z.string().optional(),
  Version: z.string(),
  IsLatestVersion: z.boolean().optional(),
  IsPrerelease: z.boolean().optional(),
  Authors: z.string().nullable().optional(),
  Description: z.string().nullable().optional(),
  Published: z.string().optional(),
});
export type PackageEntity = z.infer<typeof PackageEntity>;

export const ProcessEntity = z.object({
  Id: z.number().int(),
  Key: z.string().optional(),
  Name: z.string().optional(),
  ProcessKey: z.string().optional(),
  ProcessVersion: z.string().optional(),
  Description: z.string().nullable().optional(),
  EnvironmentId: z.number().int().nullable().optional(),
  EntryPointId: z.number().int().nullable().optional(),
  InputArguments: z.string().nullable().optional(),
});
export type ProcessEntity = z.infer<typeof ProcessEntity>;

export interface ProcessCreateInput {
  readonly Name: string;
  readonly ProcessKey: string;
  readonly ProcessVersion: string;
  readonly Description?: string;
  readonly EnvironmentId?: number;
  readonly EntryPointId?: number;
  readonly InputArguments?: string;
}

export type ProcessUpdateInput = Partial<Omit<ProcessCreateInput, "Name" | "ProcessKey">>;

export class PackagesClient {
  readonly #rest: RestClient;
  constructor(rest: RestClient) {
    this.#rest = rest;
  }

  async list(options: RequestOptions = {}): Promise<readonly PackageEntity[]> {
    const result = await this.#rest.get(
      "/odata/Processes/UiPath.Server.Configuration.OData.GetPackageVersions",
      odataList(PackageEntity),
      options,
    );
    return result.value;
  }

  async getVersions(
    packageId: string,
    options: RequestOptions = {},
  ): Promise<readonly PackageEntity[]> {
    const result = await this.#rest.get(
      "/odata/Processes/UiPath.Server.Configuration.OData.GetPackageVersions",
      odataList(PackageEntity),
      {
        ...options,
        query: {
          ...options.query,
          $filter: eqFilter("Id", packageId),
        },
      },
    );
    return result.value;
  }

  async versionExists(
    packageId: string,
    version: string,
    options: RequestOptions = {},
  ): Promise<boolean> {
    const versions = await this.getVersions(packageId, options);
    return versions.some((v) => v.Version === version);
  }

  async upload(
    nupkgBytes: Uint8Array,
    options: RequestOptions = {},
  ): Promise<void> {
    const boundary = `----FormBoundary${Date.now()}`;
    const header = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="package.nupkg"`,
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

    await this.#rest.postBinary(
      "/odata/Processes/UiPath.Server.Configuration.OData.UploadPackage",
      body,
      `multipart/form-data; boundary=${boundary}`,
      options,
    );
  }
}

export class ProcessesClient {
  readonly #rest: RestClient;
  constructor(rest: RestClient) {
    this.#rest = rest;
  }

  async list(options: RequestOptions = {}): Promise<readonly ProcessEntity[]> {
    const result = await this.#rest.get("/odata/Releases", odataList(ProcessEntity), options);
    return result.value;
  }

  async getByProcessKey(
    processKey: string,
    options: RequestOptions = {},
  ): Promise<ProcessEntity | undefined> {
    const result = await this.#rest.get("/odata/Releases", odataList(ProcessEntity), {
      ...options,
      query: { ...options.query, $filter: eqFilter("ProcessKey", processKey), $top: 1 },
    });
    return result.value[0];
  }

  async create(input: ProcessCreateInput, options: RequestOptions = {}): Promise<ProcessEntity> {
    return this.#rest.post("/odata/Releases", input, ProcessEntity, options);
  }

  async update(
    id: number,
    input: ProcessUpdateInput,
    options: RequestOptions = {},
  ): Promise<void> {
    await this.#rest.patch(`/odata/Releases(${id})`, input, z.unknown(), options);
  }

  async delete(id: number, options: RequestOptions = {}): Promise<void> {
    await this.#rest.delete(`/odata/Releases(${id})`, options);
  }
}
