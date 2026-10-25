'use client';

/** How many history rows a section shows before "View more". */
export const PREVIEW_LIMIT = 10;

/** Toggle button under a history list; renders nothing when everything already fits. */
export function ViewMoreButton({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  if (total <= PREVIEW_LIMIT) return null;
  return (
    <button
      onClick={onToggle}
      className="mt-4 w-full rounded-lg border border-[var(--border)] py-2 text-xs uppercase tracking-wider text-[var(--chalk-dim)] hover:text-[var(--chalk)] transition-colors"
    >
      {expanded ? 'Show less' : `View more (${total - PREVIEW_LIMIT})`}
    </button>
  );
}
