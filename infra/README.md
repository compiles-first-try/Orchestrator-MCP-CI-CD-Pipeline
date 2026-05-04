# infra

Local dev orchestration. Brings up the full rpa-platform stack on a laptop:

```sh
docker compose -f infra/docker-compose.yml up -d --build
pnpm --filter @rpa-platform/db db:migrate
pnpm seed
```

Services:

| Service | Port | Purpose |
| --- | --- | --- |
| `postgres` | 5432 | Platform DB |
| `mock-orchestrator-mcp` | 4000 | Stand-in for UiPath Orchestrator's REST/OData + identity_/connect/token. Keeps state in-memory; restart to reset. |
| `mock-github-action` | 4100 | Lets `pnpm sim:commit <tenant>` trigger the API without pushing to GitHub. |
| `api` | 3000 | The Fastify platform server. |
| `slack-bot` | 3001 | The Bolt Slack app. Stub credentials from env vars; for real Slack, set `SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET`/`SLACK_APP_TOKEN`. |

Switching from the mock to a real UiPath tenant for the recorded demo:

1. `export ORCHESTRATOR_REST_BASE_URL=https://cloud.uipath.com/<org>/<tenant>/orchestrator_`
2. `docker compose up -d --build api`
3. The API picks up the new URL on restart. No code change.
