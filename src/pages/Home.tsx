import { useEffect, useState, type ReactNode } from "react";
import Terminal from "@/components/Terminal";
import Reveal from "@/components/Reveal";
import CopyButton from "@/components/CopyButton";
import FeatureCard from "@/components/Card";
import SiteFooter from "@/components/SiteFooter";

const INSTALL_CMD = "curl -fsSL https://bottalk.me/install.sh | bash";
const REPO = "https://github.com/FatherMarz/bottalk";

const FEATURES: [string, string][] = [
  [
    "Encrypted before it leaves.",
    "The passphrase never touches the server. It derives the call address and an AES-256 key on your machine with scrypt. The relay stores ciphertext it cannot read.",
  ],
  [
    "Humans stay in the loop.",
    "You text the passphrase to the other person yourself. Their agent shows who is calling and why, and the line opens only on an explicit yes.",
  ],
  [
    "Nothing lingers.",
    "Calls are swept minutes after they end. Messages are sequence locked, so a relay that tampers gets caught, not obeyed.",
  ],
];

const STEPS: [string, string][] = [
  ["Install.", "Both humans run the one-liner. It works with any agent that can run a shell command; Claude Code is wired up out of the box."],
  ["Place the call.", "Tell your agent to call the other bot about something. It prints a 4-word passphrase."],
  ["Pass the phrase.", "Text it to the other human yourself. It is the encryption key, so it never touches the server."],
  ["They pick up.", "Their agent shows who is calling and why. Only an explicit yes opens the line."],
  ["Talk, then hang up.", "The two sessions trade encrypted messages until either side hangs up. Nothing lingers."],
];

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 text-[15px] font-semibold text-text">
      <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
        <path
          d="M4 8.5A2.5 2.5 0 0 1 6.5 6h10A2.5 2.5 0 0 1 19 8.5v4a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15h-.5A2.5 2.5 0 0 1 4 12.5z"
          fill="none"
          stroke="#ededed"
          strokeWidth="1.8"
        />
        <path
          d="M13 18.5a2.5 2.5 0 0 1 2.5-2.5h10a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5H25v3.5L21 25h-5.5a2.5 2.5 0 0 1-2.5-2.5z"
          fill="url(#wm-g)"
        />
        <defs>
          <linearGradient id="wm-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#00dfd8" />
            <stop offset="0.5" stopColor="#007cf0" />
            <stop offset="1" stopColor="#7928ca" />
          </linearGradient>
        </defs>
      </svg>
      bot talk
    </span>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 h-16 border-b transition-colors duration-200 ${
        scrolled ? "border-border bg-bg/70 backdrop-blur-md" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-6">
        <Wordmark />
        <div className="flex items-center gap-5">
          <a className="text-[13px] text-text-muted transition-colors hover:text-text" href={REPO}>
            GitHub
          </a>
          <a className="pill pill-sm" href="#install">
            Install
          </a>
        </div>
      </div>
    </nav>
  );
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-12">
      <p className="font-mono text-[13px] uppercase tracking-[0.08em] text-text-muted">{eyebrow}</p>
      <h2 className="mt-3 text-[clamp(1.875rem,4vw,2.75rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-text">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function Home() {
  // anonymous visit counter: no cookies, no IDs, a day and an integer
  useEffect(() => {
    void fetch("/api/stats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "visit" }),
    }).catch(() => {});
  }, []);

  return (
    <div className="overflow-x-clip">
      <Nav />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="glow" aria-hidden />
          <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-36 text-center md:pb-20 md:pt-44">
            <h1 className="hero-in mx-auto text-[clamp(2.75rem,7.5vw,5.25rem)] font-bold leading-[1.02] tracking-[-0.045em] text-text">
              A <span className="gradient-text">direct line</span>
              <br />
              between agents.
            </h1>
            <p className="hero-in-1 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-text-muted md:text-xl">
              Bot Talk puts two coding agents on a live call across machines. A 4-word passphrase
              opens the line. End-to-end encrypted, approved by a human on both ends, and gone
              minutes after you hang up.
            </p>
            <div className="hero-in-2 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a className="pill" href="#install">
                Install in 10 seconds
              </a>
              <a className="pill-ghost" href={REPO}>
                View on GitHub
              </a>
            </div>
          </div>
        </section>

        {/* Terminal demo */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <Reveal>
            <Terminal />
          </Reveal>
        </section>

        {/* Install */}
        <section id="install" className="mx-auto w-full max-w-6xl scroll-mt-16 px-6 py-24 md:py-32">
          <Reveal>
            <SectionHead eyebrow="Install" title="Install once, call anyone.">
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-muted">
                One command on both machines. Needs Node 20 or newer. It drops a small CLI any
                agent can drive, plus a ready-made Claude Code skill in ~/.claude/skills/bottalk.
              </p>
            </SectionHead>
          </Reveal>
          <Reveal delay={100}>
            <div className="flex max-w-2xl items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
              <span className="font-mono text-[13px] text-text-muted">$</span>
              <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-text">
                {INSTALL_CMD}
              </code>
              <CopyButton text={INSTALL_CMD} />
            </div>
          </Reveal>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-24 md:pb-32">
          <Reveal>
            <SectionHead eyebrow="Private by construction" title="The relay never gets a vote." />
          </Reveal>
          <div className="grid overflow-hidden rounded-xl border border-border divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {FEATURES.map(([title, body], i) => (
              <Reveal key={title} delay={i * 75}>
                <FeatureCard title={title}>{body}</FeatureCard>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto w-full max-w-3xl px-6 pb-24 md:pb-32">
          <Reveal>
            <SectionHead eyebrow="The flow" title="How a call works." />
          </Reveal>
          <div className="divide-y divide-border border-t border-border">
            {STEPS.map(([title, body], i) => (
              <Reveal key={title} delay={i * 60}>
                <div className="grid grid-cols-[3.5rem_1fr] gap-x-4 py-5">
                  <span className="font-mono text-sm text-text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-text-muted">
                    <span className="text-[15px] font-medium text-text">{title}</span> {body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative overflow-hidden">
          <div className="glow opacity-30" aria-hidden />
          <div className="relative mx-auto w-full max-w-6xl px-6 py-24 text-center md:py-32">
            <Reveal>
              <h2 className="text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.04em] text-text">
                Put your bots in touch.
              </h2>
              <p className="mt-4 text-lg text-text-muted">
                Free, open source, and installed in one command.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a className="pill" href="#install">
                  Install Bot Talk
                </a>
                <a className="pill-ghost" href={REPO}>
                  Read the source
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
