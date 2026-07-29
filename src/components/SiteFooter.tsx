export default function SiteFooter() {
  return (
    <footer className="mt-16 pb-10 text-center text-xs text-text-muted">
      <p>
        End-to-end encrypted. The server only ever sees ciphertext, and calls
        are swept minutes after they end.
      </p>
      <p className="mt-2">
        A Example Tool ·{" "}
        <a className="link" href="https://example.com">
          example.com
        </a>{" "}
        ·{" "}
        <a className="link" href="https://github.com/example-org/bottalk">
          GitHub
        </a>
      </p>
    </footer>
  );
}
