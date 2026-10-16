import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, createHmac } from "node:crypto";
import { sql, ensureSchema } from "./_lib/db.js";
const ID = /^[a-f0-9]{32}$/;
const ROOM = /^[a-f0-9]{24}$/;
const TOKEN = /^[a-f0-9]{64}$/;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  await ensureSchema();
  let body: Record<string, unknown>;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid request." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return res.status(400).json({ error: "Invalid request." });
  const id = typeof body.id === "string" && ID.test(body.id) ? body.id : null;
  if (!id) return res.status(400).json({ error: "Invalid request ID." });
  if (body.action === "create") {
    if (
      typeof body.roomId !== "string" ||
      !ROOM.test(body.roomId) ||
      typeof body.tokenHash !== "string" ||
      !TOKEN.test(body.tokenHash) ||
      typeof body.declineHash !== "string" ||
      !TOKEN.test(body.declineHash) ||
      typeof body.ct !== "string" ||
      body.ct.length > 16384 ||
      !body.ct.length
    )
      return res.status(400).json({ error: "Invalid approval request." });
    const expires = Number(body.expiresAt);
    if (
      !Number.isFinite(expires) ||
      expires <= Date.now() ||
      expires > Date.now() + 7 * 86400000
    )
      return res
        .status(400)
        .json({ error: "Expiry must be within seven days." });
    const room = await sql`SELECT id FROM walls WHERE id = ${body.roomId}`;
    if (!room.length) return res.status(404).json({ error: "Room not found." });
    const rows =
      await sql`INSERT INTO approvals (id, room_id, token_hash, decline_hash, ct, expires_at)
      VALUES (${id}, ${body.roomId}, ${body.tokenHash}, ${body.declineHash}, ${body.ct}, ${new Date(expires).toISOString()})
      ON CONFLICT (id) DO NOTHING RETURNING id`;
    if (!rows.length)
      return res.status(409).json({
        error: "This request already exists. Its action cannot change.",
      });
    return res.status(200).json({ ok: true });
  }
  if (body.action === "get") {
    const rows =
      await sql`SELECT ct, status, expires_at, receipt FROM approvals WHERE id = ${id}`;
    if (!rows.length)
      return res
        .status(404)
        .json({ error: "This request is no longer available." });
    return res.status(200).json({
      ct: rows[0].ct,
      status: rows[0].status,
      expiresAt: rows[0].expires_at,
      receipt: rows[0].receipt,
    });
  }
  if (body.action === "decide") {
    if (
      typeof body.token !== "string" ||
      !TOKEN.test(body.token) ||
      !["approved", "declined"].includes(String(body.decision))
    )
      return res.status(400).json({ error: "Invalid decision." });
    const hash = createHash("sha256").update(body.token).digest("hex");
    const receipt = createHmac("sha256", body.token)
      .update(`${id}|${body.decision}`)
      .digest("hex");
    // One update wins. An email preview or GET request cannot resolve a request.
    const rows =
      await sql`UPDATE approvals SET status = ${body.decision}, receipt = ${receipt}, decided_at = now()
      WHERE id = ${id} AND (CASE WHEN ${body.decision} = 'approved' THEN token_hash ELSE decline_hash END) = ${hash} AND status = 'pending' AND expires_at > now()
      RETURNING status`;
    if (rows.length) return res.status(200).json({ status: rows[0].status });
    const current =
      await sql`SELECT status, expires_at FROM approvals WHERE id = ${id} AND (CASE WHEN ${body.decision} = 'approved' THEN token_hash ELSE decline_hash END) = ${hash}`;
    if (!current.length)
      return res.status(403).json({ error: "This approval link is invalid." });
    return res.status(200).json({
      status: current[0].status === "pending" ? "expired" : current[0].status,
    });
  }
  return res.status(400).json({ error: "Unknown action." });
}
