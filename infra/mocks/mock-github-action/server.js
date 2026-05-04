// Stand-in for the GitHub Action that calls the rpa-platform API on a push.
// Used by `pnpm sim:commit <tenant>` to exercise the end-to-end flow without
// pushing to a real repo. Posts to /reconcile/dry-run on /sim-commit.
import { createServer } from "node:http";
import { URL } from "node:url";

const PORT = Number.parseInt(process.env.PORT ?? "4100", 10);
const API_BASE = process.env.API_BASE_URL ?? "http://api:3000";

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (req.method === "POST" && url.pathname === "/sim-commit") {
    const tenant = url.searchParams.get("tenant") ?? "dev";
    const project = url.searchParams.get("project") ?? "demo-bot";
    try {
      const response = await fetch(`${API_BASE}/reconcile/dry-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerEmail: "alice@example.com",
          project: { name: project },
          tenant,
          tenantStatus: "connected",
          pinnedFrameworkVersion: "2.0.0",
          bucketIdForConfig: 100,
          folderId: 1,
          configs: {
            settings: { schemaVersion: 1, settings: {} },
            constants: { schemaVersion: 1, constants: {} },
            assets: { schemaVersion: 1, assets: [] },
            queues: { schemaVersion: 1, queues: [] },
            buckets: { schemaVersion: 1, buckets: [] },
            credentials: { schemaVersion: 1, credentials: [] },
            overrides: { schemaVersion: 1, overrides: {} },
          },
        }),
      });
      const text = await response.text();
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(text);
      return;
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
      return;
    }
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`mock-github-action listening on :${PORT}, API_BASE=${API_BASE}`);
});
