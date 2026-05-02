# Cursor configuration

## `mcp.json` — Supabase MCP server

This config makes the Supabase MCP server available to any Cursor agent
(local IDE, Background Agent, Cloud Agent) that opens this repo.

**Project:** `qbvkisrazmipmwlejqtf` (Saul LeadGen production).
**Mode:** `--read-only` — agents can run `SELECT` queries but not
`INSERT/UPDATE/DELETE`. This is the safe default for a multi-tenant prod
project. If you need write access for a migration or one-off seed, do it
through the Supabase SQL editor or via a script that uses the service
role key (see `scripts/seed_outreach_templates.ts` for the pattern).

## Setup (one-time per developer / per agent environment)

The MCP server expects `SUPABASE_ACCESS_TOKEN` in env. This is **not** the
service role key — it's a Personal Access Token from your Supabase
account, used only by the MCP server to scope operations to the project
ref above.

### Local Cursor desktop

1. Generate a PAT at <https://supabase.com/dashboard/account/tokens>.
2. In Cursor, `Cmd+,` → search "MCP" → set `SUPABASE_ACCESS_TOKEN` in the
   environment variables panel for the Supabase server, OR add it to
   your shell's `~/.zshrc` / `~/.bashrc` so all child processes inherit
   it.
3. Restart Cursor. The Supabase tools should appear in the agent
   toolbox.

### Cloud Agents

1. Generate a PAT at <https://supabase.com/dashboard/account/tokens>.
2. In <https://cursor.com/dashboard/cloud-agents>, add a new secret:
   - Key: `SUPABASE_ACCESS_TOKEN`
   - Value: your PAT
   - Tick "Redacted" so it's stripped from tool-call outputs.
3. Start a new cloud agent run. It will boot with the Supabase MCP
   server registered and authenticated.

## Why MCP instead of just curl-ing the REST API

The MCP server exposes a structured tool surface (e.g. `list_tables`,
`execute_sql`, `search_docs`) that the agent can introspect. That means
agents can ask "what tables exist?" and "what columns does `leads`
have?" without me having to memorize the schema or paste it into every
prompt. It also means future schema changes show up automatically.
