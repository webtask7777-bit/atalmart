#!/usr/bin/env node
/**
 * Atalmart — Supabase observability helper.
 *
 * Fetches recent errors / slow queries / auth events for the live project
 * via the Supabase Management API + direct SQL. Useful for "why are users
 * seeing 500s?" or "which queries are slow?" investigations.
 *
 * Usage:
 *   node scripts/supabase-logs.mjs errors          # API errors last 1h
 *   node scripts/supabase-logs.mjs auth            # signups + sign-ins last 24h
 *   node scripts/supabase-logs.mjs slow            # slow Postgres queries
 *   node scripts/supabase-logs.mjs db-size         # table sizes
 *   node scripts/supabase-logs.mjs connections     # active DB connections
 *   node scripts/supabase-logs.mjs all             # snapshot of everything
 *
 * Requires either:
 *   SUPABASE_SERVICE_ROLE_KEY in .env.local (already set) for SQL queries
 *   SUPABASE_ACCESS_TOKEN (personal access token) for Logs API
 *
 * Personal Access Token: https://supabase.com/dashboard/account/tokens
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ENV_PATH = join(ROOT, ".env.local");

function loadEnv() {
  try {
    const raw = readFileSync(ENV_PATH, "utf8");
    const out = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN; // optional, for Management API

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// Project ref = subdomain of supabase.co URL
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

// ─── Tiny HTTP wrapper ────────────────────────────────────────────────
async function rest(path, init = {}) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

async function execSQL(sql) {
  // PostgREST doesn't expose raw SQL execution. We use rpc('exec_sql', ...)
  // — but that requires a custom function. Instead, query the Postgres
  // pg_stat / pg_class catalog tables via individual rpc calls. For
  // arbitrary SQL the workaround is to expose a SECURITY DEFINER function.
  //
  // For this helper we create a wrapper RPC `_metrics_exec_sql` once
  // (admin-only) that returns JSONB. If not present, fall through and
  // print an instruction.
  try {
    return await rest("/rest/v1/rpc/_metrics_exec_sql", {
      method: "POST",
      body: JSON.stringify({ p_sql: sql }),
    });
  } catch (e) {
    if (String(e).includes("Could not find the function")) {
      console.error(
        "\n[setup] One-time SQL wrapper missing. Paste this into the Supabase SQL Editor:\n",
      );
      console.error(`-- create the helper (admin-only)
create or replace function public._metrics_exec_sql(p_sql text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare result jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'admin only';
  end if;
  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || p_sql || ') t'
    into result;
  return result;
end;
$$;
grant execute on function public._metrics_exec_sql to authenticated;
`);
      process.exit(1);
    }
    throw e;
  }
}

// ─── Commands ─────────────────────────────────────────────────────────

async function showErrors() {
  if (!ACCESS_TOKEN) {
    console.log("\n[errors] Set SUPABASE_ACCESS_TOKEN in .env.local to query the Logs API.");
    console.log("Generate at: https://supabase.com/dashboard/account/tokens");
    console.log("Or check the Dashboard → Logs → API logs manually.\n");
    return;
  }
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all?sql=` +
    encodeURIComponent(
      `select id, timestamp, event_message, metadata
       from edge_logs
       where status_code >= 500
       order by timestamp desc
       limit 50`,
    );
  const r = await fetch(url, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
  const data = await r.json();
  console.log("\n=== API errors (last 50) ===");
  console.log(JSON.stringify(data, null, 2));
}

async function showSlowQueries() {
  console.log("\n=== Slow queries (top 20 by mean exec time) ===");
  console.log(
    "Requires pg_stat_statements extension. Enable at:",
    `https://supabase.com/dashboard/project/${PROJECT_REF}/database/extensions\n`,
  );
  try {
    const rows = await execSQL(`
      select
        substring(query, 1, 100) as query_snippet,
        calls,
        round(mean_exec_time::numeric, 2) as mean_ms,
        round(total_exec_time::numeric, 0) as total_ms,
        rows
      from pg_stat_statements
      where dbid = (select oid from pg_database where datname = current_database())
        and query not like '%pg_stat_statements%'
      order by mean_exec_time desc
      limit 20
    `);
    console.table(rows);
  } catch (e) {
    if (String(e).includes("relation \"pg_stat_statements\" does not exist")) {
      console.log("Extension not enabled. Enable it in the dashboard then re-run.");
    } else {
      console.error(e.message);
    }
  }
}

async function showDbSize() {
  console.log("\n=== Largest tables ===");
  const rows = await execSQL(`
    select
      schemaname || '.' || tablename as table,
      pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size,
      pg_total_relation_size(schemaname || '.' || tablename) as bytes
    from pg_tables
    where schemaname in ('public', 'auth', 'storage')
    order by bytes desc
    limit 20
  `);
  console.table(rows);
}

async function showConnections() {
  console.log("\n=== Active connections ===");
  const rows = await execSQL(`
    select
      state,
      count(*) as count,
      max(extract(epoch from (now() - state_change))::int) as oldest_seconds
    from pg_stat_activity
    where datname = current_database()
    group by 1
    order by count desc
  `);
  console.table(rows);
}

async function showAuthEvents() {
  console.log("\n=== Auth events (last 24h) ===");
  const rows = await execSQL(`
    select
      created_at,
      ip_address,
      payload->>'action' as action,
      payload->'actor_email' as user,
      payload->>'log_type' as log_type
    from auth.audit_log_entries
    where created_at > now() - interval '24 hours'
    order by created_at desc
    limit 30
  `);
  console.table(rows);
}

async function showAll() {
  await showDbSize();
  await showConnections();
  await showAuthEvents();
  await showSlowQueries();
  console.log("\n=== Stock alerts ===");
  const stockRows = await rest("/rest/v1/metrics_stock_alerts?limit=10");
  console.table(stockRows);
  console.log("\n=== Top products (30d) ===");
  const topRows = await rest("/rest/v1/metrics_top_products?limit=10");
  console.table(topRows);
}

// ─── Main ─────────────────────────────────────────────────────────────
const cmd = process.argv[2] || "all";
try {
  switch (cmd) {
    case "errors": await showErrors(); break;
    case "slow": await showSlowQueries(); break;
    case "db-size": await showDbSize(); break;
    case "connections": await showConnections(); break;
    case "auth": await showAuthEvents(); break;
    case "all": await showAll(); break;
    default:
      console.error(`Unknown command: ${cmd}. Try: errors | slow | db-size | connections | auth | all`);
      process.exit(1);
  }
} catch (e) {
  console.error("Failed:", e.message);
  process.exit(1);
}
