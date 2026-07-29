import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, ensureSchema, sweepCalls, normalizeCode, bumpStat } from "./_lib/db.js";

/** The intro is a small encrypted envelope (who's calling, topic). */
const MAX_INTRO_CHARS = 4096;
/** Global backstop - this is a personal tool, not a public queue. */
const MAX_LIVE_CALLS = 5000;

/** The body may arrive as a string, a parsed object, or a Buffer depending
 *  on content type. */
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
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  await ensureSchema();
  const body = parseBody(req);
  const code = normalizeCode(body.code);
  if (!code) return res.status(400).json({ error: "bad code" });

  if (body.action === "create") {
    await sweepCalls();
    const live = await sql`SELECT count(*)::int AS n FROM calls`;
    if (Number(live[0]?.n ?? 0) >= MAX_LIVE_CALLS) return res.status(503).json({ error: "busy" });
    const intro = body.intro;
    if (typeof intro !== "string" || intro.length === 0 || intro.length > MAX_INTRO_CHARS) {
      return res.status(400).json({ error: "bad intro" });
    }
    // Same-phrase collision (or a re-post) surfaces as 409; the client
    // regenerates a fresh passphrase and tries again.
    const rows = await sql`
      INSERT INTO calls (code, intro) VALUES (${code}, ${intro})
      ON CONFLICT (code) DO NOTHING
      RETURNING code
    `;
    if (rows.length === 0) return res.status(409).json({ error: "exists" });
    await bumpStat("calls_created");
    return res.status(200).json({ ok: true });
  }

  if (body.action === "answer") {
    // One-time claim. No caller-liveness requirement (unlike p2p's 12s):
    // the human may take minutes to text the phrase over - a call simply
    // rings for 30 minutes from creation.
    const claimed = await sql`
      UPDATE calls SET answered_at = now(), callee_seen = now()
      WHERE code = ${code}
        AND answered_at IS NULL
        AND ended_at IS NULL
        AND created_at > now() - interval '30 minutes'
      RETURNING intro
    `;
    if (claimed.length > 0) {
      await bumpStat("calls_answered");
      return res.status(200).json({ intro: claimed[0].intro });
    }
    const existing = await sql`SELECT answered_at FROM calls WHERE code = ${code}`;
    if (existing.length > 0 && existing[0].answered_at !== null) {
      return res.status(409).json({ error: "answered" });
    }
    // Wrong phrase derives a nonexistent code, so typos land here too.
    return res.status(404).json({ error: "dead" });
  }

  if (body.action === "hangup") {
    await sql`UPDATE calls SET ended_at = now() WHERE code = ${code} AND ended_at IS NULL`;
    return res.status(200).json({ ok: true }); // idempotent
  }

  return res.status(400).json({ error: "bad action" });
}
