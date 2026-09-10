// Browser crypto for wall rooms. The room link's URL fragment
// (`#<roomId>.<key>`) IS the key: it never leaves the browser. Envelopes are
// base64(iv || ct || tag), AES-256-GCM, AAD = "wall-v1|<roomId>|<clientId>".
// The CLI twin lives in client/bottalk.mjs - keep both byte-compatible.

const PROTO = "wall-v1";

export type WallKeys = { roomId: string; key: CryptoKey };

export type Bytes = Uint8Array<ArrayBuffer>;

export function b64urlEncode(bytes: Bytes): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Bytes {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)) as Bytes;
}

export async function importKey(raw: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function aad(roomId: string, clientId: string): Bytes {
  return new TextEncoder().encode(`${PROTO}|${roomId}|${clientId}`) as Bytes;
}

export async function seal(key: CryptoKey, roomId: string, clientId: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(text);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(roomId, clientId) }, key, enc),
  );
  const out = new Uint8Array(12 + ct.length) as Bytes;
  out.set(iv);
  out.set(ct, 12);
  return b64urlEncode(out);
}

export async function open(
  key: CryptoKey,
  roomId: string,
  clientId: string,
  b64: string,
): Promise<string> {
  const raw = b64urlDecode(b64);
  if (raw.length < 12 + 16 + 1) throw new Error("short envelope");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.slice(0, 12), additionalData: aad(roomId, clientId) },
    key,
    raw.slice(12), // WebCrypto wants ct||tag, which is exactly our layout
  );
  return new TextDecoder().decode(pt);
}
