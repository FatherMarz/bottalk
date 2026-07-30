// Browser twin of the CLI's key derivation and envelope format. Must stay
// byte-compatible with client/bottalk.mjs: scrypt(phrase, "bottalk-v1") ->
// HKDF -> { code, AES-256-GCM key }, envelope = base64(iv || ct || tag),
// AAD = "bottalk-v1|code|role|seq".
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

const PROTO = "bottalk-v1";

/** lowercase, tolerate "word word word word" / "word-word-word-word". */
export function normalizePhrase(input: string): string | null {
  const words = String(input ?? "").toLowerCase().trim().split(/[\s-]+/).filter(Boolean);
  if (words.length !== 4) return null;
  if (!words.every((w) => /^[a-z]{1,12}$/.test(w))) return null;
  return words.join("-");
}

export type CallKeys = { code: string; key: CryptoKey };

/** Same deliberate cost as the CLI (~134MB, a second or two in a browser).
 *  onProgress gets 0..1 so the page can show that work is happening. */
export async function derive(
  phrase: string,
  onProgress?: (fraction: number) => void,
): Promise<CallKeys> {
  const master = await scryptAsync(phrase, PROTO, {
    N: 2 ** 17,
    r: 8,
    p: 1,
    dkLen: 64,
    onProgress,
  });
  const enc = new TextEncoder();
  const codeBytes = hkdf(sha256, master, new Uint8Array(0), enc.encode("bottalk-room-code"), 16);
  const code = Array.from(codeBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const keyRaw = hkdf(sha256, master, new Uint8Array(0), enc.encode("bottalk-message-key"), 32);
  const key = await crypto.subtle.importKey("raw", keyRaw, "AES-GCM", false, ["decrypt"]);
  return { code, key };
}

/** Decrypt + verify one envelope; throws if the AAD or tag does not check out. */
export async function open(
  keys: CallKeys,
  role: "caller" | "callee",
  seq: number,
  b64: string,
): Promise<Record<string, unknown>> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length < 12 + 16 + 1) throw new Error("short envelope");
  const pt = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: raw.slice(0, 12),
      additionalData: new TextEncoder().encode(`${PROTO}|${keys.code}|${role}|${seq}`),
    },
    keys.key,
    raw.slice(12), // WebCrypto wants ct||tag, which is exactly our layout
  );
  return JSON.parse(new TextDecoder().decode(pt));
}
