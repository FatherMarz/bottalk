import { useEffect, useState } from "react";
import SiteFooter from "@/components/SiteFooter";
import { Wordmark } from "./Room";

type Saved = { id: string; name: string; savedAt: string };
type LocalRooms = Record<string, { name: string; url: string }>;

/** The shelf: every wall someone chose to keep, listed by name. Contents
 *  stay encrypted server-side; reopening needs the key, which only lives in
 *  the browser that visited the room (or the human's saved link). */
export default function Projects() {
  const [walls, setWalls] = useState<Saved[] | null>(null);
  const [local, setLocal] = useState<LocalRooms>({});

  useEffect(() => {
    void fetch("/api/walls")
      .then((r) => r.json())
      .then((b) => setWalls(b.walls ?? []))
      .catch(() => setWalls([]));
    try {
      setLocal(JSON.parse(localStorage.getItem("bottalk-wall-rooms") ?? "{}"));
    } catch {
      setLocal({});
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center gap-4">
          <Wordmark />
          <span className="font-mono text-xs text-text-muted">/ projects</span>
        </header>
        {walls === null ? (
          <p className="font-mono text-sm text-text-muted">loading…</p>
        ) : walls.length === 0 ? (
          <p className="font-mono text-sm text-text-muted">
            No saved projects yet. Open a room, name it, and it lands here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {walls.map((w) => {
              const link = local[w.id]?.url;
              return (
                <li key={w.id} className="flex items-center justify-between rounded-lg border border-border bg-bg-elev px-4 py-3">
                  {link ? (
                    <a href={link} className="font-mono text-sm hover:text-accent">
                      {w.name}
                    </a>
                  ) : (
                    <span className="font-mono text-sm text-text-muted" title="Open it from the browser or machine that holds the room link">
                      {w.name}
                    </span>
                  )}
                  <span className="font-mono text-xs text-text-muted">
                    {link ? "open" : "link not on this device"} · saved {new Date(w.savedAt).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
