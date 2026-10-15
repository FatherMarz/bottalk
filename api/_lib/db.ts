import { neon } from "@neondatabase/serverless";

type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

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
      const text = strings.reduce(
        (acc, s, i) => acc + (i > 0 ? `$${i}` : "") + s,
        "",
      );
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
      CREATE TABLE IF NOT EXISTS walls (
        id         text PRIMARY KEY,
        name       text,
        saved_at   timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen  timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS wall_notes (
        id         bigserial PRIMARY KEY,
        wall_id    text NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
        client_id  text NOT NULL,
        ct         text NOT NULL,
        deleted    boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS wall_notes_wall_client ON wall_notes (wall_id, client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS wall_notes_wall ON wall_notes (wall_id, id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS approvals (
        id text PRIMARY KEY,
        room_id text NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        decline_hash text NOT NULL,
        receipt text,
        ct text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
        expires_at timestamptz NOT NULL,
        decided_at timestamptz
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS stats (
        day            date PRIMARY KEY,
        visits         int NOT NULL DEFAULT 0,
        installs       int NOT NULL DEFAULT 0,
        calls_created  int NOT NULL DEFAULT 0,
        calls_answered int NOT NULL DEFAULT 0
      )
    `;
  })().catch((err) => {
    schemaReady = null; // let the next request retry
    throw err;
  });
  return schemaReady;
}

/** Anonymous daily counters. Explicit per-field statements because both SQL
 *  drivers are tagged templates (no identifier interpolation). Never throws:
 *  telemetry must not interrupt the room. */
export type StatField = "visits" | "installs";
export function bumpStat(field: StatField): Promise<unknown> {
  const q: Record<StatField, () => Promise<unknown>> = {
    visits: () =>
      sql`INSERT INTO stats (day, visits) VALUES (current_date, 1)
          ON CONFLICT (day) DO UPDATE SET visits = stats.visits + 1`,
    installs: () =>
      sql`INSERT INTO stats (day, installs) VALUES (current_date, 1)
          ON CONFLICT (day) DO UPDATE SET installs = stats.installs + 1`,
  };
  return q[field]().catch(() => {});
}

/** Walls: an unsaved room lingers 7 days after its last visitor; a saved
 *  project is kept until someone deletes it. Swept opportunistically on
 *  wall creation - no cron. */
export function sweepWalls(): Promise<unknown> {
  return sql`
    DELETE FROM walls
    WHERE saved_at IS NULL AND last_seen < now() - interval '7 days'
  `;
}
