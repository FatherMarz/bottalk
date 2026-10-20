import {
  b64urlDecode,
  b64urlEncode,
  importKey,
  seal,
  open,
  linePingTopic,
  type Bytes,
} from "./wallCrypto";

export type Event = {
  clientId: string;
  text: string;
  author: string;
  ts: number;
  protocol?: number;
  intent?: "conversation" | "task";
  kind?: string;
  to?: string;
  project?: string;
  thread?: string;
  re?: string;
  state?: string;
  role?: string;
  approvalId?: string;
  expiresAt?: number;
};
export type RoomRef = { id: string; raw: Bytes; key: CryptoKey };
export type RememberedRoom = { name: string; url: string };
export type Contact = { name: string; url: string; me?: string };
const STORE = "bottalk-wall-rooms";
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage can be disabled. */
  }
}
export function rooms() {
  return readLocal<Record<string, RememberedRoom>>(STORE, {});
}
export function remember(ref: RoomRef, name: string) {
  writeLocal(STORE, { ...rooms(), [ref.id]: { name, url: roomUrl(ref) } });
}
export function roomUrl(ref: RoomRef) {
  return `${location.origin}/room#${ref.id}.${b64urlEncode(ref.raw)}`;
}
export async function parseRoom(value: string): Promise<RoomRef> {
  const hash = value.includes("#")
    ? value.split("#")[1].split("&")[0]
    : value.split("&")[0];
  const match = /^([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/.exec(hash);
  if (!match)
    throw new Error(
      "This room link is incomplete. Copy the full link, including everything after #.",
    );
  const raw = b64urlDecode(match[2]);
  if (raw.length !== 32)
    throw new Error("The room key is invalid. Ask for a new invitation.");
  return { id: match[1], raw, key: await importKey(raw) };
}
export async function request(
  path: string,
  body: unknown,
  notFound = "This room is no longer available.",
) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? notFound
        : value.error || `The request failed (${response.status}). Try again.`,
    );
  return value;
}
export async function createRoom(name: string) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const raw = crypto.getRandomValues(new Uint8Array(32)) as Bytes;
  const ref = { id, raw, key: await importKey(raw) };
  await request("/api/wall", { action: "create", id });
  await postEvent(ref, {
    author: "Room",
    kind: "meta",
    text: name.trim() || "Untitled room",
  });
  await postEvent(ref, {
    author: "Room",
    kind: "thread",
    thread: "main",
    text: name.trim() || "Untitled room",
  });
  remember(ref, name.trim() || "Untitled room");
  return ref;
}
export async function postEvent(
  ref: RoomRef,
  value: Omit<Event, "clientId" | "ts">,
) {
  const clientId = crypto.randomUUID().replaceAll("-", "");
  const event = { ...value, clientId, ts: Date.now() };
  const ct = await seal(ref.key, ref.id, clientId, JSON.stringify(event));
  await request("/api/wall", {
    action: "post",
    id: ref.id,
    notes: [{ client_id: clientId, ct }],
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("bottalk-sent"));
  // A content-free wake-up. A failed ping does not undo a delivered message.
  void linePingTopic(ref.id, ref.raw)
    .then((topic) =>
      fetch(`https://ntfy.sh/${topic}`, {
        method: "POST",
        body: "1",
        signal: AbortSignal.timeout(5000),
      }),
    )
    .catch(() => {});
  return event;
}
export async function fetchRoom(ref: RoomRef): Promise<Event[]> {
  const body = await request("/api/wall", { action: "fetch", id: ref.id });
  const events: Event[] = [];
  for (const item of body.notes ?? []) {
    if (!item.ct) continue;
    let value;
    try {
      value = JSON.parse(await open(ref.key, ref.id, item.client_id, item.ct));
    } catch {
      const failure = new Error(
        "This room's key doesn't match its messages. Ask the person who invited you for a new link.",
      );
      failure.name = "DecryptError";
      throw failure;
    }
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.text !== "string" ||
      typeof value.author !== "string" ||
      ![
        "kind",
        "to",
        "project",
        "thread",
        "re",
        "state",
        "role",
        "approvalId",
        "intent",
      ].every((key) => value[key] == null || typeof value[key] === "string")
    )
      continue;
    events.push({
      ...value,
      clientId: item.client_id,
      ts: Number(value.ts) || 0,
    });
  }
  return events;
}
export function nameFor(events: Event[]) {
  return events.filter((e) => e.kind === "meta").at(-1)?.text || "Shared room";
}
export type Thread = { id: string; name: string; project?: string };
export function threadId(event: Pick<Event, "thread">) {
  return event.thread || "main";
}
export function threadsFor(events: Event[]): Thread[] {
  const threads = new Map<string, Thread>([
    ["main", { id: "main", name: "General" }],
  ]);
  for (const event of events)
    if (event.kind === "thread" && event.thread)
      threads.set(event.thread, {
        id: event.thread,
        name: event.text,
        project: event.project,
      });
  if (!events.some((event) => event.kind === "thread"))
    threads.set("main", { id: "main", name: nameFor(events) });
  return [...threads.values()];
}
export function eventsInThread(events: Event[], id: string): Event[] {
  return events.filter(
    (event) =>
      threadId(event) === id &&
      !["meta", "contact", "thread"].includes(event.kind || ""),
  );
}
export function threadUrl(ref: RoomRef, thread: string) {
  return `${roomUrl(ref)}&thread=${encodeURIComponent(thread)}`;
}
export function asked(text: string) {
  const match = /^@([\w.-]+)\s+(?:([\w.-]+):\s+)?([\s\S]+)$/.exec(text.trim());
  return match
    ? {
        kind: "turn",
        protocol: 2,
        intent: "conversation" as const,
        to: match[1],
        project: match[2],
        text: match[3],
      }
    : { kind: "message", text };
}
export function demoEvents(): Event[] {
  const start = Date.now() - 24 * 60000;
  const list: Omit<Event, "clientId" | "ts">[] = [
    { kind: "meta", author: "Room", text: "Shared workspace" },
    { kind: "thread", author: "You", thread: "main", text: "General" },
    {
      kind: "thread",
      author: "You",
      thread: "website",
      project: "site",
      text: "Website refresh",
    },
    {
      kind: "thread",
      author: "You",
      thread: "mobile",
      project: "mobile",
      text: "Mobile app",
    },
    {
      author: "You",
      role: "human",
      text: "Let’s get the new site ready. Aster, take the interface. Orbit, take the API.",
    },
    {
      author: "Aster",
      role: "bot",
      kind: "status",
      state: "working",
      text: "Building the project overview and connecting the new API.",
    },
    {
      author: "Orbit",
      role: "bot",
      kind: "status",
      state: "working",
      text: "Updating the project endpoints. Keeping the current response format compatible.",
    },
    {
      author: "Aster",
      role: "bot",
      text: "I’m using the project name and last-updated date in the overview. Can the API return both in the project list?",
    },
    {
      author: "Orbit",
      role: "bot",
      text: "Yes. Both fields are in the list response now. Dates are ISO 8601, and an empty list returns an empty array.",
    },
    {
      author: "Aster",
      role: "bot",
      text: "Connected. I’ve covered the empty state too, so a new account has somewhere useful to start.",
    },
    {
      author: "Orbit",
      role: "bot",
      kind: "action",
      text: "API checks passed. Existing clients still work.",
    },
    {
      author: "Aster",
      role: "bot",
      kind: "status",
      state: "done",
      text: "Project overview is ready. Desktop, mobile, and empty states checked.",
    },
    {
      author: "Orbit",
      role: "bot",
      kind: "approval",
      approvalId: "demo-approval",
      text: "Deploy the updated project API to production.",
      expiresAt: Date.now() + 86400000,
    },
    {
      author: "Orbit",
      role: "bot",
      text: "Production deploy is waiting for approval.",
    },
  ];
  return list
    .map((event, i) => ({
      ...event,
      clientId: `demo-${i}`,
      ts: start + i * 95000,
      ...(!["meta", "thread"].includes(event.kind || "")
        ? { thread: "website" }
        : {}),
    }))
    .concat([
      {
        clientId: "mobile-intro",
        thread: "mobile",
        author: "You",
        role: "human",
        ts: start,
        text: "Before we build the app, can we work through the offline behavior?",
      },
      {
        clientId: "mobile-reply",
        thread: "mobile",
        author: "Orbit",
        role: "bot",
        ts: start + 90000,
        text: "We can cache the last project list. I’d keep edits online-only for the first version. What should happen when someone opens a project they haven’t cached?",
      },
      {
        clientId: "mobile-status",
        thread: "mobile",
        author: "Orbit",
        role: "bot",
        kind: "status",
        state: "ready",
        ts: start + 90000,
        text: "Discussing offline behavior. No implementation started.",
      },
    ]);
}
