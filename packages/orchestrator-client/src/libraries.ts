import { z } from "zod";
import { eqFilter, odataList } from "./odata.js";
import type { RequestOptions, RestClient } from "./rest-client.js";

export const LibraryEntity = z.object({
  Key: z.string().optional(),
  Id: z.string().optional(),
  Title: z.string().optional(),
  Version: z.string(),
  Authors: z.string().nullable().optional(),
  Description: z.string().nullable().optional(),
  IsLatestVersion: z.boolean().optional(),
  Published: z.string().optional(),
});
export type LibraryEntity = z.infer<typeof LibraryEntity>;

export class LibrariesClient {
  readonly #rest: RestClient;
  constructor(rest: RestClient) {
    this.#rest = rest;
  }

  async list(options: RequestOptions = {}): Promise<readonly LibraryEntity[]> {
    const result = await this.#rest.get("/odata/Libraries", odataList(LibraryEntity), options);
    return result.value;
  }

  async getVersions(
    libraryId: string,
    options: RequestOptions = {},
  ): Promise<readonly LibraryEntity[]> {
    const result = await this.#rest.get("/odata/Libraries", odataList(LibraryEntity), {
      ...options,
      query: { ...options.query, $filter: eqFilter("Id", libraryId) },
    });
    return result.value;
  }

  async versionExists(
    libraryId: string,
    version: string,
    options: RequestOptions = {},
  ): Promise<boolean> {
    const versions = await this.getVersions(libraryId, options);
    return versions.some((v) => v.Version === version);
  }

  async upload(
    nupkgBytes: Uint8Array,
    options: RequestOptions = {},
  ): Promise<void> {
    const boundary = `----FormBoundary${Date.now()}`;
    const header = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="library.nupkg"`,
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
      "/odata/Libraries/UiPath.Server.Configuration.OData.UploadPackage",
      body,
      `multipart/form-data; boundary=${boundary}`,
      options,
    );
  }
}
