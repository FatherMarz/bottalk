import { neon } from "@neondatabase/serverless";

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

// Prod: Neon's HTTP driver (one fetch per query, right for serverless).
// DEV_PG=1: plain TCP postgres for local verification - the Neon driver
// can't reach a localhost postgres.
function makeSql(): SqlTag {
  if (process.env.DEV_PG === "1") {
    let pool: import("pg").Pool | null = null;
    return async (strings, ...values) => {
      if (!pool) {
        const pg = await import("pg");
        const Pool = (pg.default ?? pg).Pool;
        pool = new Pool({ connectionString: process.env.DATABASE_URL });
      }
      const text = strings.reduce((acc, s, i) => acc + (i > 0 ? `$${i}` : "") + s, "");
      const res = await pool.query(text, values as unknown[]);
      return res.rows as Record<string, unknown>[];
    };
  }
  return neon(process.env.DATABASE_URL ?? "") as unknown as SqlTag;
}

export const sql = makeSql();

// Boot-style schema guard (no migrations): memoized per lambda instance, so
// the DDL round-trips are paid once per cold start, not per request.
let schemaReady: Promise<unknown> | null = null;
export function ensureSchema(): Promise<unknown> {
  schemaReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS calls (
        code        text PRIMARY KEY,
        intro       text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        answered_at timestamptz,
        ended_at    timestamptz,
        caller_seen timestamptz NOT NULL DEFAULT now(),
        callee_seen timestamptz,
        msg_count   int NOT NULL DEFAULT 0
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id         bigserial PRIMARY KEY,
        code       text NOT NULL REFERENCES calls(code) ON DELETE CASCADE,
        from_role  text NOT NULL CHECK (from_role IN ('caller','callee')),
        seq        int NOT NULL,
        body       text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS messages_code_role_seq ON messages (code, from_role, seq)`;
    await sql`CREATE INDEX IF NOT EXISTS messages_code_id ON messages (code, id)`;
  })().catch((err) => {
    schemaReady = null; // let the next request retry
    throw err;
  });
  return schemaReady;
}

/** Reap dead calls (messages follow via FK cascade). Runs opportunistically
 *  on call creation - no cron. A call may ring unanswered for 30 minutes
 *  (the human has to text the passphrase over); an ended call lingers 10
 *  minutes so the peer sees "ended" instead of a bare 404. */
export function sweepCalls(): Promise<unknown> {
  return sql`
    DELETE FROM calls
    WHERE (answered_at IS NULL AND created_at < now() - interval '30 minutes')
       OR (ended_at IS NOT NULL AND ended_at < now() - interval '10 minutes')
       OR GREATEST(caller_seen, COALESCE(callee_seen, 'epoch'::timestamptz)) < now() - interval '30 minutes'
       OR created_at < now() - interval '6 hours'
  `;
}

/** Call codes are client-derived opaque tokens - hex of an HKDF over the
 *  passphrase. The passphrase itself never reaches the server. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(code) ? code : null;
}
