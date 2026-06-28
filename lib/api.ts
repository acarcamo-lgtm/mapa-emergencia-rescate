/**
 * Wrapper de fetch tipado para el frontend. ÚNICO punto de red:
 *  - rutas relativas (/api/...) -> mismo origen en prod; en dev el proxy de
 *    next.config.ts las manda al backend live.
 *  - GET con cache:"no-cache" => revalida con If-None-Match => el server responde
 *    304 vacío cuando nada cambió (NUNCA no-store, que tira ese ahorro).
 *  - timeout con AbortController (no deja fetches huérfanos colgados).
 *  - errores tipados (ApiError con status) para que TanStack Query / mutaciones
 *    decidan reintentos y mensajes.
 *
 * TanStack Query se encarga de cache/dedup/poll/refetch; este módulo solo habla
 * HTTP. Los queryFn/mutationFn lo usan.
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

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Encadena el signal de TanStack Query (cancela al cambiar queryKey) con el timeout.
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(path, { signal: ctrl.signal, ...rest });
    if (!res.ok) {
      let msg = `${rest.method ?? "GET"} ${path} -> ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {
        /* sin cuerpo JSON */
      }
      throw new ApiError(msg, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** GET para queries. cache:"no-cache" => aprovecha ETag/304. */
export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { cache: "no-cache", signal });
}

/** Mutaciones. JSON body. */
export function apiSend<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return request<T>(path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
