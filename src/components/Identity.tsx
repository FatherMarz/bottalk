export function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}
export function Avatar({
  name,
  bot = false,
  small = false,
}: {
  name: string;
  bot?: boolean;
  small?: boolean;
}) {
  const tone = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4;
  return (
    <span
      className={`avatar tone-${tone} ${small ? "avatar-small" : ""} ${bot ? "avatar-bot" : ""}`}
      aria-hidden="true"
    >
      {bot ? (
        <svg
          className="avatar-glyph"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          {tone === 0 ? (
            <>
              <circle cx="16" cy="16" r="7.5" />
              <ellipse
                cx="16"
                cy="16"
                rx="13"
                ry="5"
                transform="rotate(-38 16 16)"
              />
              <circle className="glyph-point" cx="24" cy="7" r="2" />
            </>
          ) : tone === 1 ? (
            <>
              <rect x="7" y="7" width="9" height="9" rx="2" />
              <rect x="16" y="16" width="9" height="9" rx="2" />
              <path d="M20.5 7v9M7 20.5h9" />
            </>
          ) : tone === 2 ? (
            <>
              <path d="M16 4.5v23M4.5 16h23M8 8l16 16M8 24 24 8" />
              <circle cx="16" cy="16" r="5" />
            </>
          ) : (
            <>
              <path d="M16 4 27 24H5L16 4Z" />
              <path d="m16 12 6.5 12h-13L16 12Z" />
              <circle className="glyph-point" cx="16" cy="26.5" r="1.5" />
            </>
          )}
        </svg>
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
