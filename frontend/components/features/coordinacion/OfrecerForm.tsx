"use client";

import { useMemo, useState } from "react";
import { useTurnstile } from "@/hooks/useTurnstile";
import {
  useOfrecerRecurso,
  type CoordKind,
} from "@/hooks/coordinacion";
import { catMeta } from "./meta";

const inputClass =
  "w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-400 focus:outline-none";

export default function OfrecerForm({
  kinds,
  onDone,
}: {
  kinds: CoordKind[];
  onDone: () => void;
}) {
  const { mountRef: turnstileMount, getToken: turnstileGetToken } =
    useTurnstile();
  const ofrecer = useOfrecerRecurso();

  const [kind, setKind] = useState<CoordKind | null>(null);
  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [zona, setZona] = useState("");
  const [atributos, setAtributos] = useState<Record<string, string>>({});

  const porCategoria = useMemo(() => {
    const grupos: { categoria: string; kinds: CoordKind[] }[] = [];
    for (const k of kinds) {
      let g = grupos.find((x) => x.categoria === k.categoria);
      if (!g) {
        g = { categoria: k.categoria, kinds: [] };
        grupos.push(g);
      }
      g.kinds.push(k);
    }
    return grupos;
  }, [kinds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;
    const limpios: Record<string, string> = {};
    for (const campo of kind.campos) {
      const v = (atributos[campo.key] ?? "").trim();
      if (v) limpios[campo.key] = v;
    }
    const turnstileToken = await turnstileGetToken();
    ofrecer.mutate(
      {
        kind: kind.key,
        nombre: nombre.trim(),
        whatsapp: whatsapp.trim(),
        zona: zona.trim() || undefined,
        atributos: limpios,
        turnstileToken,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      {!kind ? (
        <div className="space-y-4">
          <p className="font-semibold text-slate-800">¿Qué podés aportar?</p>
          {porCategoria.map((g) => (
            <div key={g.categoria}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {catMeta(g.categoria).label}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.kinds.map((k) => (
                  <button
                    type="button"
                    key={k.key}
                    onClick={() => {
                      setKind(k);
                      setAtributos({});
                    }}
                    className="rounded-xl bg-white px-4 py-3 text-left font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:ring-slate-300"
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={onDone}
            className="text-sm font-semibold text-slate-500 underline"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <button
            type="button"
            onClick={() => setKind(null)}
            className="text-sm font-semibold text-slate-500 underline"
          >
            ← Cambiar tipo ({kind.label})
          </button>

          {kind.campos.map((campo) => (
            <label key={campo.key} className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                {campo.label}
                {!campo.required && " (opcional)"}
              </span>
              <input
                className={inputClass}
                placeholder={campo.placeholder}
                required={campo.required}
                value={atributos[campo.key] ?? ""}
                onChange={(e) =>
                  setAtributos((a) => ({ ...a, [campo.key]: e.target.value }))
                }
              />
            </label>
          ))}

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Tu nombre
            </span>
            <input
              className={inputClass}
              placeholder="Nombre y apellido"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              WhatsApp
            </span>
            <input
              className={inputClass}
              type="tel"
              placeholder="+58 412 1234567"
              required
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Zona / ubicación actual (opcional)
            </span>
            <input
              className={inputClass}
              placeholder="Dónde está el recurso hoy"
              value={zona}
              onChange={(e) => setZona(e.target.value)}
            />
          </label>

          <p className="text-xs leading-relaxed text-slate-500">
            Al publicar, tu nombre y WhatsApp quedan visibles para que puedan
            contactarte.
          </p>

          {/* Cloudflare Turnstile (prueba de humanidad) */}
          <div ref={turnstileMount} className="flex justify-center empty:hidden" />

          {ofrecer.isError && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              No se pudo publicar. Revisá los datos e intentá de nuevo.
            </p>
          )}

          <button
            type="submit"
            disabled={ofrecer.isPending}
            className="w-full rounded-xl bg-sky-600 px-4 py-3 font-bold text-white transition hover:bg-sky-700 disabled:opacity-60"
          >
            {ofrecer.isPending ? "Publicando…" : "Publicar recurso"}
          </button>
        </form>
      )}
    </div>
  );
}
