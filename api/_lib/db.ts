import { neon } from "@neondatabase/serverless";

type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;
let localPool: import("pg").Pool | null = null;
async function pgPool() {
  if (!localPool) {
    const pg = await import("pg");
    const Pool = (pg.default ?? pg).Pool;
    localPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return localPool;
}

// Prod: Neon's HTTP driver (one fetch per query, right for serverless).
// DEV_PG=1: plain TCP postgres for local verification - the Neon driver
// can't reach a localhost postgres.
function makeSql(): SqlTag {
  if (process.env.DEV_PG === "1") {
    return async (strings, ...values) => {
      const pool = await pgPool();
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

/** Lock first, then read capacity in a fresh READ COMMITTED statement. Notes
 * and tombstones are immutable; retrying a stable ID never repeats an action.
 * Both drivers run the same statements in one transaction. */
export async function appendWallNotes(
  id: string,
  notes: unknown[],
  limit: number,
): Promise<"ok" | "gone" | "full"> {
  const queries = [
    { text: "SELECT id FROM walls WHERE id = $1 FOR UPDATE", values: [id] },
    {
      text: `WITH incoming AS (
        SELECT client_id, ct FROM jsonb_to_recordset($2::jsonb) AS n(client_id text, ct text)
      ), fresh AS (
        SELECT * FROM incoming WHERE NOT EXISTS (
          SELECT 1 FROM wall_notes WHERE wall_id = $1 AND client_id = incoming.client_id
        )
      ), capacity AS (
        SELECT (SELECT count(*) FROM wall_notes WHERE wall_id = $1) + (SELECT count(*) FROM fresh) <= $3::int AS ok
      ), inserted AS (
        INSERT INTO wall_notes (wall_id, client_id, ct)
        SELECT $1, client_id, ct FROM fresh WHERE (SELECT ok FROM capacity)
          AND EXISTS (SELECT 1 FROM walls WHERE id = $1)
        ON CONFLICT (wall_id, client_id) DO NOTHING RETURNING id
      )
      SELECT (SELECT ok FROM capacity) AS ok, (SELECT count(*) FROM inserted) AS inserted`,
      values: [id, JSON.stringify(notes), limit],
    },
    { text: "UPDATE walls SET last_seen = now() WHERE id = $1", values: [id] },
  ];
  let results: Record<string, unknown>[][];
  if (process.env.DEV_PG === "1") {
    const client = await (await pgPool()).connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      results = [];
      for (const q of queries)
        results.push((await client.query(q.text, q.values)).rows);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else {
    const remote = neon(process.env.DATABASE_URL ?? "");
    results = await remote.transaction(
      queries.map((q) => remote.query(q.text, q.values)),
      { isolationLevel: "ReadCommitted" },
    );
  }
  if (!results[0].length) return "gone";
  return results[1][0].ok ? "ok" : "full";
}

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
