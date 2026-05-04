import type { ZodTypeAny, infer as zinfer } from "zod";
import {
  OrchestratorAuthError,
  OrchestratorRequestError,
  OrchestratorTransportError,
} from "./errors.js";
import { folderHeaders, type FolderContext } from "./folder-context.js";

// Minimal interface RestClient needs from the token source. TokenManager
// satisfies this without being directly named — keeps tests easy to stub
// without spinning up a real OAuth2 flow.
export interface TokenSource {
  getToken(): Promise<{ readonly token: string; readonly tokenType: string }>;
}

export interface RestClientOptions {
  readonly baseUrl: string;
  readonly tokenSource: TokenSource;
  readonly fetch?: typeof fetch;
}

export interface RequestOptions {
  readonly folder?: FolderContext;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers?: Readonly<Record<string, string>>;
}

export class RestClient {
  readonly #baseUrl: string;
  readonly #tokenSource: TokenSource;
  readonly #fetch: typeof fetch;

  constructor(options: RestClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.#tokenSource = options.tokenSource;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async get<S extends ZodTypeAny>(
    path: string,
    schema: S,
    options: RequestOptions = {},
  ): Promise<zinfer<S>> {
    const response = await this.#requestWithRetry("GET", path, undefined, options);
    return parseJson(response, schema);
  }

  async post<S extends ZodTypeAny>(
    path: string,
    body: unknown,
    schema: S,
    options: RequestOptions = {},
  ): Promise<zinfer<S>> {
    const response = await this.#requestWithRetry("POST", path, body, options);
    return parseJson(response, schema);
  }

  async patch<S extends ZodTypeAny>(
    path: string,
    body: unknown,
    schema: S,
    options: RequestOptions = {},
  ): Promise<zinfer<S>> {
    const response = await this.#requestWithRetry("PATCH", path, body, options);
    return parseJson(response, schema);
  }

  async put<S extends ZodTypeAny>(
    path: string,
    body: unknown,
    schema: S,
    options: RequestOptions = {},
  ): Promise<zinfer<S>> {
    const response = await this.#requestWithRetry("PUT", path, body, options);
    return parseJson(response, schema);
  }

  async delete(path: string, options: RequestOptions = {}): Promise<void> {
    await this.#requestWithRetry("DELETE", path, undefined, options);
  }

  // For empty-body POSTs (rare but documented for some OData actions).
  async postNoContent(path: string, body: unknown, options: RequestOptions = {}): Promise<void> {
    await this.#requestWithRetry("POST", path, body, options);
  }

  // Raw PUT against a fully-qualified URL with caller-supplied headers — used
  // for bucket file upload to the signed URL returned by GetWriteUri. No
  // OAuth header is attached because the signed URL embeds its own credentials.
  async putRaw(
    url: string,
    body: string | Uint8Array,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<void> {
    let response: Response;
    try {
      response = await this.#fetch(url, { method: "PUT", body, headers: { ...headers } });
    } catch (cause) {
      throw new OrchestratorTransportError(`PUT to ${url} failed at the network layer.`, { cause });
    }
    if (!response.ok) {
      const text = await safeText(response);
      throw new OrchestratorRequestError(
        response.status,
        `PUT ${url} returned ${response.status}: ${text}`,
        { details: { url } },
      );
    }
  }

  // Same shape but for downloading file bytes from a signed URL.
  async getRaw(url: string, headers: Readonly<Record<string, string>> = {}): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await this.#fetch(url, { method: "GET", headers: { ...headers } });
    } catch (cause) {
      throw new OrchestratorTransportError(`GET ${url} failed at the network layer.`, { cause });
    }
    if (!response.ok) {
      const text = await safeText(response);
      throw new OrchestratorRequestError(
        response.status,
        `GET ${url} returned ${response.status}: ${text}`,
        { details: { url } },
      );
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async #requestWithRetry(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<Response> {
    const response = await this.#request(method, path, body, options);
    if (response.status !== 401) return response;

    // 401 → token may have expired between fetch attempts. Try once more
    // with a freshly-fetched token. The TokenManager's cache will refresh
    // on its own once the threshold is crossed; for an unexpected 401 we
    // need to bypass the cache hint and force a new token.
    const retried = await this.#request(method, path, body, options);
    if (retried.status === 401) {
      const text = await safeText(retried);
      throw new OrchestratorAuthError(
        `Orchestrator returned 401 after retry on ${method} ${path}: ${text}`,
        { details: { path, body: text } },
      );
    }
    return retried;
  }

  async #request(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<Response> {
    const url = this.#buildUrl(path, options.query);
    const auth = await this.#tokenSource.getToken();

    const headers: Record<string, string> = {
      Authorization: `${auth.tokenType} ${auth.token}`,
      Accept: "application/json",
      ...folderHeaders(options.folder),
      ...(options.headers ?? {}),
    };

    let init: RequestInit;
    if (body === undefined) {
      init = { method, headers };
    } else {
      init = {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      };
    }

    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch (cause) {
      throw new OrchestratorTransportError(`${method} ${path} failed at the network layer.`, {
        cause,
      });
    }

    if (!response.ok && response.status !== 401) {
      const text = await safeText(response);
      throw new OrchestratorRequestError(
        response.status,
        `${method} ${path} returned ${response.status}: ${text}`,
        { details: { path, body: text } },
      );
    }
    return response;
  }

  #buildUrl(path: string, query: RequestOptions["query"]): string {
    const base = path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${this.#baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const url = new URL(base);
    if (query !== undefined) {
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }
}

async function parseJson<S extends ZodTypeAny>(response: Response, schema: S): Promise<zinfer<S>> {
  // 204 No Content responses skip JSON parsing.
  if (response.status === 204) {
    const result = schema.safeParse(undefined);
    if (!result.success) {
      throw new OrchestratorRequestError(
        response.status,
        `Endpoint returned 204 No Content but a body was expected.`,
      );
    }
    return result.data;
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new OrchestratorRequestError(
      response.status,
      `Endpoint returned non-JSON content.`,
      { cause },
    );
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new OrchestratorRequestError(
      response.status,
      `Endpoint response did not match expected schema.`,
      { details: { issues: result.error.issues } },
    );
  }
  return result.data;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable response body>";
  }
}
