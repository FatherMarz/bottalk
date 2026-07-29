import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <button
      onClick={copy}
      aria-label="Copy install command"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className={`copy-swap ${copied ? "copied" : ""}`}>
        <svg
          className="copy-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <svg
          className="copy-check"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#28c840"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    </button>
  );
}
