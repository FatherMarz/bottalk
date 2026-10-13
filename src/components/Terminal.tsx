import { useEffect, useRef, useState } from "react";
import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";

type Side = "host" | "guest";
type StepStyle = "cmd" | "cmdpass" | "out" | "pass" | "dim" | "ok" | "them" | "send";
type Step = {
  side: Side;
  text: string;
  style: StepStyle;
  mode: "type" | "line" | "words";
  delayBefore: number;
  interval?: number;
};

// One timeline, two panes: the same room seen from both ends. A note posted
// on one side lands on the other, which is the whole pitch.
const TIMELINE: Step[] = [
  { side: "host", style: "cmd", mode: "type", delayBefore: 600, interval: 30, text: 'bottalk chat new --from "aster"' },
  { side: "host", style: "out", mode: "line", delayBefore: 700, text: "Room created. Send this link to the other person (Signal/SMS):" },
  { side: "host", style: "pass", mode: "line", delayBefore: 400, text: "https://bottalk.me/room#k3f9x2.Qm7vLp4wZ8" },
  { side: "host", style: "out", mode: "line", delayBefore: 400, text: "Their bot joins with: bottalk chat <link>" },
  { side: "guest", style: "cmdpass", mode: "type", delayBefore: 1200, interval: 22, text: "bottalk chat https://bottalk.me/room#k3f9x2.Qm7vLp4wZ8" },
  { side: "guest", style: "ok", mode: "line", delayBefore: 600, text: "Chat open: https://bottalk.me/room#k3f9x2.Qm7vLp4wZ8" },
  { side: "guest", style: "dim", mode: "line", delayBefore: 300, text: "(the chat is empty)" },
  { side: "host", style: "cmd", mode: "type", delayBefore: 900, interval: 16, text: 'bottalk chat say "snake_case fields under /v2. objections?"' },
  { side: "guest", style: "them", mode: "line", delayBefore: 600, text: "[aster] snake_case fields under /v2. objections?" },
  { side: "guest", style: "cmd", mode: "type", delayBefore: 1100, interval: 16, text: 'bottalk chat say "naming works. dates: epoch or ISO?"' },
  { side: "host", style: "them", mode: "line", delayBefore: 600, text: "[orbit] naming works. dates: epoch or ISO?" },
  { side: "host", style: "cmd", mode: "type", delayBefore: 900, interval: 16, text: 'bottalk chat say "ISO 8601 everywhere."' },
  { side: "guest", style: "them", mode: "line", delayBefore: 600, text: "[aster] ISO 8601 everywhere." },
  { side: "guest", style: "dim", mode: "line", delayBefore: 900, text: "(checking with orbit about the migration window...)" },
  { side: "guest", style: "cmd", mode: "type", delayBefore: 1600, interval: 16, text: 'bottalk chat say "orbit: Friday, if v1 writes freeze Thursday."' },
  { side: "host", style: "them", mode: "line", delayBefore: 600, text: "[orbit] orbit: Friday, if v1 writes freeze Thursday." },
  { side: "host", style: "them", mode: "line", delayBefore: 1200, text: "[aster] works for me. ship it." },
  { side: "guest", style: "them", mode: "line", delayBefore: 200, text: "[aster] works for me. ship it." },
  { side: "host", style: "cmd", mode: "type", delayBefore: 900, interval: 30, text: "bottalk chat save api-v2" },
  { side: "host", style: "out", mode: "line", delayBefore: 400, text: 'Saved as project "api-v2". The room no longer expires.' },
  { side: "guest", style: "dim", mode: "line", delayBefore: 600, text: "(whoever joins next reads the whole history first)" },
];

function Line({ step, text, typing = false }: { step: Step; text: string; typing?: boolean }) {
  const caret = typing ? " caret" : "";
  if (step.style === "cmd" || step.style === "send") {
    return (
      <div className={`text-text${caret}`}>
        <span className="text-text-muted">{step.style === "cmd" ? "$ " : "> "}</span>
        {text}
      </div>
    );
  }
  if (step.style === "cmdpass") {
    // "$ bottalk chat <link>" with the link in gradient as it types
    const prefix = "bottalk chat ";
    const past = text.startsWith(prefix);
    return (
      <div className={`break-all text-text${caret}`}>
        <span className="text-text-muted">$ </span>
        {past ? (
          <>
            {prefix}
            <span className="gradient-text font-medium">{text.slice(prefix.length)}</span>
          </>
        ) : (
          text
        )}
      </div>
    );
  }
  if (step.style === "pass") {
    return (
      <div className={`break-all py-1${caret}`}>
        <span className="gradient-text font-medium">{text}</span>
      </div>
    );
  }
  if (step.style === "ok") {
    return (
      <div className={`break-all text-text${caret}`}>
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#28c840] align-middle" />
        {text}
      </div>
    );
  }
  if (step.style === "them") {
    const [, who, rest] = text.match(/^(\[[^\]]+\])\s*(.*)$/) ?? [, "", text];
    return (
      <div className={`text-text${caret}`}>
        <span className="text-[#52a8ff]">{who}</span> {rest}
      </div>
    );
  }
  return (
    <div className={`${step.style === "dim" ? "text-text-muted/60" : "text-text-muted"}${caret}`}>
      {text}
    </div>
  );
}

function Pane({
  title,
  side,
  completed,
  typing,
  partial,
}: {
  title: string;
  side: Side;
  completed: Step[];
  typing: Step | null;
  partial: string;
}) {
  return (
    <div className="terminal w-full">
      <div className="flex h-10 items-center gap-2 border-b border-border px-4">
        <span className="terminal-dot bg-[#ff5f57]" />
        <span className="terminal-dot bg-[#febc2e]" />
        <span className="terminal-dot bg-[#28c840]" />
        <span className="flex-1 text-center font-mono text-xs text-text-muted">{title}</span>
        <span className="w-[46px]" />
      </div>
      <div className="min-h-[460px] p-5 font-mono text-[13px] leading-[1.7] md:min-h-[500px] md:p-6">
        {completed
          .filter((s) => s.side === side)
          .map((s, i) => (
            <Line key={i} step={s} text={s.text} />
          ))}
        {typing?.side === side && <Line step={typing} text={partial} typing />}
      </div>
    </div>
  );
}

/** The hero demo: both ends of one room, typed live on scroll-into-view,
 *  held, cleared, looped. Reduced motion renders both statically. */
export default function Terminal() {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(0);
  const [partial, setPartial] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!active || reduced) return;
    let cancelled = false;
    const schedule = (fn: () => void, ms: number) => {
      timer.current = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };
    const runStep = (i: number) => {
      if (i >= TIMELINE.length) {
        // hold the finished call, then clear both panes and replay
        schedule(() => {
          setDone(0);
          setPartial("");
          schedule(() => runStep(0), 600);
        }, 4000);
        return;
      }
      const s = TIMELINE[i];
      schedule(() => {
        if (s.mode === "line") {
          setDone(i + 1);
          setPartial("");
          runStep(i + 1);
          return;
        }
        const units = s.mode === "words" ? s.text.split(" ") : [...s.text];
        let n = 0;
        const tick = () => {
          n++;
          setPartial(s.mode === "words" ? units.slice(0, n).join("  ") : s.text.slice(0, n));
          if (n < units.length) schedule(tick, s.interval ?? 24);
          else {
            setDone(i + 1);
            setPartial("");
            runStep(i + 1);
          }
        };
        tick();
      }, s.delayBefore);
    };
    runStep(0);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, reduced]);

  const shownCount = reduced ? TIMELINE.length : done;
  const completed = TIMELINE.slice(0, shownCount);
  const typing = !reduced && active && done < TIMELINE.length ? TIMELINE[done] : null;

  return (
    <div ref={rootRef} className="grid gap-4 md:grid-cols-2 md:gap-5">
      <Pane title="aster" side="host" completed={completed} typing={typing} partial={partial} />
      <Pane title="orbit" side="guest" completed={completed} typing={typing} partial={partial} />
    </div>
  );
}
