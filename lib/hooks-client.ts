"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api-client";
import { mergeById } from "@/lib/merge-by-id";

/**
 * ============================================================================
 * CAPA DE DATOS DEL FRONTEND — patrón canónico (seguir en componentes nuevos)
 * ============================================================================
 *
 * REGLA: un componente NO hace `fetch()` + `setInterval` + `setState(nuevo
 * array)` a mano. Usa `useApiList`. Esto reemplaza el anti-patrón que hacía que
 * (a) toda la UI se repintara cada poll aunque no cambiara nada, y (b) dos
 * componentes pollearan el MISMO endpoint en paralelo (requests duplicados).
 *
 * Qué da el hook:
 *  1. mergeById  — conserva la referencia de las filas idénticas → React no
 *     re-renderiza las tarjetas que no cambiaron. (lib/merge-by-id.ts)
 *  2. loading vs fetching — `loading` solo en la 1ª carga (skeleton); los polls
 *     de fondo NO blanquean la lista (`fetching`).
 *  3. Single-flight por URL — N componentes con la misma URL comparten UN
 *     request en vuelo y la última respuesta cacheada (registry global).
 *  4. Polling con pausa por visibilidad e intervalo dinámico (low-bandwidth).
 *  5. Mutación optimista local (`patchLocal`) para borrados/cambios sin esperar
 *     un refetch completo.
 *
 * Reglas de fetch (las aplica apiGet en lib/api-client.ts):
 *  - rutas relativas `/api/...` (dev → proxy live vía next.config.ts).
 *  - `no-cache`, NUNCA `no-store` (revalida con ETag → 304 vacío).
 */

// ---- registry global: single-flight + última respuesta por URL --------------
type Entry<T> = { inflight: Promise<ListResponse<T>> | null; last: ListResponse<T> | null };
const registry = new Map<string, Entry<unknown>>();

function getEntry<T>(url: string): Entry<T> {
  let e = registry.get(url) as Entry<T> | undefined;
  if (!e) {
    e = { inflight: null, last: null };
    registry.set(url, e as Entry<unknown>);
  }
  return e;
}

/** Un fetch por URL a la vez; los llamadores concurrentes comparten la promesa.
 *  `bust` salta el single-flight Y el caché del CDN (refresco manual). */
function sharedFetch<T>(url: string, bust: boolean): Promise<ListResponse<T>> {
  const e = getEntry<T>(url);
  if (e.inflight && !bust) return e.inflight;
  const realUrl = bust ? appendCacheBuster(url) : url;
  const p = apiGet<ListResponse<T>>(realUrl).then((res) => {
    e.last = res;
    return res;
  });
  if (!bust) {
    e.inflight = p.finally(() => {
      e.inflight = null;
    });
    return e.inflight;
  }
  return p;
}

function appendCacheBuster(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + "_=" + performance.now().toString(36);
}

export interface ListResponse<T> {
  total?: number;
  totalPages?: number;
  totalCapped?: boolean;
  page?: number;
  persistent?: boolean;
  [key: string]: unknown;
}

export interface UseApiListResult<T> {
  items: T[];
  total: number;
  totalPages: number;
  totalCapped: boolean;
  persistent: boolean;
  /** página confirmada por el server (acotada al rango válido). */
  serverPage: number | null;
  loading: boolean;
  fetching: boolean;
  error: string | null;
  /** refetch de fondo (no blanquea). `bust=true` evita CDN — para refresco manual. */
  refetch: (bust?: boolean) => void;
  /** mutación optimista local: aplica un transform al array sin pedir red. */
  patchLocal: (fn: (prev: T[]) => T[]) => void;
}

export interface UseApiListOptions<T> {
  /** extrae el array de la respuesta, p.ej. r => r.people. */
  selectItems: (res: ListResponse<T>) => T[];
  /** intervalo de polling en ms. 0 = sin polling. */
  pollMs?: number;
  /** si false, no se hace fetch (p.ej. query demasiado corta). */
  enabled?: boolean;
}

/**
 * Lista paginada con polling, dedup y preservación de identidad.
 * @param url  URL completa con query (relativa). Cambiarla recarga.
 */
export function useApiList<T>(url: string, opts: UseApiListOptions<T>): UseApiListResult<T> {
  const { selectItems, pollMs = 0, enabled = true } = opts;

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCapped, setTotalCapped] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [serverPage, setServerPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // callbacks/flags en refs para no recrear `run` (y reiniciar el intervalo).
  const selectRef = useRef(selectItems);
  selectRef.current = selectItems;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const apply = useCallback((res: ListResponse<T>) => {
    const next = selectRef.current(res) ?? [];
    setItems((prev) => mergeById(prev, next));
    if (typeof res.total === "number") setTotal(res.total);
    if (typeof res.totalPages === "number") setTotalPages(res.totalPages);
    setTotalCapped(Boolean(res.totalCapped));
    if (typeof res.persistent === "boolean") setPersistent(res.persistent);
    if (typeof res.page === "number") setServerPage(res.page);
  }, []);

  const run = useCallback(
    async (background: boolean, bust = false) => {
      if (!enabledRef.current) return;
      if (background) setFetching(true);
      else setLoading(true);
      setError(null);
      try {
        apply(await sharedFetch<T>(url, bust));
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (!background) setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        if (background) setFetching(false);
        else setLoading(false);
      }
    },
    [url, apply],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Si el registry ya tiene datos de otro componente con esta URL, píntalos al
    // instante (sin skeleton) y revalida en fondo.
    const cached = getEntry<T>(url).last;
    if (cached) {
      apply(cached);
      setLoading(false);
      void run(true);
    } else {
      void run(false);
    }

    if (pollMs <= 0) return () => { cancelled = true; };
    const id = setInterval(() => {
      if (!cancelled && document.visibilityState === "visible") void run(true);
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, pollMs, enabled, run, apply]);

  const patchLocal = useCallback((fn: (prev: T[]) => T[]) => {
    setItems((prev) => fn(prev));
  }, []);

  return {
    items,
    total,
    totalPages,
    totalCapped,
    persistent,
    serverPage,
    loading,
    fetching,
    error,
    refetch: (bust = false) => void run(true, bust),
    patchLocal,
  };
}
