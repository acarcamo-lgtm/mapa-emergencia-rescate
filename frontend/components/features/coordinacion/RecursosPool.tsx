"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCoordKinds, useCoordPool } from "@/hooks/coordinacion";
import { catMeta } from "./meta";
import RecursoCard from "./RecursoCard";
import OfrecerForm from "./OfrecerForm";

export default function RecursosPool() {
  const { data: kinds = [], isLoading: loadingKinds } = useCoordKinds();
  const { data: recursos = [], isLoading: loadingPool, isError } = useCoordPool();

  const [filtro, setFiltro] = useState<string>("todos");
  const [ofreciendo, setOfreciendo] = useState(false);

  const kindsMap = useMemo(
    () => new Map(kinds.map((k) => [k.key, k])),
    [kinds],
  );
  const catDeKind = useMemo(
    () => new Map(kinds.map((k) => [k.key, k.categoria])),
    [kinds],
  );

  const categorias = useMemo(() => {
    const orden: string[] = [];
    for (const k of kinds) if (!orden.includes(k.categoria)) orden.push(k.categoria);
    const presentes = new Set(
      recursos.map((r) => catDeKind.get(r.kind) ?? "otro"),
    );
    return orden.filter((c) => presentes.has(c));
  }, [kinds, recursos, catDeKind]);

  const visibles =
    filtro === "todos"
      ? recursos
      : recursos.filter((r) => catDeKind.get(r.kind) === filtro);

  const cargando = loadingKinds || loadingPool;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Coordinación de recursos privados
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Para recursos de <strong>alto valor que necesitan coordinarse</strong>{" "}
          para llegar y operar: maquinaria pesada, fletes, combustible, plantas
          eléctricas, cisternas, operadores. Sin cuenta, solo tu nombre y
          WhatsApp.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-slate-500">
          ¿Tenés alimentos, agua, ropa o medicinas para donar? Eso va a los{" "}
          <Link href="/acopio" className="font-semibold text-sky-700 underline">
            centros de acopio
          </Link>
          , no acá.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <div className="rounded-xl bg-slate-900 px-4 py-2 text-white">
            <span className="text-xl font-extrabold">{recursos.length}</span>{" "}
            <span className="text-sm text-slate-300">
              {recursos.length === 1
                ? "recurso disponible"
                : "recursos disponibles"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOfreciendo((v) => !v)}
            className="rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white transition hover:bg-sky-700"
          >
            {ofreciendo ? "Cerrar" : "Ofrecer recurso"}
          </button>
        </div>
      </header>

      {ofreciendo && (
        <div className="mb-6">
          <OfrecerForm kinds={kinds} onDone={() => setOfreciendo(false)} />
        </div>
      )}

      {/* Filtros por categoría */}
      {categorias.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[{ key: "todos", label: "Todos" }, ...categorias.map((c) => ({ key: c, label: catMeta(c).label }))].map(
            (f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltro(f.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  filtro === f.key
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {f.label}
              </button>
            ),
          )}
        </div>
      )}

      {cargando && (
        <p className="py-12 text-center text-sm text-slate-500">Cargando…</p>
      )}
      {isError && (
        <p className="rounded-xl bg-red-50 p-4 text-center text-sm text-red-700">
          No se pudieron cargar los recursos.
        </p>
      )}
      {!cargando && !isError && visibles.length === 0 && (
        <p className="py-12 text-center text-sm text-slate-500">
          Todavía no hay recursos en esta categoría. Sé el primero en ofrecer.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((r) => (
          <RecursoCard key={r.id} recurso={r} kind={kindsMap.get(r.kind)} />
        ))}
      </div>
    </section>
  );
}
