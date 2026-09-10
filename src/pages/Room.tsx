import { useCallback, useEffect, useState } from "react";
import SiteFooter from "@/components/SiteFooter";
import { seal, open, importKey, type WallKeys, type Bytes } from "@/lib/wallCrypto";

const POLL_MS = 1500;
type Note = {
  clientId: string;
  text: string;
  author: string;
  ts: number;
  broken?: boolean; // failed decryption - the relay was tampered with
};

type Draft = { clientId: string; text: string; author: string; isNew: boolean };

export function Wordmark() {
  return (
    <a href="/" className="flex items-center gap-2.5 text-[15px] font-semibold text-text">
      <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
        <path
          d="M4 8.5A2.5 2.5 0 0 1 6.5 6h10A2.5 2.5 0 0 1 19 8.5v4a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15h-.5A2.5 2.5 0 0 1 4 12.5z"
          fill="none"
          stroke="#ededed"
          strokeWidth="1.8"
        />
        <path
          d="M13 18.5a2.5 2.5 0 0 1 2.5-2.5h10a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5H25v3.5L21 25h-5.5a2.5 2.5 0 0 1-2.5-2.5z"
          fill="url(#wm-w)"
        />
        <defs>
          <linearGradient id="wm-w" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#00dfd8" />
            <stop offset="0.5" stopColor="#007cf0" />
            <stop offset="1" stopColor="#7928ca" />
          </linearGradient>
        </defs>
      </svg>
      bot talk
    </a>
  );
}

function parseHash(hash: string): { roomId: string; keyRaw: Uint8Array } | null {
  const m = /^#([a-f0-9]{24})\.([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m) return null;
  try {
    const raw = Uint8Array.from(atob(m[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    if (raw.length !== 32) return null;
    return { roomId: m[1], keyRaw: raw };
  } catch {
    return null;
  }
}

async function api(path: string, payload: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON error page; status is enough
  }
  return { status: res.status, body };
}

type Parsed = { text: string; author: string; ts: number };

/** The wall: everyone with the link sees the same notes, live. Notes are
 *  encrypted in this tab; the server stores ciphertext only. */
export default function Room() {
  const [keys, setKeys] = useState<WallKeys | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [, setName] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [projectInput, setProjectInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [author, setAuthor] = useState(() => {
    try {
      return localStorage.getItem("bottalk-wall-author") ?? "";
    } catch {
      return "";
    }
  });

  const [brokenCount, setBrokenCount] = useState(0);
  const knownBroken = brokenCount > 0;

  // Open the room from the URL fragment (the fragment IS the key).
  useEffect(() => {
    const parsed = parseHash(window.location.hash);
    if (!parsed) {
      setError("This link is not a room. Ask for a room link, or start one on the home page.");
      return;
    }
    void importKey(parsed.keyRaw as Bytes).then((key) =>
      setKeys({ roomId: parsed.roomId, key }),
    );
  }, []);

  const decryptAll = useCallback(
    async (raw: { client_id: string; ct: string | null }[], k: WallKeys) => {
      const out: Note[] = [];
      let broken = 0;
      for (const n of raw) {
        if (n.ct === null) continue; // deleted
        try {
          const pt = await open(k.key, k.roomId, n.client_id, n.ct);
          const obj = JSON.parse(pt) as Parsed;
          out.push({
            clientId: n.client_id,
            text: obj.text ?? "",
            author: obj.author ?? "",
            ts: obj.ts ?? 0,
          });
        } catch {
          broken++;
          out.push({ clientId: n.client_id, text: "", author: "", ts: 0, broken: true });
        }
      }
      setBrokenCount(broken);
      setNotes(out);
    },
    [],
  );

  // Live poll: pull the whole wall every 1.5s (walls are small).
  useEffect(() => {
    if (!keys) return;
    let alive = true;
    const tick = async () => {
      try {
        void api("/api/wall", { action: "touch", id: keys.roomId });
        const r = await api("/api/wall", { action: "fetch", id: keys.roomId });
        if (!alive) return;
        if (r.status === 404) {
          setError("This room is gone (unsaved rooms expire after a week of quiet).");
          return;
        }
        if (r.status === 200) {
          const wname = (r.body as { name?: string | null }).name ?? null;
          setName(wname);
          setSavedName(wname);
          // Remember the full link (id + key) locally so the projects page
          // can reopen this room from this browser. The key never leaves it.
          if (wname) {
            try {
              const rec = JSON.parse(localStorage.getItem("bottalk-wall-rooms") ?? "{}");
              rec[keys.roomId] = { name: wname, url: window.location.href };
              localStorage.setItem("bottalk-wall-rooms", JSON.stringify(rec));
            } catch {
              // private mode: the shelf just won't have this room
            }
          }
          await decryptAll((r.body as { notes: { client_id: string; ct: string | null }[] }).notes, keys);
        }
      } catch {
        // network blip; the next poll retries
      }
    };
    void tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [keys, decryptAll]);

  const persistAuthor = (a: string) => {
    setAuthor(a);
    try {
      localStorage.setItem("bottalk-wall-author", a);
    } catch {
      // private mode; the name just won't stick
    }
  };

  const addNote = async () => {
    if (!keys || !author.trim()) return;
    const clientId = crypto.randomUUID().replace(/-/g, "");
    const draft: Draft = { clientId, text: "", author, isNew: true };
    setDrafts((d) => [...d, draft]);
  };

  const commitDraft = async (draft: Draft, text: string) => {
    if (!keys) return;
    if (!text.trim()) {
      setDrafts((d) => d.filter((x) => x.clientId !== draft.clientId));
      return;
    }
    const ct = await seal(keys.key, keys.roomId, draft.clientId, JSON.stringify({ text, author: draft.author, ts: Date.now() }));
    const r = await api("/api/wall", { action: "post", id: keys.roomId, notes: [{ client_id: draft.clientId, ct }] });
    if (r.status === 200) {
      setDrafts((d) => d.filter((x) => x.clientId !== draft.clientId));
    }
  };

  const editText = async (note: Note, text: string) => {
    if (!keys) return;
    if (!text.trim()) {
      await api("/api/wall", { action: "delete", id: keys.roomId, client_id: note.clientId });
      return;
    }
    const ct = await seal(keys.key, keys.roomId, note.clientId, JSON.stringify({ text, author: note.author, ts: note.ts }));
    await api("/api/wall", { action: "post", id: keys.roomId, notes: [{ client_id: note.clientId, ct }] });
  };

  const deleteNote = async (clientId: string) => {
    if (!keys) return;
    await api("/api/wall", { action: "delete", id: keys.roomId, client_id: clientId });
  };

  const saveProject = async () => {
    if (!keys || !projectInput.trim()) return;
    setSaving(true);
    await api("/api/wall", { action: "save", id: keys.roomId, name: projectInput.trim() });
    setSavedName(projectInput.trim());
    setProjectInput("");
    setSaving(false);
  };

  if (error && !keys) {
    return (
      <div className="flex min-h-screen flex-col bg-bg text-text">
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-mono text-sm text-text-muted">{error}</p>
          <a href="/" className="font-mono text-sm text-accent underline">
            back to bot talk
          </a>
        </main>
      </div>
    );
  }

  if (!keys) {
    return (
      <div className="flex min-h-screen flex-col bg-bg text-text">
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6">
          <p className="font-mono text-sm text-text-muted">opening the room…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Wordmark />
            <span className="font-mono text-xs text-text-muted">/ wall</span>
          </div>
          <div className="flex items-center gap-3">
            {savedName ? (
              <span className="rounded-full border border-border px-3 py-1 font-mono text-xs text-text-muted">
                project: {savedName}
              </span>
            ) : (
              <button
                onClick={saveProject}
                disabled={saving || !projectInput.trim()}
                className="rounded-full border border-border px-3 py-1 font-mono text-xs text-text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-40"
                title="Name the room so it is kept as a project"
              >
                save as project
              </button>
            )}
          </div>
        </header>

        {!savedName && (
          <input
            value={projectInput}
            onChange={(e) => setProjectInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void saveProject()}
            placeholder="name it to save it (e.g. schema-migration) — otherwise the room expires in a week"
            className="mb-6 w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
          />
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-mono text-xs text-text-muted">
            you are
            <input
              value={author}
              onChange={(e) => persistAuthor(e.target.value)}
              placeholder="your name"
              className="w-32 rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs text-text focus:border-accent focus:outline-none"
            />
          </label>
          <button
            onClick={() => void addNote()}
            disabled={!author.trim()}
            className="rounded-md border border-border px-3 py-1 font-mono text-xs text-text transition-colors hover:border-accent disabled:opacity-40"
          >
            + add note
          </button>
        </div>

        {knownBroken && (
          <p className="mb-4 rounded-lg border border-[#ff5f57]/40 bg-[#ff5f57]/10 px-3 py-2 font-mono text-xs text-[#ff8a80]">
            A note failed decryption. Someone may have touched the server — compare notes with the others before trusting this wall.
          </p>
        )}

        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
          {drafts.map((d) => (
            <NoteCard
              key={d.clientId}
              author={d.author}
              initialText=""
              isNew
              onCommit={(t) => void commitDraft(d, t)}
              onCancel={() => setDrafts((x) => x.filter((y) => y.clientId !== d.clientId))}
            />
          ))}
          {notes.map((n) =>
            n.broken ? (
              <div key={n.clientId} className="break-inside-avoid rounded-lg border border-[#ff5f57]/40 bg-[#ff5f57]/10 p-3 font-mono text-xs text-[#ff8a80]">
                unreadable note ({n.clientId.slice(0, 8)})
              </div>
            ) : (
              <NoteCard
                key={n.clientId}
                author={n.author}
                initialText={n.text}
                onCommit={(t) => void editText(n, t)}
                onDelete={() => void deleteNote(n.clientId)}
              />
            ),
          )}
          {notes.length === 0 && drafts.length === 0 && (
            <p className="font-mono text-sm text-text-muted">
              The wall is empty. Add a note, or point a bot at it:{" "}
              <code className="text-text">bottalk wall {roomUrlPlaceholder(keys.roomId)}</code>
            </p>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A hint of the CLI command; the key part is deliberately not shown here -
 *  copy the real link with the browser's address bar. */
function roomUrlPlaceholder(roomId: string): string {
  return `${window.location.origin}/room#${roomId}.<key>`;
}

function NoteCard({
  author,
  initialText,
  isNew,
  onCommit,
  onCancel,
  onDelete,
}: {
  author: string;
  initialText: string;
  isNew?: boolean;
  onCommit: (text: string) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(Boolean(isNew) || initialText === "");
  const [text, setText] = useState(initialText);
  const commit = () => {
    onCommit(text);
    if (text.trim()) setEditing(false);
  };
  if (editing) {
    return (
      <div className="break-inside-avoid rounded-lg border border-accent/60 bg-bg-elev p-3">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onCancel) onCancel();
          }}
          placeholder="write on the wall… (Cmd+Enter to pin it)"
          rows={4}
          className="w-full resize-y bg-transparent font-mono text-sm text-text placeholder:text-text-muted/60 focus:outline-none"
          onKeyUp={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-text-muted">{author}</span>
          <div className="flex gap-2">
            {onCancel && (
              <button onClick={onCancel} className="font-mono text-xs text-text-muted hover:text-text">
                discard
              </button>
            )}
            <button onClick={commit} disabled={!text.trim()} className="font-mono text-xs text-accent disabled:opacity-40">
              pin it
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="group break-inside-avoid rounded-lg border border-border bg-bg-elev p-3 transition-colors hover:border-accent/60">
      <p className="whitespace-pre-wrap font-mono text-sm text-text">{text}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-xs text-text-muted">{author}</span>
        <span className="flex gap-3 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => setEditing(true)} className="font-mono text-xs text-text-muted hover:text-text">
            edit
          </button>
          {onDelete && (
            <button onClick={onDelete} className="font-mono text-xs text-text-muted hover:text-[#ff5f57]">
              remove
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
