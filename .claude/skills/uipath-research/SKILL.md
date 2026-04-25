---
name: uipath-research
description: |
  Research the current state of UiPath Orchestrator MCP server tools, OAuth2
  External Applications, REST/OData endpoints, XAML conventions, or any
  UiPath-specific behavior the rpa-platform build depends on. Use this BEFORE
  implementing any package that talks to UiPath (orchestrator-client, xaml-parser,
  config-output's Bucket writer) or when a spec assumption needs to be verified
  against UiPath's current public surface. Produces a dated, cited research note
  in docs/research/ so findings are reusable and trackable.
---

# UiPath research skill

You are doing focused, dated, cited research on UiPath's current public surface
to inform a v1 build of the `rpa-platform` system. The spec
(`Claude Code Prompt — RPA Platform Engineering System v5`) is the source of
truth for **what** to build; this skill exists to verify **what UiPath
actually exposes today** so we don't trust stale assumptions in the spec.

## Inputs

The user (or invoking session) will provide a topic. Common shapes:

- "MCP tool surface for {Assets | Queues | Buckets | Bucket files | Credentials}"
- "OAuth2 External Application — current scopes for {feature}"
- "REST/OData endpoint and schema for {operation} (REST fallback verification)"
- "XAML annotation attribute syntax in current UiPath Studio versions"
- "Bucket file upload — is there an MCP tool yet, or is REST still mandatory?"

If the topic is broader than one of these, narrow it before researching. Ask
the user to pick the one slice that unblocks the next build step.

## Research discipline

1. **Prefer official UiPath sources** in this priority order:
   - docs.uipath.com (official documentation)
   - UiPath Cloud release notes / changelog
   - github.com/UiPath (official repos and MCP server source if open)
   - UiPath Marketplace and official forum posts authored by UiPath staff
2. **Treat community sources (Stack Overflow, blog posts, forum users) as
   hints, not facts.** Cite them only to flag a question, not to answer it.
3. **Capture URLs and the date you accessed them.** Every claim in the report
   must be traceable to a cited source.
4. **Flag stale findings explicitly.** If a source predates the current build
   date by more than 6 months and covers a fast-moving area (MCP tools,
   Cloud APIs), say so.
5. **Distinguish Cloud vs. on-prem** where it matters. The spec defaults to
   UiPath Cloud's hosted MCP; on-prem differences are v2 territory.
6. **Do not invent tool names, scope names, or endpoint paths.** If you can't
   find it, say "not found" and recommend a verification approach (e.g.
   "list tools at runtime against the configured MCP URL").

## Output format

Save the report at:

    docs/research/uipath-{slugified-topic}-{YYYY-MM-DD}.md

Use this structure:

```markdown
# {Topic}

- **Verified on:** YYYY-MM-DD
- **Researcher:** Claude (uipath-research skill)
- **Build context:** {package or spec section this informs}

## TL;DR

One paragraph: what we found, what's certain, what's still open.

## Findings

### {Sub-topic 1}

Specific factual claims. Each claim cites a source inline:

- Claim. ([source title](url), accessed YYYY-MM-DD)

### {Sub-topic 2}

...

## Implications for rpa-platform

- What this means for {package-name}.
- Spec sections to reconcile (e.g. §10.5 says X; current UiPath behavior is Y).
- Things that are now blocked / unblocked.

## Open questions

- Things we couldn't verify from public sources.
- Recommended verification path (e.g. "list tools at runtime against the
  demo tenant's MCP URL and dump the result here").

## Sources

| URL | Title | Accessed | Notes |
| --- | ----- | -------- | ----- |
| ... | ...   | ...      | ...   |
```

## Reconciling with the spec

If your findings contradict the spec:

1. **Do not silently update the spec.** Per CLAUDE.md non-negotiable invariant:
   "When code and spec disagree, ask the user which is canonical; do not
   silently reconcile."
2. Surface the conflict in the "Implications" section with a clear question
   for the user.
3. Recommend whether the spec, the code, or the assumption needs to change —
   but let the user decide.

## When NOT to use this skill

- Pure TypeScript / Node / pnpm questions — those aren't UiPath-specific.
- Internal Excel schema for the legacy REFramework (that's the user's existing
  team artifact, not public).
- AWS Secrets Manager wiring (v2 — defer).
- Performance benchmarks of UiPath Cloud (out of scope for v1 build).

## After producing the report

1. `git add docs/research/uipath-*.md`
2. Tell the user the report is ready, summarize the TL;DR in 2–3 sentences,
   and call out any spec conflicts that need their decision.
3. Do not commit on your own — the report often informs the next code change,
   and committing them together gives reviewers context.
