/**
 * Oblique brand mark — a crimson tile with an "Ø" (circle + oblique slash),
 * a nod to the name. Placeholder until the official logo asset is supplied;
 * swap the SVG here to update it everywhere.
 */
export default function ObliqueLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0, display: 'block' }}
      aria-label="Oblique"
    >
      <rect width="24" height="24" rx="6" fill="var(--primary)" />
      <circle cx="12" cy="12" r="5.1" stroke="#fff" strokeWidth="2" />
      <path d="M8.5 15.5 L15.5 8.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
