import { OrchestratorApiError, OrchestratorTransportError } from "../errors.js";
import type { ODataCollection, OrchestratorHttp } from "../http.js";
import type { McpClientLike, McpToolMap } from "../mcp-discovery.js";
import type { FetchFn } from "../token-manager.js";
import { chooseTransport } from "../transport.js";
import { fromUiPathBucketFile, type UiPathBucketFile } from "./mappers.js";
import type { BucketFile, OperationResult, UploadBucketFileInput } from "./types.js";

interface PresignedUriResponse {
  readonly Uri: string;
  readonly Verb?: string;
  readonly Headers?: Readonly<Record<string, string>>;
  readonly RequiresAuth?: boolean;
}

export interface BucketFilesApi {
  list(
    bucketId: number,
    options?: { directory?: string; recursive?: boolean; folderId?: string },
  ): Promise<OperationResult<readonly BucketFile[]>>;
  upload(input: UploadBucketFileInput, folderId?: string): Promise<OperationResult<void>>;
  download(bucketId: number, path: string, folderId?: string): Promise<OperationResult<Uint8Array>>;
  delete(bucketId: number, path: string, folderId?: string): Promise<OperationResult<void>>;
}

export class BucketFilesAdapter implements BucketFilesApi {
  constructor(
    private readonly http: OrchestratorHttp,
    private readonly fetchFn: FetchFn,
    private readonly toolMap: McpToolMap,
    private readonly mcpClient: McpClientLike | undefined,
  ) {}

  async list(
    bucketId: number,
    options: { directory?: string; recursive?: boolean; folderId?: string } = {},
  ): Promise<OperationResult<readonly BucketFile[]>> {
    const choice = chooseTransport(this.toolMap, "bucketFiles", "list");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, {
        bucketId,
        ...(options.directory !== undefined ? { directory: options.directory } : {}),
      });
      const items = (Array.isArray(result) ? result : []).map((entity) =>
        fromUiPathBucketFile(entity as UiPathBucketFile),
      );
      return { data: items, transport: "mcp" };
    }
    const query: Record<string, string | number | boolean> = {};
    if (options.directory !== undefined) query["directory"] = options.directory;
    if (options.recursive !== undefined) query["recursive"] = options.recursive;
    const response = await this.http.get<ODataCollection<UiPathBucketFile>>(
      `/odata/Buckets(${bucketId})/UiPath.Server.Configuration.OData.GetFiles`,
      {
        query,
        ...(options.folderId !== undefined ? { folderId: options.folderId } : {}),
      },
    );
    return { data: response.value.map(fromUiPathBucketFile), transport: "rest_fallback" };
  }

  async upload(input: UploadBucketFileInput, folderId?: string): Promise<OperationResult<void>> {
    const choice = chooseTransport(this.toolMap, "bucketFiles", "upload");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      await this.callMcp(choice.toolName, {
        bucketId: input.bucketId,
        path: input.path,
        contentType: input.contentType,
        body: typeof input.body === "string" ? input.body : Array.from(input.body),
      });
      return { data: undefined, transport: "mcp" };
    }

    const presigned = await this.http.get<PresignedUriResponse>(
      `/odata/Buckets(${input.bucketId})/UiPath.Server.Configuration.OData.GetWriteUri`,
      {
        query: { path: input.path, contentType: input.contentType },
        ...(folderId !== undefined ? { folderId } : {}),
      },
    );

    const uploadHeaders: Record<string, string> = {
      "Content-Type": input.contentType,
      ...(presigned.Headers ?? {}),
    };

    const init: RequestInit = {
      method: presigned.Verb ?? "PUT",
      headers: uploadHeaders,
      body: input.body,
    };

    let response: Response;
    try {
      response = await this.fetchFn(presigned.Uri, init);
    } catch (cause) {
      throw new OrchestratorTransportError("bucket file upload failed before reaching the server", {
        cause,
      });
    }
    if (response.ok === false) {
      const text = await safeText(response);
      throw new OrchestratorApiError(response.status, text);
    }
    return { data: undefined, transport: "rest_fallback" };
  }

  async download(
    bucketId: number,
    path: string,
    folderId?: string,
  ): Promise<OperationResult<Uint8Array>> {
    const choice = chooseTransport(this.toolMap, "bucketFiles", "download");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      const result = await this.callMcp(choice.toolName, { bucketId, path });
      return { data: toUint8Array(result), transport: "mcp" };
    }

    const presigned = await this.http.get<PresignedUriResponse>(
      `/odata/Buckets(${bucketId})/UiPath.Server.Configuration.OData.GetReadUri`,
      {
        query: { path },
        ...(folderId !== undefined ? { folderId } : {}),
      },
    );

    let response: Response;
    try {
      response = await this.fetchFn(presigned.Uri, {
        method: presigned.Verb ?? "GET",
        headers: { ...(presigned.Headers ?? {}) },
      });
    } catch (cause) {
      throw new OrchestratorTransportError(
        "bucket file download failed before reaching the server",
        { cause },
      );
    }
    if (response.ok === false) {
      const text = await safeText(response);
      throw new OrchestratorApiError(response.status, text);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    return { data: buffer, transport: "rest_fallback" };
  }

  async delete(bucketId: number, path: string, folderId?: string): Promise<OperationResult<void>> {
    const choice = chooseTransport(this.toolMap, "bucketFiles", "delete");
    if (choice.transport === "mcp" && choice.toolName !== undefined) {
      await this.callMcp(choice.toolName, { bucketId, path });
      return { data: undefined, transport: "mcp" };
    }
    await this.http.delete<void>(
      `/odata/Buckets(${bucketId})/UiPath.Server.Configuration.OData.DeleteFile`,
      {
        query: { path },
        ...(folderId !== undefined ? { folderId } : {}),
      },
    );
    return { data: undefined, transport: "rest_fallback" };
  }

  private async callMcp(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.mcpClient === undefined) {
      throw new Error(`MCP tool '${name}' is in the discovery map but no MCP client is configured`);
    }
    return this.mcpClient.callTool(name, args);
  }
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return new Uint8Array(0);
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
