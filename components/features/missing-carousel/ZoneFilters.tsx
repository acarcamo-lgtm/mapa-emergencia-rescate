"use client";

export type PersonStatusFilter = "all" | "active" | "found";

interface ZoneFiltersProps {
  filter: PersonStatusFilter;
  onChange: (filter: PersonStatusFilter) => void;
}

/**
 * Filtros de estado de personas (Todas / Desaparecidas / Encontradas).
 * UI verbatim del carousel: cada chip conserva su color (slate/ámbar/azul).
 */
export function ZoneFilters({ filter, onChange }: ZoneFiltersProps) {
  return (
    <div className="my-3 flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        aria-pressed={filter === "all"}
        onClick={() => onChange("all")}
        className={
          filter === "all"
            ? "inline-flex items-center rounded-md border px-3 py-1 text-xs font-semibold transition-colors border-slate-300 bg-slate-100 text-slate-800"
            : "inline-flex items-center rounded-md border px-3 py-1 text-xs font-semibold transition-colors border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        }
      >
        Todas
      </button>
      <button
        type="button"
        aria-pressed={filter === "active"}
        onClick={() => onChange("active")}
        className={
          filter === "active"
            ? "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold transition-colors border-amber-300 bg-amber-50 text-amber-800"
            : "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold transition-colors border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        }
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${filter === "active" ? "bg-amber-500" : "bg-amber-500/50"}`}
          aria-hidden
        />
        Desaparecidas
      </button>
      <button
        type="button"
        aria-pressed={filter === "found"}
        onClick={() => onChange("found")}
        className={
          filter === "found"
            ? "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold transition-colors border-blue-300 bg-blue-50 text-blue-800"
            : "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold transition-colors border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        }
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${filter === "found" ? "bg-blue-500" : "bg-blue-500/50"}`}
          aria-hidden
        />
        Encontradas
      </button>
    </div>
  );
}
