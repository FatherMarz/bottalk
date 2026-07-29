import { useRef, type ReactNode, type MouseEvent } from "react";

/** Feature cell with a cursor-following spotlight (desktop pointers only;
 *  coordinates go through CSS vars on the node, so no React re-renders). */
export default function FeatureCard({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div ref={ref} onMouseMove={onMove} className="spotlight-card p-8">
      <h3 className="text-base font-medium tracking-tight text-text">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">{children}</p>
    </div>
  );
}
