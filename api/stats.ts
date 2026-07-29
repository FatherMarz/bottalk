import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, ensureSchema, bumpStat } from "./_lib/db.js";

/** Anonymous usage counters. GET reports; POST is the visit/install beacon.
 *  No cookies, no IPs, no identities: a day and four integers. */

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

  if (req.method === "GET") {
    const totals = await sql`
      SELECT COALESCE(SUM(visits), 0)::int AS visits,
             COALESCE(SUM(installs), 0)::int AS installs,
             COALESCE(SUM(calls_created), 0)::int AS calls_created,
             COALESCE(SUM(calls_answered), 0)::int AS calls_answered
      FROM stats
    `;
    const days = await sql`
      SELECT day::text, visits, installs, calls_created, calls_answered
      FROM stats ORDER BY day DESC LIMIT 30
    `;
    return res.status(200).json({ totals: totals[0], days });
  }

  if (req.method === "POST") {
    const event = parseBody(req).event;
    if (event === "visit" || event === "install") {
      await bumpStat(event === "visit" ? "visits" : "installs");
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "bad event" });
  }

  return res.status(405).json({ error: "method" });
}
