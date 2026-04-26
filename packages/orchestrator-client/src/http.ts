import { OrchestratorApiError, OrchestratorTransportError } from "./errors.js";
import type { FetchFn, TokenManager } from "./token-manager.js";

export interface OrchestratorHttpConfig {
  readonly baseUrl: string;
  readonly tokenManager: TokenManager;
  readonly fetch?: FetchFn;
  readonly folderId?: string;
}

export interface RequestOptions {
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly folderId?: string;
}

export interface ODataCollection<T> {
  readonly "@odata.context"?: string;
  readonly "@odata.count"?: number;
  readonly value: readonly T[];
}

export class OrchestratorHttp {
  private readonly baseUrl: string;
  private readonly tokenManager: TokenManager;
  private readonly fetchFn: FetchFn;
  private readonly defaultFolderId: string | undefined;

  constructor(config: OrchestratorHttpConfig) {
    this.baseUrl = stripTrailingSlash(config.baseUrl);
    this.tokenManager = config.tokenManager;
    this.fetchFn = config.fetch ?? globalThis.fetch;
    this.defaultFolderId = config.folderId;
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  async post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  async put<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  async delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<T> {
    const token = await this.tokenManager.getAccessToken();
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.headers ?? {}),
    };
    const folderId = options.folderId ?? this.defaultFolderId;
    if (folderId !== undefined) {
      headers["X-UIPATH-OrganizationUnitId"] = folderId;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    let response: Response;
    try {
      response = await this.fetchFn(url, init);
    } catch (cause) {
      throw new OrchestratorTransportError(`${method} ${path} failed before reaching the server`, {
        cause,
      });
    }
    if (response.status === 401 || response.status === 403) {
      this.tokenManager.invalidate();
    }
    if (response.ok === false) {
      const text = await safeText(response);
      throw new OrchestratorApiError(response.status, text);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (text.length === 0) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new OrchestratorTransportError(`response body was not valid JSON`, { cause });
    }
  }

  private buildUrl(
    path: string,
    query: Readonly<Record<string, string | number | boolean>> | undefined,
  ): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(this.baseUrl + normalized);
    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
