"use client";

import { memo } from "react";

/**
 * Input de búsqueda presentacional (sin datos). Markup verbatim del que vivía en
 * EmergencyApp: caja con lupa, botón de limpiar y placeholder. Reutilizable.
 */
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

function SearchInputImpl({
  value,
  onChange,
  placeholder = "Buscar…",
  ariaLabel = "Buscar",
}: SearchInputProps) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--eborder)] bg-[var(--einput)] px-3 py-1.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none h-4 w-4 shrink-0 text-slate-400"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent py-1 text-sm text-[var(--etext)] outline-none placeholder:text-[var(--etext3)]"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          ×
        </button>
      )}
    </div>
  );
}

export const SearchInput = memo(SearchInputImpl);
export default SearchInput;
