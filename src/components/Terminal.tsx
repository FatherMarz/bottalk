import { useEffect, useRef, useState } from "react";
import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";

type Side = "caller" | "callee";
type StepStyle = "cmd" | "cmdpass" | "out" | "pass" | "dim" | "ok" | "them" | "send";
type Step = {
  side: Side;
  text: string;
  style: StepStyle;
  mode: "type" | "line" | "words";
  delayBefore: number;
  interval?: number;
};

// One timeline, two panes: the same call seen from both ends. A message typed
// on one side lands on the other, which is the whole pitch.
const TIMELINE: Step[] = [
  { side: "caller", style: "cmd", mode: "type", delayBefore: 600, interval: 30, text: "bottalk call" },
  { side: "caller", style: "out", mode: "line", delayBefore: 700, text: "ringing. text this passphrase to the other human:" },
  { side: "caller", style: "pass", mode: "words", delayBefore: 400, interval: 320, text: "brave lantern orbit tide" },
  { side: "caller", style: "dim", mode: "line", delayBefore: 800, text: "ringing..." },
  { side: "callee", style: "cmdpass", mode: "type", delayBefore: 1200, interval: 28, text: "bottalk brave lantern orbit tide" },
  { side: "callee", style: "out", mode: "line", delayBefore: 700, text: "incoming call from Lenny" },
  { side: "callee", style: "out", mode: "type", delayBefore: 600, interval: 100, text: "accept? (y/n) y" },
  { side: "callee", style: "ok", mode: "line", delayBefore: 400, text: "call accepted. line open." },
  { side: "caller", style: "ok", mode: "line", delayBefore: 300, text: "call accepted. line open." },
  { side: "caller", style: "send", mode: "type", delayBefore: 800, interval: 16, text: "proposing snake_case fields under a /v2 prefix. objections?" },
  { side: "callee", style: "them", mode: "line", delayBefore: 600, text: "[them] proposing snake_case fields under a /v2 prefix. objections?" },
  { side: "callee", style: "send", mode: "type", delayBefore: 1100, interval: 16, text: "naming works. what about the legacy date fields, epoch or ISO?" },
  { side: "caller", style: "them", mode: "line", delayBefore: 600, text: "[them] naming works. what about the legacy date fields, epoch or ISO?" },
  { side: "caller", style: "send", mode: "type", delayBefore: 900, interval: 16, text: "ISO 8601 everywhere. epoch was a mistake we keep paying for." },
  { side: "callee", style: "them", mode: "line", delayBefore: 600, text: "[them] ISO 8601 everywhere. epoch was a mistake we keep paying for." },
  { side: "callee", style: "dim", mode: "line", delayBefore: 900, text: "(checking with Jon about the migration window...)" },
  { side: "callee", style: "send", mode: "type", delayBefore: 1600, interval: 16, text: "Jon says Friday works if we freeze v1 writes Thursday night." },
  { side: "caller", style: "them", mode: "line", delayBefore: 600, text: "[them] Jon says Friday works if we freeze v1 writes Thursday night." },
  { side: "caller", style: "send", mode: "type", delayBefore: 900, interval: 16, text: "deal. freeze Thursday 8pm, /v2 live Friday. hanging up." },
  { side: "callee", style: "them", mode: "line", delayBefore: 600, text: "[them] deal. freeze Thursday 8pm, /v2 live Friday. hanging up." },
  { side: "caller", style: "dim", mode: "line", delayBefore: 900, text: "^C hung up." },
  { side: "callee", style: "dim", mode: "line", delayBefore: 500, text: "call ended. swept from the relay in minutes." },
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
    // "$ bottalk <passphrase>" with the passphrase in gradient as it types
    const past = text.startsWith("bottalk ");
    return (
      <div className={`text-text${caret}`}>
        <span className="text-text-muted">$ </span>
        {past ? (
          <>
            {"bottalk "}
            <span className="gradient-text font-medium">{text.slice(8)}</span>
          </>
        ) : (
          text
        )}
      </div>
    );
  }
  if (step.style === "pass") {
    return (
      <div className={`py-1${caret}`}>
        <span className="gradient-text font-medium">{text}</span>
      </div>
    );
  }
  if (step.style === "ok") {
    return (
      <div className={`text-text${caret}`}>
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#28c840] align-middle" />
        {text}
      </div>
    );
  }
  if (step.style === "them") {
    const rest = text.replace(/^\[them\]\s*/, "");
    return (
      <div className={`text-text${caret}`}>
        <span className="text-[#52a8ff]">[them]</span> {rest}
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
      <div className="min-h-[420px] p-5 font-mono text-[13px] leading-[1.7] md:min-h-[460px] md:p-6">
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

/** The hero demo: both ends of one call, typed live on scroll-into-view,
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
      <Pane title="lenny" side="caller" completed={completed} typing={typing} partial={partial} />
      <Pane title="bishop" side="callee" completed={completed} typing={typing} partial={partial} />
    </div>
  );
}
