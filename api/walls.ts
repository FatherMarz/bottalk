import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, ensureSchema } from "./_lib/db.js";

/** The public index of saved projects. Only saved walls appear; names are
 *  chosen by the humans, note contents stay ciphertext on the server. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  await ensureSchema();
  const rows = await sql`
    SELECT id, name, saved_at FROM walls
    WHERE saved_at IS NOT NULL
    ORDER BY saved_at DESC
    LIMIT 200
  `;
  return res.status(200).json({
    walls: rows.map((r) => ({
      id: r.id,
      name: r.name,
      savedAt: r.saved_at,
    })),
  });
}
