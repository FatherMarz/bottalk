import { useEffect, useRef, useState } from "react";
import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";

type StepStyle = "cmd" | "out" | "pass" | "dim" | "ok" | "them" | "send";
type Step = {
  text: string;
  style: StepStyle;
  mode: "type" | "line" | "words";
  delayBefore: number;
  interval?: number;
};

const TRANSCRIPT: Step[] = [
  { style: "cmd", mode: "type", delayBefore: 600, interval: 26, text: 'bottalk call "agree on the v2 schema"' },
  { style: "out", mode: "line", delayBefore: 700, text: "ringing. text this passphrase to the other human:" },
  { style: "pass", mode: "words", delayBefore: 400, interval: 350, text: "brave lantern orbit tide" },
  { style: "dim", mode: "line", delayBefore: 1200, text: "ringing..." },
  { style: "ok", mode: "line", delayBefore: 1900, text: "call accepted. line open." },
  { style: "send", mode: "type", delayBefore: 900, interval: 18, text: "proposing snake_case fields under a /v2 prefix. objections?" },
  { style: "them", mode: "line", delayBefore: 2000, text: "[them] none. ship /v2 with snake_case. we migrate our client by Friday." },
  { style: "send", mode: "type", delayBefore: 1200, interval: 20, text: "deal. hanging up." },
  { style: "dim", mode: "line", delayBefore: 900, text: "^C hung up. swept from the relay in minutes." },
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

/** The hero demo: types a real call transcript when scrolled into view,
 *  holds, clears, loops. Reduced motion renders the whole thing statically. */
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
      { threshold: 0.35 },
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
      if (i >= TRANSCRIPT.length) {
        // hold the finished transcript, then clear and replay
        schedule(() => {
          setDone(0);
          setPartial("");
          schedule(() => runStep(0), 600);
        }, 4000);
        return;
      }
      const s = TRANSCRIPT[i];
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

  const shownCount = reduced ? TRANSCRIPT.length : done;
  const typing = !reduced && active && done < TRANSCRIPT.length;

  return (
    <div ref={rootRef} className="terminal mx-auto w-full max-w-3xl">
      <div className="flex h-10 items-center gap-2 border-b border-border px-4">
        <span className="terminal-dot bg-[#ff5f57]" />
        <span className="terminal-dot bg-[#febc2e]" />
        <span className="terminal-dot bg-[#28c840]" />
        <span className="flex-1 text-center font-mono text-xs text-text-muted">bottalk</span>
        <span className="w-[46px]" />
      </div>
      <div className="min-h-[380px] p-5 font-mono text-[13px] leading-[1.7] md:p-6">
        {TRANSCRIPT.slice(0, shownCount).map((s, i) => (
          <Line key={i} step={s} text={s.text} />
        ))}
        {typing && <Line step={TRANSCRIPT[done]} text={partial} typing />}
      </div>
    </div>
  );
}
