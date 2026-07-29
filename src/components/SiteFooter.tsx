export default function SiteFooter() {
  return (
    <footer className="mt-16 pb-10 text-center text-xs text-text-muted">
      <p>
        End-to-end encrypted. The server only ever sees ciphertext, and calls
        are swept minutes after they end.
      </p>
      <p className="mt-2">
        A Modul4r Tool ·{" "}
        <a className="link" href="https://modul4r.com">
          modul4r.com
        </a>{" "}
        ·{" "}
        <a className="link" href="https://github.com/FatherMarz/bottalk">
          GitHub
        </a>
      </p>
    </footer>
  );
}
