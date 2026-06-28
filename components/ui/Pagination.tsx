"use client";

/**
 * Paginación presentacional (sin datos). Ventana compacta de páginas alrededor
 * de la actual. JSX/Tailwind verbatim del patrón canónico (MissingPersons) para
 * que el look sea idéntico donde se reutilice.
 */
import { memo } from "react";

/** Ventana compacta de números de página alrededor de la página actual. */
export function pageWindow(page: number, totalPages: number): number[] {
  const span = 2;
  const start = Math.max(1, Math.min(page - span, totalPages - span * 2));
  const end = Math.min(totalPages, Math.max(page + span, span * 2 + 1));
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
}

function PaginationImpl({
  page,
  totalPages,
  onPageChange,
  ariaLabel = "Paginación",
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(page, totalPages);
  const first = pages[0] ?? 1;
  const last = pages[pages.length - 1] ?? totalPages;

  return (
    <nav
      className="mt-6 flex flex-wrap items-center justify-center gap-1.5"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
      >
        ← Anterior
      </button>
      {first > 1 && (
        <>
          <button
            type="button"
            onClick={() => onPageChange(1)}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            1
          </button>
          {first > 2 && <span className="px-1 text-slate-400">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          aria-current={p === page ? "page" : undefined}
          className={
            p === page
              ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
              : "rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          }
        >
          {p}
        </button>
      ))}
      {last < totalPages && (
        <>
          {last < totalPages - 1 && (
            <span className="px-1 text-slate-400">…</span>
          )}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
      >
        Siguiente →
      </button>
    </nav>
  );
}

export const Pagination = memo(PaginationImpl);
export default Pagination;
