import { useEffect, useRef, useState } from "react";
import SiteFooter from "@/components/SiteFooter";
import { derive, open, normalizePhrase, type CallKeys } from "@/lib/callCrypto";

const POLL_MS = 1000;

type Role = "caller" | "callee";
type Line =
  | { kind: "msg"; role: Role; text: string }
  | { kind: "sys"; text: string };

type CallState = {
  phase: "ringing" | "live" | "ended";
  callerName: string | null;
  lines: Line[];
};

function Wordmark() {
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
          fill="url(#wm-g2)"
        />
        <defs>
          <linearGradient id="wm-g2" x1="0" y1="0" x2="1" y2="1">
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

function StatusPill({ phase }: { phase: CallState["phase"] }) {
  const dot =
    phase === "live" ? "bg-[#28c840]" : phase === "ringing" ? "bg-[#febc2e]" : "bg-[#ff5f57]";
  const label = phase === "live" ? "live" : phase === "ringing" ? "ringing" : "ended";
  return (
    <span className="flex items-center gap-2 font-mono text-xs text-text-muted">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

/** Watch a call live: the passphrase stays in this tab, the poll is
 *  read-only (no heartbeat), everything decrypts locally. */
export default function Watch() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | number>(null); // scrypt progress 0..1
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<CallKeys | null>(null);
  const [call, setCall] = useState<CallState>({ phase: "ringing", callerName: null, lines: [] });
  const scroller = useRef<HTMLDivElement>(null);

  async function start() {
    const phrase = normalizePhrase(input);
    if (!phrase) {
      setError("That is not a 4-word passphrase.");
      return;
    }
    setError(null);
    setBusy(0);
    try {
      const k = await derive(phrase, (p) => setBusy(p));
      const probe = await fetch(`/api/messages?code=${k.code}&role=watch&after=0`);
      if (probe.status === 404) {
        setError("No call for that passphrase. It may have ended and been swept.");
        setBusy(null);
        return;
      }
      setKeys(k);
    } catch {
      setError("Could not derive the keys in this browser.");
    }
    setBusy(null);
  }

  useEffect(() => {
    if (!keys) return;
    let cursor = 0;
    let stopped = false;
    let named = false;
    let phase: CallState["phase"] = "ringing";

    const tick = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`/api/messages?code=${keys.code}&role=watch&after=${cursor}`);
        if (r.status === 404) {
          setCall((c) => ({
            ...c,
            phase: "ended",
            lines: [...c.lines, { kind: "sys", text: "The call is gone, swept from the relay." }],
          }));
          return;
        }
        if (r.ok) {
          const body = await r.json();
          const additions: Line[] = [];
          let callerName: string | null = null;
          if (!named && body.intro) {
            named = true;
            try {
              const ip = await open(keys, "caller", 0, body.intro);
              callerName = String(ip.from ?? "caller");
            } catch {
              additions.push({ kind: "sys", text: "(could not decrypt the intro: wrong passphrase?)" });
            }
          }
          for (const m of body.msgs ?? []) {
            cursor = Math.max(cursor, m.id);
            try {
              const p = await open(keys, m.from as Role, m.seq, m.body);
              if (p.type === "accept") {
                phase = "live";
                additions.push({ kind: "sys", text: "Call accepted. Line open." });
              } else if (p.type === "decline") {
                phase = "ended";
                additions.push({ kind: "sys", text: `Call declined${p.reason ? `: ${p.reason}` : "."}` });
              } else if (p.type === "msg") {
                additions.push({ kind: "msg", role: m.from as Role, text: String(p.text ?? "") });
              } else if (p.type === "bye") {
                phase = "ended";
                additions.push({ kind: "sys", text: "Hung up." });
              }
            } catch {
              additions.push({ kind: "sys", text: "(a message failed to decrypt: wrong passphrase?)" });
            }
          }
          if (body.ended && phase !== "ended") {
            phase = "ended";
            additions.push({ kind: "sys", text: "Call ended." });
          }
          if (additions.length || phase !== "ringing" || callerName) {
            const ph = phase;
            setCall((c) => ({
              phase: ph,
              callerName: callerName ?? c.callerName,
              lines: additions.length ? [...c.lines, ...additions] : c.lines,
            }));
          }
          if (phase === "ended") return; // final state rendered; stop polling
        }
      } catch {
        // network blip: keep polling
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stopped = true;
    };
  }, [keys]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [call.lines.length]);

  const callerLabel = call.callerName ?? "caller";

  return (
    <div className="flex min-h-screen flex-col">
      <nav className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-bg/70 backdrop-blur-md">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-6">
          <Wordmark />
          {keys && <StatusPill phase={call.phase} />}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-24 pt-32">
        {!keys ? (
          <>
            <h1 className="text-[clamp(1.875rem,4vw,2.75rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-text">
              Watch a call.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-text-muted">
              Enter the same four words the call was opened with. The passphrase never leaves this
              tab: your browser derives the key and decrypts the conversation locally, live.
            </p>
            <form
              className="mt-8 flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (busy === null) void start();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="brave lantern orbit tide"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="w-full flex-1 rounded-lg border border-border bg-transparent px-4 py-3 font-mono text-[15px] text-text placeholder:text-text-muted/50 focus:border-[#007cf0] focus:outline-none"
              />
              <button className="pill whitespace-nowrap" disabled={busy !== null} type="submit">
                {busy === null ? "Watch" : `Deriving keys… ${Math.round(busy * 100)}%`}
              </button>
            </form>
            {error && <p className="mt-4 text-[14px] text-[#ff6b66]">{error}</p>}
          </>
        ) : (
          <div className="terminal w-full">
            <div className="flex h-10 items-center gap-2 border-b border-border px-4">
              <span className="terminal-dot bg-[#ff5f57]" />
              <span className="terminal-dot bg-[#febc2e]" />
              <span className="terminal-dot bg-[#28c840]" />
              <span className="flex-1 text-center font-mono text-xs text-text-muted">
                watching: {callerLabel}&apos;s call
              </span>
              <span className="w-[46px]" />
            </div>
            <div
              ref={scroller}
              className="max-h-[65vh] min-h-[420px] overflow-y-auto p-5 font-mono text-[13px] leading-[1.7] md:p-6"
            >
              {call.lines.length === 0 && (
                <div className="text-text-muted/60">
                  {call.phase === "ringing" ? "Ringing. Waiting for pickup…" : "…"}
                </div>
              )}
              {call.lines.map((l, i) =>
                l.kind === "sys" ? (
                  <div key={i} className="py-0.5 text-text-muted/60">
                    {l.text}
                  </div>
                ) : (
                  <div key={i} className="py-0.5 text-text">
                    <span className={l.role === "caller" ? "text-[#52a8ff]" : "text-[#2dd4bf]"}>
                      [{l.role === "caller" ? callerLabel : "them"}]
                    </span>{" "}
                    {l.text}
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
