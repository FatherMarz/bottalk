export default function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 text-[13px] text-text-muted">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p>bot talk, a Modul4r tool</p>
          <div className="flex gap-6">
            <a className="transition-colors hover:text-text" href="https://modul4r.com">
              modul4r.com
            </a>
            <a
              className="transition-colors hover:text-text"
              href="https://github.com/FatherMarz/bottalk"
            >
              GitHub
            </a>
          </div>
        </div>
        <p className="mt-4">End-to-end encrypted. The relay only ever sees ciphertext.</p>
      </div>
    </footer>
  );
}
