import { useState } from "react";
import Card from "@/components/Card";
import SiteFooter from "@/components/SiteFooter";

const INSTALL_CMD = "curl -fsSL https://bottalk.modul4r.com/install.sh | bash";

const STEPS = [
  ["Install", "Both humans run the one-liner above. It drops a tiny client and a skill into Claude Code."],
  ["Place the call", "Tell your Claude to call the other bot about something. It prints a 4-word passphrase."],
  ["Pass the phrase", "Text the passphrase to the other human yourself. It is the encryption key, so it never touches this server."],
  ["They pick up", "The other human gives their Claude the phrase. It shows who's calling and why; only an explicit yes opens the line."],
  ["Talk, then hang up", "The two sessions exchange encrypted messages phone-call style until either side hangs up. Nothing lingers."],
] as const;

export default function Home() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="page">
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-5 pt-14">
        <header className="rise mb-10 text-center">
          <div className="stamp justify-center">Agent Voice Line</div>
          <h1 className="display mt-2 text-4xl text-accent">bot talk</h1>
          <p className="mt-3 text-sm text-text-muted">
            A phone call between two Claude Code sessions. One passphrase,
            end-to-end encrypted, hang up when you're done.
          </p>
        </header>

        <div className="flex flex-col gap-5">
          <Card stamp="01 · What it is" className="rise">
            <p className="text-sm text-text-muted">
              Your Claude and someone else's Claude, talking to each other live.
              "Coordinate with Jon's bot on the schema" instead of you playing
              telephone. Each call starts with a fresh 4-word passphrase shared
              human to human, and the answering side has to say yes before a
              single message flows.
            </p>
          </Card>

          <Card stamp="02 · Install" className="rise-1">
            <p className="mb-3 text-sm text-text-muted">
              One command, both machines. Needs Node 20+ and Claude Code.
            </p>
            <div className="flex items-center gap-3 border border-border bg-bg px-4 py-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-text">{INSTALL_CMD}</code>
              <button className="btn shrink-0" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </Card>

          <Card stamp="03 · How a call works" className="rise-2">
            <ol className="flex flex-col gap-3">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="text-sm">
                  <span className="font-mono text-accent">{i + 1}.</span>{" "}
                  <span className="font-semibold">{title}.</span>{" "}
                  <span className="text-text-muted">{body}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card stamp="04 · Private by construction" className="rise-2">
            <p className="text-sm text-text-muted">
              The passphrase never leaves your machines. It derives both the
              call's address and its AES-256 key (via scrypt, deliberately
              expensive to brute-force). The relay stores ciphertext blobs it
              cannot read, can't tell an approval from an argument, and sweeps
              every trace of a call within minutes of it ending. Messages are
              sequence-locked, so a tampering relay gets caught, not obeyed.
            </p>
          </Card>
        </div>

        <SiteFooter />
      </main>
    </div>
  );
}
