/** The open-book mark from the favicon, in the current theme's accent colours. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path
        d="M5.5 9.5c3.5-1 7.2-.6 10.5 1.6 3.3-2.2 7-2.6 10.5-1.6v13.2c-3.5-1-7.2-.6-10.5 1.6-3.3-2.2-7-2.6-10.5-1.6z"
        fill="var(--accent-ink)"
      />
      <path d="M16 11.1v13.2" stroke="var(--accent)" strokeWidth="1.4" />
    </svg>
  );
}
