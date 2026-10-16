import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, ensureSchema, sweepWalls, appendWallNotes } from "./_lib/db.js";

/** Encrypted room transport. Keys stay in participant devices and URL fragments.
 * Table and envelope names remain compatible with version 1 room invitations. */

const MAX_NOTE_CHARS = 16384; // per-note ciphertext cap, same scale as calls
const MAX_NOTES_PER_WALL = 5000; // personal tool backstop
const MAX_BATCH = 100;
const ID_RE = /^[a-f0-9]{24}$/; // client-generated room id
const CLIENT_ID_RE = /^[a-f0-9-]{8,64}$/; // client-generated note id

function parseBody(req: VercelRequest): Record<string, unknown> {
  const body = req.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    return body as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(
      Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? ""),
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

/** The server-visible surface of one note. */
type NoteRow = { client_id: string; ct: string; deleted: boolean };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  res.setHeader("cache-control", "no-store");
  await ensureSchema();
  const body = parseBody(req);
  const id =
    typeof body.id === "string" && ID_RE.test(body.id) ? body.id : null;
  if (!id) return res.status(400).json({ error: "bad id" });

  if (body.action === "create") {
    await sweepWalls();
    const rows = await sql`
      INSERT INTO walls (id, saved_at) VALUES (${id}, now())
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (rows.length === 0) return res.status(409).json({ error: "exists" });
    return res.status(200).json({ ok: true });
  }

  if (body.action === "touch") {
    // Any visit keeps an unsaved room alive.
    await sql`UPDATE walls SET last_seen = now() WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  if (body.action === "fetch") {
    const wall = await sql`SELECT name FROM walls WHERE id = ${id}`;
    if (wall.length === 0) return res.status(404).json({ error: "gone" });
    const notes = await sql`
      SELECT client_id, ct, deleted FROM wall_notes
      WHERE wall_id = ${id}
      ORDER BY id
    `;
    return res.status(200).json({
      name: wall[0].name,
      notes: (notes as NoteRow[]).map((n) => ({
        client_id: n.client_id,
        ct: n.deleted ? null : n.ct,
      })),
    });
  }

  const notes = Array.isArray(body.notes) ? body.notes : null;
  if (body.action === "post") {
    if (!Array.isArray(notes) || notes.length === 0)
      return res.status(400).json({ error: "bad notes" });
    if (notes.length > MAX_BATCH)
      return res.status(413).json({ error: "too many notes in one request" });
    const ids = new Set();
    for (const n of notes) {
      if (typeof n?.client_id !== "string" || !CLIENT_ID_RE.test(n.client_id)) {
        return res.status(400).json({ error: "bad note id" });
      }
      if (ids.has(n.client_id))
        return res.status(400).json({ error: "duplicate note id" });
      ids.add(n.client_id);
      if (
        typeof n?.ct !== "string" ||
        n.ct.length === 0 ||
        n.ct.length > MAX_NOTE_CHARS
      ) {
        return res.status(400).json({ error: "bad ct" });
      }
    }
    const result = await appendWallNotes(id, notes, MAX_NOTES_PER_WALL);
    if (result === "gone") return res.status(404).json({ error: "gone" });
    if (result === "full") return res.status(413).json({ error: "full" });
    return res.status(200).json({ ok: true });
  }

  if (body.action === "delete") {
    const client_id =
      typeof body.client_id === "string" && CLIENT_ID_RE.test(body.client_id)
        ? body.client_id
        : null;
    if (!client_id) return res.status(400).json({ error: "bad note id" });
    await sql`
      UPDATE wall_notes SET deleted = true, updated_at = now()
      WHERE wall_id = ${id} AND client_id = ${client_id}
    `;
    await sql`UPDATE walls SET last_seen = now() WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  if (body.action === "save") {
    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return res.status(400).json({ error: "bad name" });
    await sql`
      UPDATE walls SET name = ${name}, saved_at = COALESCE(saved_at, now()), last_seen = now()
      WHERE id = ${id}
    `;
    return res.status(200).json({ ok: true });
  }

  if (body.action === "unsave") {
    // Delete the project (the room itself keeps its 7-day tail).
    await sql`UPDATE walls SET name = NULL, saved_at = NULL WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "bad action" });
}
