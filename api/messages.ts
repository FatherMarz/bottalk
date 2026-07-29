import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, ensureSchema, normalizeCode } from "./_lib/db.js";

/** Claude invokes the CLI intermittently (an LLM turn + relaying to the
 *  human commonly takes 10 to 60s between polls), so "peer gone" needs far
 *  more slack than p2p's 12s. Informational only - the sweep decides. */
const PEER_FRESH_MS = 120_000;

/** ~16KB of ciphertext, base64'd. A conversation message, not a file. */
const MAX_BODY_CHARS = 22_000;
const MAX_MSGS_PER_CALL = 500;
const POLL_LIMIT = 100;

type PollRow = {
  answered_at: string | null;
  ended_at: string | null;
  caller_seen: string;
  callee_seen: string | null;
  id: string | number | null;
  seq: number | null;
  from_role: string | null;
  body: string | null;
};

function parseBody(req: VercelRequest): Record<string, unknown> {
  const body = req.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    return body as Record<string, unknown>;
  }
  try {
    return JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? ""));
  } catch {
    return {};
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  // --- GET: poll the peer's messages (doubles as our liveness heartbeat) ----
  if (req.method === "GET") {
    const code = normalizeCode(req.query.code);
    const role = req.query.role === "callee" ? "callee" : "caller";
    const after = Math.max(0, Number(req.query.after) || 0);
    if (!code) return res.status(400).json({ error: "bad code" });

    // One statement per poll (the Neon HTTP driver is one fetch per query):
    // a data-modifying CTE fuses the heartbeat UPDATE with the message fetch.
    const rows = (
      role === "caller"
        ? await sql`
            WITH hb AS (
              UPDATE calls SET caller_seen = now()
              WHERE code = ${code}
              RETURNING code, answered_at, ended_at, caller_seen, callee_seen
            )
            SELECT hb.answered_at, hb.ended_at, hb.caller_seen, hb.callee_seen,
                   m.id, m.seq, m.from_role, m.body
            FROM hb LEFT JOIN messages m
              ON m.code = hb.code AND m.id > ${after} AND m.from_role <> ${role}
            ORDER BY m.id
            LIMIT ${POLL_LIMIT}
          `
        : await sql`
            WITH hb AS (
              UPDATE calls SET callee_seen = now()
              WHERE code = ${code}
              RETURNING code, answered_at, ended_at, caller_seen, callee_seen
            )
            SELECT hb.answered_at, hb.ended_at, hb.caller_seen, hb.callee_seen,
                   m.id, m.seq, m.from_role, m.body
            FROM hb LEFT JOIN messages m
              ON m.code = hb.code AND m.id > ${after} AND m.from_role <> ${role}
            ORDER BY m.id
            LIMIT ${POLL_LIMIT}
          `
    ) as PollRow[];
    if (rows.length === 0) return res.status(404).json({ error: "gone" });

    const head = rows[0];
    const peerSeen = role === "caller" ? head.callee_seen : head.caller_seen;
    const msgs = rows
      .filter((r) => r.id !== null)
      .map((r) => ({ id: Number(r.id), seq: r.seq, from: r.from_role, body: r.body }));
    return res.status(200).json({
      msgs,
      answered: head.answered_at !== null,
      ended: head.ended_at !== null,
      peerAlive: peerSeen !== null && Date.now() - new Date(peerSeen).getTime() < PEER_FRESH_MS,
    });
  }

  // --- POST: send one encrypted envelope ------------------------------------
  if (req.method === "POST") {
    const body = parseBody(req);
    if (body.action !== "send") return res.status(400).json({ error: "bad action" });
    const code = normalizeCode(body.code);
    const role = body.role === "callee" ? "callee" : "caller";
    const seq = Number(body.seq);
    const envelope = body.body;
    if (!code) return res.status(400).json({ error: "bad code" });
    if (!Number.isInteger(seq) || seq < 1) return res.status(400).json({ error: "bad seq" });
    if (typeof envelope !== "string" || envelope.length === 0) {
      return res.status(400).json({ error: "bad body" });
    }
    if (envelope.length > MAX_BODY_CHARS) return res.status(413).json({ error: "too big" });

    // Gate (live call, under cap, bump own heartbeat) + idempotent insert in
    // one statement. A client retry that lost the response re-sends the same
    // (role, seq) and lands on ON CONFLICT DO NOTHING - send is safely
    // retryable. (A dup does bump msg_count; it's a cap, not a meter.)
    const rows = await sql`
      WITH gate AS (
        UPDATE calls SET msg_count = msg_count + 1,
          caller_seen = CASE WHEN ${role} = 'caller' THEN now() ELSE caller_seen END,
          callee_seen = CASE WHEN ${role} = 'callee' THEN now() ELSE callee_seen END
        WHERE code = ${code} AND ended_at IS NULL AND msg_count < ${MAX_MSGS_PER_CALL}
        RETURNING code
      )
      INSERT INTO messages (code, from_role, seq, body)
      SELECT code, ${role}, ${seq}, ${envelope} FROM gate
      ON CONFLICT (code, from_role, seq) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) return res.status(200).json({ ok: true, id: Number(rows[0].id) });

    const existing = await sql`SELECT ended_at, msg_count FROM calls WHERE code = ${code}`;
    if (existing.length === 0) return res.status(404).json({ error: "gone" });
    if (existing[0].ended_at !== null) return res.status(410).json({ error: "ended" });
    if (Number(existing[0].msg_count) >= MAX_MSGS_PER_CALL) {
      return res.status(413).json({ error: "full" });
    }
    return res.status(200).json({ ok: true, dup: true });
  }

  return res.status(405).json({ error: "method" });
}
