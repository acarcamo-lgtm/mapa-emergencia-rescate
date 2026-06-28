"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MissingPersonForm, {
  type MissingPersonPayload,
} from "./MissingPersonForm";
import MissingPersonDetail from "./MissingPersonDetail";
import { useLowBandwidthMode } from "./useLowBandwidthMode";
import {
  trackMissingReportAfterNoResults,
  trackMissingReportStarted,
  trackPersonDetailViewed,
  trackPersonSearchResultsLoaded,
  trackPersonSearchStarted,
} from "./analytics";
import { timeAgo } from "@/lib/format";
import { apiSend } from "@/lib/api-client";
import { useApiList } from "@/lib/hooks-client";

// ============================================================================
// PATRÓN CANÓNICO de componente de lista (seguir en los demás):
//   - Los DATOS (fetch, polling, dedup, identidad) viven en useApiList.
//   - El componente solo: arma la URL, renderiza, y hace MUTACIONES (POST/DELETE)
//     con apiSend + patchLocal optimista. Cero fetch/setInterval a mano.
// ============================================================================

interface MissingPerson {
  id: string;
  name: string;
  age: number | null;
  nationality?: string;
  description: string;
  lastSeen: string;
  contact: string;
  photoUrl: string | null;
  status?: "active" | "found";
  resolutionNote?: string | null;
  resolutionPhotoUrl?: string | null;
  resolvedAt?: number | null;
  createdAt: number;
}

const POLL_INTERVAL_MS = 8000;
const LOW_BANDWIDTH_POLL_INTERVAL_MS = 45_000;
const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 48;
// Mínimo de caracteres para buscar (espeja MIN_SEARCH_LEN del servidor): por
// debajo, el índice trigram no aplica y haríamos un seq scan completo.
const MIN_SEARCH_LEN = 3;
const ADMIN_STORAGE_KEY = "emergency:adminToken";

function extractPhone(contact: string): string | null {
  const digits = contact.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? digits : null;
}

/** Ventana compacta de números de página alrededor de la página actual. */
function pageWindow(page: number, totalPages: number): number[] {
  const span = 2;
  const start = Math.max(1, Math.min(page - span, totalPages - span * 2));
  const end = Math.min(totalPages, Math.max(page + span, span * 2 + 1));
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

function buildUrl(page: number, search: string): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (search.length >= MIN_SEARCH_LEN) params.set("q", search);
  return `/api/missing?${params.toString()}`;
}

export default function MissingPersons() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<MissingPerson | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const lastTrackedSearchRef = useRef("");
  const lastTrackedResultsRef = useRef("");
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const initialPageRef = useRef(true);

  const network = useLowBandwidthMode(
    POLL_INTERVAL_MS,
    LOW_BANDWIDTH_POLL_INTERVAL_MS,
  );

  const search = debouncedQuery.trim();
  const url = buildUrl(page, search);

  const {
    items: people,
    total,
    totalPages,
    totalCapped,
    persistent,
    serverPage,
    fetching,
    refetch,
    patchLocal,
    setTotalLocal,
  } = useApiListMissing(url, network.pollIntervalMs);

  // Token admin: lo leemos al montar y cuando vuelve el foco (login en otra parte).
  useEffect(() => {
    const read = () => setAdminToken(sessionStorage.getItem(ADMIN_STORAGE_KEY));
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);

  // Debounce de búsqueda: al cambiar el término, vuelve a la página 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // El server acota la página al rango válido (p.ej. tras borrados): seguirlo.
  useEffect(() => {
    if (serverPage != null && serverPage !== page) setPage(serverPage);
  }, [serverPage, page]);

  // Marca de tiempo "actualizada hace X" cuando llega una respuesta de fondo.
  useEffect(() => {
    if (!fetching) setLastFetchAt(Date.now());
  }, [fetching]);

  // Tick del indicador "hace X" cada 5 s sin pedir red.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  // Analítica: búsqueda iniciada.
  useEffect(() => {
    if (!search || lastTrackedSearchRef.current === search) return;
    lastTrackedSearchRef.current = search;
    trackPersonSearchStarted("missing_persons", true);
  }, [search]);

  // Analítica: resultados de búsqueda cargados.
  useEffect(() => {
    if (!search) return;
    const key = `${search}:${page}:${total}`;
    if (lastTrackedResultsRef.current === key) return;
    lastTrackedResultsRef.current = key;
    trackPersonSearchResultsLoaded({
      source: "missing_persons",
      resultsCount: total,
      page,
    });
  }, [search, page, total]);

  // Scroll al inicio al cambiar de página (no en la carga inicial).
  useEffect(() => {
    if (initialPageRef.current) {
      initialPageRef.current = false;
      return;
    }
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  // Abrir el formulario desde el hash #reportar-desaparecido.
  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#reportar-desaparecido") {
        setShowForm(true);
        document
          .getElementById("e-directory")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const handleSubmit = useCallback(
    async (payload: MissingPersonPayload) => {
      await apiSend("POST", "/api/missing", payload);
      setShowForm(false);
      // El nuevo reporte es el más reciente: volvemos al inicio para verlo.
      setQuery("");
      setDebouncedQuery("");
      setPage(1);
      refetch(true);
    },
    [refetch],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!adminToken) return;
      // Optimista: quita la tarjeta y baja el total ya; resync al terminar.
      patchLocal((prev) => prev.filter((p) => p.id !== id));
      setTotalLocal((t) => Math.max(0, t - 1));
      setSelected((cur) => (cur?.id === id ? null : cur));
      try {
        await apiSend("DELETE", `/api/missing/${id}`);
      } catch {
        /* el refetch corrige si falló */
      }
      refetch();
    },
    [adminToken, patchLocal, setTotalLocal, refetch],
  );

  const handleMarkFound = useCallback(
    async (id: string, payload: { note: string; photo: string | null }) => {
      await apiSend("POST", `/api/missing/${id}/found`, payload);
      // Sale de la lista pública (activas).
      patchLocal((prev) => prev.filter((p) => p.id !== id));
      setTotalLocal((t) => Math.max(0, t - 1));
      setSelected(null);
      refetch();
    },
    [patchLocal, setTotalLocal, refetch],
  );

  const pages = useMemo(() => pageWindow(page, totalPages), [page, totalPages]);
  const isSearching = search.length >= MIN_SEARCH_LEN;
  const queryTooShort = search.length > 0 && search.length < MIN_SEARCH_LEN;

  return (
    <div ref={listTopRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                🧍 Personas desaparecidas
              </h2>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800"
                aria-label={`${total} personas reportadas`}
                title="Total de personas reportadas"
              >
                {total} reportada{total === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Lista de personas que se buscan tras el terremoto. Si reconoces a
              alguien o tienes información, contacta a la persona indicada.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>
                {lastFetchAt
                  ? `Actualizada ${timeAgo(lastFetchAt, now)}`
                  : "Actualizando…"}
              </span>
              <button
                type="button"
                onClick={() => refetch(true)}
                disabled={fetching}
                className="rounded-md border border-slate-200 px-2 py-0.5 font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {fetching ? "🔄 Cargando…" : "🔄 Refrescar"}
              </button>
            </div>
          </div>
          {!isSearching && (
            <button
              type="button"
              onClick={() => {
                trackMissingReportStarted("missing_persons_header");
                setShowForm(true);
              }}
              className="shrink-0 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
            >
              + Reportar desaparecida
            </button>
          )}
        </div>

        <div className="relative mt-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, zona o descripción…"
            aria-label="Buscar personas desaparecidas"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-900"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔎
          </span>
        </div>

        {queryTooShort && (
          <p className="mt-3 text-xs font-medium text-slate-500">
            Escribe al menos {MIN_SEARCH_LEN} letras para buscar.
          </p>
        )}

        {isSearching && (
          <p
            aria-live="polite"
            className="mt-3 text-xs font-medium text-slate-500"
          >
            {totalCapped ? `${total}+` : total} resultado{total === 1 ? "" : "s"} para “{search}”
          </p>
        )}

        {people.length === 0 ? (
          <div className="mt-6 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            <p>
              {isSearching
                ? `No se encontraron personas para “${search}”.`
                : "Aún no hay personas reportadas. Usa el botón para agregar la primera."}
            </p>
            {isSearching && (
              <button
                type="button"
                onClick={() => {
                  trackMissingReportAfterNoResults("missing_empty_state");
                  trackMissingReportStarted("missing_empty_state");
                  setShowForm(true);
                }}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Reportar desaparecida
              </button>
            )}
          </div>
        ) : (
          <>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((person) => {
                const phone = extractPhone(person.contact);
                const personMeta = [
                  person.age !== null ? `${person.age} años` : null,
                  person.nationality || null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={person.id}
                    className="relative overflow-hidden rounded-xl border border-slate-200 transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        trackPersonDetailViewed({
                          status: person.status,
                          hasPhoto: Boolean(person.photoUrl),
                          source: "missing_card",
                        });
                        setSelected(person);
                      }}
                      aria-label={`Ver detalle de ${person.name}`}
                      className="flex w-full gap-3 p-3 text-left transition active:bg-slate-50"
                    >
                      {person.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={person.photoUrl}
                          alt={`Foto de ${person.name}`}
                          loading="lazy"
                          className="h-24 w-24 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                        />
                      ) : (
                        <div className="grid h-24 w-24 shrink-0 place-items-center rounded-lg bg-slate-100 text-3xl text-slate-400">
                          🧍
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="pr-6 font-semibold text-slate-900">
                          {person.name}
                          {personMeta && (
                            <span className="font-normal text-slate-500">
                              {" "}
                              · {personMeta}
                            </span>
                          )}
                        </p>
                        {person.lastSeen && (
                          <p className="mt-0.5 text-xs text-slate-600">
                            📍 {person.lastSeen}
                          </p>
                        )}
                        {person.description && (
                          <p className="mt-1 line-clamp-3 text-xs text-slate-600">
                            {person.description}
                          </p>
                        )}
                        {person.contact &&
                          (phone ? (
                            <a
                              href={`tel:${phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 inline-block text-xs font-medium text-red-700 hover:underline"
                            >
                              📞 {person.contact}
                            </a>
                          ) : (
                            <p className="mt-1 text-xs font-medium text-slate-700">
                              {person.contact}
                            </p>
                          ))}
                        <p className="mt-1 text-[11px] text-slate-400">
                          Toca para ver más
                        </p>
                      </div>
                    </button>
                    {adminToken && (
                      <button
                        type="button"
                        onClick={() => handleDelete(person.id)}
                        aria-label="Eliminar reporte"
                        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-white/80 text-slate-400 backdrop-blur hover:bg-red-50 hover:text-red-600"
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <nav
                className="mt-6 flex flex-wrap items-center justify-center gap-1.5"
                aria-label="Paginación de personas desaparecidas"
              >
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  ← Anterior
                </button>
                {pages[0] > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPage(1)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      1
                    </button>
                    {pages[0] > 2 && (
                      <span className="px-1 text-slate-400">…</span>
                    )}
                  </>
                )}
                {pages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
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
                {pages[pages.length - 1] < totalPages && (
                  <>
                    {pages[pages.length - 1] < totalPages - 1 && (
                      <span className="px-1 text-slate-400">…</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPage(totalPages)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  Siguiente →
                </button>
              </nav>
            )}
            <p className="mt-3 text-center text-[11px] text-slate-400">
              Página {page} de {totalPages}
            </p>
          </>
        )}

        {!persistent && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Modo demo: los reportes no se están guardando de forma permanente.
          </p>
        )}

        {showForm && (
          <MissingPersonForm
            onCancel={() => setShowForm(false)}
            onSubmit={handleSubmit}
          />
        )}

        {selected && (
          <MissingPersonDetail
            person={selected}
            people={people}
            onNavigate={setSelected}
            onClose={() => setSelected(null)}
            onMarkFound={(payload) => handleMarkFound(selected.id, payload)}
          />
        )}
      </div>
  );
}

/** Envuelve useApiList fijando el selector y exponiendo un setter de total local
 *  para las mutaciones optimistas (delete / mark-found bajan el contador ya). */
function useApiListMissing(url: string, pollMs: number) {
  const list = useApiList<MissingPerson>(url, {
    selectItems: (r) => (r.people as MissingPerson[]) ?? [],
    pollMs,
  });
  // useApiList recalcula `total` desde el server en cada respuesta; para la baja
  // optimista mantenemos un override local que el próximo refetch reemplaza.
  const [totalOverride, setTotalOverride] = useState<number | null>(null);
  const lastServerTotal = useRef(list.total);
  useEffect(() => {
    if (list.total !== lastServerTotal.current) {
      lastServerTotal.current = list.total;
      setTotalOverride(null); // llegó dato fresco del server → suelta el override
    }
  }, [list.total]);
  const setTotalLocal = useCallback((fn: (t: number) => number) => {
    setTotalOverride((cur) => fn(cur ?? lastServerTotal.current));
  }, []);
  return { ...list, total: totalOverride ?? list.total, setTotalLocal };
}
