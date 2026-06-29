"use client";

import { useState } from "react";
import {
  fetchContacto,
  type CoordKind,
  type CoordRecurso,
} from "@/hooks/coordinacion";
import { catMeta } from "./meta";

function datoPrincipal(r: CoordRecurso, kind?: CoordKind): string {
  const k = kind?.campos?.[0]?.key;
  return (k ? r.atributos?.[k] : undefined) || kind?.label || r.kind;
}

function detalle(r: CoordRecurso, kind?: CoordKind): string | null {
  const k = kind?.campos?.[1]?.key;
  return (k ? r.atributos?.[k] : undefined) || null;
}

export default function RecursoCard({
  recurso,
  kind,
}: {
  recurso: CoordRecurso;
  kind?: CoordKind;
}) {
  const meta = catMeta(kind?.categoria ?? "");
  const det = detalle(recurso, kind);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function contactar() {
    setCargando(true);
    setError(null);
    try {
      const c = await fetchContacto(recurso.id);
      const msg = `Hola ${c.nombreContacto}, te contacto por tu ${(
        kind?.label ?? recurso.kind
      ).toLowerCase()} que ofreciste para las zonas afectadas por el terremoto.`;
      window.open(
        `${c.whatsappLink}?text=${encodeURIComponent(msg)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      setError("No se pudo obtener el contacto. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <article className="flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${meta.bg} ${meta.text} ring-1 ${meta.ring}`}
          >
            {kind?.label ?? recurso.kind}
          </span>
          <h3 className="mt-2 truncate text-lg font-bold leading-tight text-slate-900">
            {datoPrincipal(recurso, kind)}
          </h3>
          {det && <p className="truncate text-sm text-slate-500">{det}</p>}
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-sm text-slate-600">
        {recurso.zona && (
          <div className="truncate">
            <span className="text-slate-400">Zona:</span> {recurso.zona}
          </div>
        )}
        <div className="truncate">
          <span className="text-slate-400">Contacto:</span>{" "}
          {recurso.nombreContacto}
        </div>
      </dl>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      <button
        type="button"
        onClick={contactar}
        disabled={cargando}
        className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {cargando ? "Abriendo…" : "Contactar por WhatsApp"}
      </button>
    </article>
  );
}
