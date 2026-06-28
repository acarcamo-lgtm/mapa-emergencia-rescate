"use client";

/**
 * Cliente HTTP central del frontend (browser). UN solo lugar para timeout,
 * manejo de error y parseo JSON — antes cada componente hacía su propio
 * `fetch()` con opciones distintas (ver useApiList en lib/hooks-client.ts).
 *
 * Rutas SIEMPRE relativas (`/api/...`): en prod las sirve la propia app; en dev
 * el rewrite de next.config.ts (DEV_API_PROXY=1) las proxea al API live, mismo
 * origen para el browser → cero CORS.
 *
 * `no-cache` (NO `no-store`): el browser revalida con If-None-Match y el server
 * responde 304 vacío cuando nada cambió (los endpoints emiten ETag vía
 * jsonWithEtag). no-store tiraría ese ahorro.
 */

const DEFAULT_TIMEOUT_MS = 8000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** GET tipado. Cancela por timeout Y respeta un signal externo (polling). */
export async function apiGet<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  // Encadena el signal externo con el de timeout: si cualquiera aborta, aborta el fetch.
  const onExternalAbort = () => timeout.abort();
  opts.signal?.addEventListener("abort", onExternalAbort, { once: true });
  try {
    const res = await fetch(path, { cache: "no-cache", signal: timeout.signal });
    if (!res.ok) {
      throw new ApiError(`GET ${path} → ${res.status}`, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Mutaciones. No cachea. Lanza ApiError con el status para que el caller decida. */
export async function apiSend<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${method} ${path} → ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
