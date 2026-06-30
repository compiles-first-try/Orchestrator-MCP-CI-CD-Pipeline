// Tiny stand-in for UiPath Orchestrator's REST/OData surface (and its
// `identity_/connect/token` endpoint). Used by docker-compose for local
// development and CI integration tests. State lives in-memory; restart the
// container to reset.
//
// This is intentionally a single-file Node http server with no external
// deps so the docker image stays minimal.
import { createServer } from "node:http";
import { URL } from "node:url";

const PORT = Number.parseInt(process.env.PORT ?? "4000", 10);

const state = {
  assets: new Map(),
  queues: new Map(),
  buckets: new Map(),
  bucketFiles: new Map(),
  users: new Map([
    [1, { Id: 1, UserName: "alice", EmailAddress: "alice@example.com", Name: "Alice", IsActive: true }],
  ]),
  rolesByUser: new Map([[1, [{ Id: 1, Name: "Administrator", DisplayName: "Administrator" }]]]),
  nextId: 100,
};

function odataList(collection) {
  return { "@odata.context": "mock-orchestrator-mcp", value: [...collection.values()] };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw === "") return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain" : "application/json",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    // OAuth2 token endpoint
    if (req.method === "POST" && url.pathname.endsWith("/identity_/connect/token")) {
      const _body = await readJson(req).catch(() => ({}));
      return send(res, 200, {
        access_token: "mock-token-" + Date.now(),
        token_type: "Bearer",
        expires_in: 3600,
        scope: "OR.Assets OR.Folders OR.Queues OR.Buckets OR.Execution OR.Administration",
      });
    }

    if (url.pathname === "/health" || url.pathname === "/healthz") {
      return send(res, 200, { ok: true });
    }

    // OData collections
    const odataMatch = /^\/odata\/(Assets|QueueDefinitions|Buckets|Users)(?:\((\d+)\))?(?:\/([\w.]+))?$/u.exec(url.pathname);
    if (odataMatch !== null) {
      const [, kind, idStr, suffix] = odataMatch;
      const id = idStr === undefined ? undefined : Number.parseInt(idStr, 10);
      const collection =
        kind === "Assets"
          ? state.assets
          : kind === "QueueDefinitions"
            ? state.queues
            : kind === "Buckets"
              ? state.buckets
              : state.users;

      if (req.method === "GET") {
        if (id === undefined) {
          return send(res, 200, odataList(collection));
        }
        const item = collection.get(id);
        if (item === undefined) return send(res, 404, "not found");
        if (kind === "Users" && url.searchParams.get("$expand") === "RolesList") {
          return send(res, 200, { ...item, RolesList: state.rolesByUser.get(id) ?? [] });
        }
        if (suffix === "UiPath.Server.Configuration.OData.GetWriteUri") {
          const path = url.searchParams.get("path") ?? "unnamed";
          return send(res, 200, {
            Uri: `http://localhost:${PORT}/mock-bucket/${id}/${encodeURIComponent(path)}`,
            Headers: {},
          });
        }
        if (suffix === "UiPath.Server.Configuration.OData.GetReadUri") {
          const path = url.searchParams.get("path") ?? "unnamed";
          return send(res, 200, {
            Uri: `http://localhost:${PORT}/mock-bucket/${id}/${encodeURIComponent(path)}`,
            Headers: {},
          });
        }
        if (suffix === "UiPath.Server.Configuration.OData.GetFiles") {
          const files = state.bucketFiles.get(id) ?? new Map();
          return send(res, 200, {
            value: [...files.entries()].map(([path, body]) => ({
              FullPath: path,
              Size: Buffer.byteLength(body),
            })),
          });
        }
        return send(res, 200, item);
      }

      if (req.method === "POST" && id === undefined) {
        const body = await readJson(req);
        const newId = state.nextId++;
        const created = { Id: newId, ...body };
        collection.set(newId, created);
        return send(res, 201, created);
      }

      if (req.method === "PATCH" && id !== undefined) {
        const body = await readJson(req);
        const existing = collection.get(id);
        if (existing === undefined) return send(res, 404, "not found");
        collection.set(id, { ...existing, ...body });
        return send(res, 204);
      }

      if (req.method === "DELETE") {
        if (suffix === "UiPath.Server.Configuration.OData.DeleteFile") {
          const path = url.searchParams.get("path") ?? "";
          const files = state.bucketFiles.get(id ?? -1);
          files?.delete(path);
          return send(res, 204);
        }
        if (id === undefined) return send(res, 400, "id required");
        collection.delete(id);
        return send(res, 204);
      }
    }

    // Bucket file storage (the signed PUT/GET targets)
    const bucketFileMatch = /^\/mock-bucket\/(\d+)\/(.+)$/u.exec(url.pathname);
    if (bucketFileMatch !== null) {
      const [, bucketIdStr, encodedPath] = bucketFileMatch;
      const bucketId = Number.parseInt(bucketIdStr, 10);
      const filePath = decodeURIComponent(encodedPath);
      let files = state.bucketFiles.get(bucketId);
      if (files === undefined) {
        files = new Map();
        state.bucketFiles.set(bucketId, files);
      }
      if (req.method === "PUT") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        files.set(filePath, Buffer.concat(chunks).toString("utf8"));
        return send(res, 201);
      }
      if (req.method === "GET") {
        const body = files.get(filePath);
        if (body === undefined) return send(res, 404, "missing");
        return send(res, 200, body);
      }
    }

    return send(res, 404, "no route");
  } catch (err) {
    return send(res, 500, { error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`mock-orchestrator-mcp listening on :${PORT}`);
});
