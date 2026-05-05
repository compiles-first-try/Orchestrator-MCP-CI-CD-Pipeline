# Handoff prompt — paste into a new Claude Code session

The block below is self-contained — paste it verbatim as the first message
of a new chat to continue testing.

---

```
We are mid-testing the rpa-platform on my Windows machine.

Repo:    D:\Projects\Orchestrator-Slack-CI-CD  (the rpa-platform monorepo)
Branch:  claude/add-claude-documentation-LwYFS
Remote:  https://github.com/compiles-first-try/Orchestrator-MCP-CI-CD-Pipeline.git

Before doing ANYTHING, read these in order:
  1. memory/MEMORY.md (full index of project memories)
  2. memory/session_2026_05_04_state.md (most recent state — picks up where the last session ended)
  3. CLAUDE.md (project guardrails)
  4. docs/QUICKSTART.md (the testing walkthrough — I'm at Step 12)

I have:
  - Successfully bootstrapped the GitHub template repo at compiles-first-try/reframework-base-template (4 branches, dev as default).
  - Stood up the docker-compose stack (postgres, mocks, api, slack-bot) on host port 5433 for postgres.
  - Migrated + seeded the database (3 roles, 2 framework releases).
  - Connected the Slack bot to my workspace "Ideal Lab" — `/rpa help` works in my test channel.

I have NOT yet:
  - Run `/rpa new` to provision my first project repo (Step 12).
  - Run `/rpa tenant connect` to wire my real Orchestrator dev tenant (Step 13).
  - Driven any real reconcile against my Orchestrator (Step 15+).

Resume at QUICKSTART Step 12. If the docker stack is down, bring it back with:
    docker compose -f infra/docker-compose.yml up -d

Behaviour I want from you (carried over from the previous session):
  - Default to running diagnostic / verification commands yourself via the Bash tool. Don't ask me to run things you can run.
  - Ask only for destructive actions, anything that exposes secrets, or anything that pushes/PRs.
  - Be honest when you ship something pragmatic — flag the trade-off explicitly so I can push back BEFORE you ship rather than after.

Known unfinished work the previous session left:
  - `/rpa list` and `/rpa info` are not implemented (help text now footnotes them).
  - `pnpm sim:commit` posts empty config payloads — fine for smoke-testing the wire, but the "edit a config file → see Orchestrator change" loop needs either a GitHub Action workflow added to project repos OR sim:commit updated to read configs from the project repo's git tree.
  - Local commits since `cb8e172` (the last push) include real bug fixes — the previous session asked me to commit + push them. Confirm with me and do it.

Your first move: read those files, then check the docker stack status, then tell me you're ready and what you understand about where we are.
```

---

## Notes for the operator (you, not the new Claude session)

- You don't strictly NEED to paste this prompt. The new Claude session will read `MEMORY.md` and `session_2026_05_04_state.md` automatically when prompted by anything that touches the project. But pasting this verbatim is faster and more deterministic — it tells the new session what page you're on so it doesn't need to infer.
- If you want the new session to skip ahead to a specific step (e.g. "skip to Step 14, I already did 12 and 13"), just edit the "Resume at" line before pasting.
- The previous session's git commits live at `cb8e172` on origin. Local-only edits since then (the docker-compose port + env_file fixes, seed.ts rewrite, init-template-repo shell-fix, root package.json updates, slack-bot help-text fix) are summarised in `memory/session_2026_05_04_state.md`. The new session should commit + push these on your say-so.
