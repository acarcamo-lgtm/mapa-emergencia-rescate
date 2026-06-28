const RAW =
  process.env.FR_API_URL || "https://fr-api.reportavnzla.com:8443";
export const FR_API_URL = (/^https?:\/\//i.test(RAW)
  ? RAW
  : `https://${RAW}`
).replace(/\/+$/, "");
export const FR_API_KEY = process.env.FR_API_KEY || "";
export const FR_MIN_SCORE = Number(process.env.FR_MIN_SCORE || "0.55");
export const FR_SOURCE = process.env.FR_SOURCE || "terremotovenezuela";

export const frConfigured = () => Boolean(FR_API_KEY);
export const frHeaders = () => ({ "X-API-Key": FR_API_KEY });

export interface FrSearchCandidate {
  record_id: string;
  group_id: string;
  person_name: string | null;
  age: number | string | null;
  last_seen_location: string | null;
  contact_phone: string | null;
  image_url: string | null;
  source: string;
  score: number;
  band: "alta" | "media" | "baja";
  group_size: number;
}

export interface FrSearchResponse {
  ok: true;
  model: string;
  threshold: number;
  query: {
    faces_detected: number;
    det_score: number | null;
    bbox: number[];
  };
  results: FrSearchCandidate[];
}

export interface FrSearchError {
  ok: false;
  error: string;
  status: number;
}

export interface FrDuplicateCandidate {
  record_id: string;
  person_name: string | null;
  image_url: string | null;
  score: number;
  source: string;
}

export interface FrDuplicateResponse {
  ok: true;
  possible_duplicate: boolean;
  candidates?: FrDuplicateCandidate[];
  no_face?: boolean;
}

/**
 * Origen público absoluto del sitio. El FR-API descarga la foto desde su
 * propio servidor (no desde el cliente), por lo que `image_url` debe ser
 * una URL pública alcanzable desde internet. En local (`localhost`) el
 * FR-API no podría descargarla, así que preferimos una variable de entorno
 * explícita cuando esté definida.
 *
 * Prioridad: NEXT_PUBLIC_SITE_URL > SITE_URL > VERCEL_URL > origin del
 * request (con warning si es localhost).
 */
export function publicSiteOrigin(request?: Request): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (request) {
    const origin = new URL(request.url).origin;
    if (/localhost|127\.0\.0\.1/i.test(origin)) {
      console.warn(
        `fr-api: image_url usaría origen local (${origin}); el FR-API no podrá descargar la foto. Define NEXT_PUBLIC_SITE_URL.`,
      );
    }
    return origin;
  }
  return "https://terremotovenezuela.app";
}

/**
 * Indexa una persona en el FR-API para que otras plataformas puedan
 * encontrarla por reconocimiento facial.
 *
 * - Es idempotente por `external_id`: re-indexar no duplica.
 * - Es best-effort: nunca lanza, nunca bloquea el registro principal.
 * - Usa la URL pública de la foto (`image_url`), no datos privados.
 * - Incluye `source` para mantener un único origen consistente en el índice.
 */
export async function frIndexPerson(p: {
  externalId: string;
  imageUrl: string | null;
  name?: string | null;
  location?: string | null;
}): Promise<void> {
  if (!frConfigured() || !p.imageUrl) return;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);

  try {
    const fd = new FormData();
    fd.append("external_id", p.externalId);
    fd.append("image_url", p.imageUrl);
    fd.append("source", FR_SOURCE);
    if (p.name) fd.append("person_name", p.name);
    if (p.location) fd.append("last_seen_location", p.location);

    await fetch(`${FR_API_URL}/v1/index`, {
      method: "POST",
      headers: frHeaders(),
      body: fd,
      signal: ctrl.signal,
    });
  } catch {
    /* asistivo: nunca rompe el registro */
  } finally {
    clearTimeout(t);
  }
}

/**
 * Busca rostros similares en el índice del FR-API a partir de un archivo.
 * Usar solo desde rutas protegidas (admin); el cliente público no debe
 * llamar a búsqueda directamente.
 */
export async function searchFace(
  file: File,
  minScore = FR_MIN_SCORE,
): Promise<FrSearchResponse | FrSearchError> {
  if (!frConfigured()) {
    return {
      ok: false,
      error: "FR_API_KEY no configurada en el servidor.",
      status: 500,
    };
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(`${FR_API_URL}/v1/search`, {
      method: "POST",
      headers: frHeaders(),
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error:
          res.status === 422
            ? "No se detectó ningún rostro en la foto."
            : `Error del servicio de reconocimiento facial (${res.status}).`,
        status: res.status,
      };
    }

    const data: FrSearchResponse = await res.json();

    if (!data.ok) {
      return {
        ok: false,
        error: "El servicio de reconocimiento facial no respondió correctamente.",
        status: 502,
      };
    }

    data.results = data.results.filter((r) => r.score >= minScore);

    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        error: "El servicio de reconocimiento facial tardó demasiado.",
        status: 504,
      };
    }
    return {
      ok: false,
      error: "No se pudo conectar con el servicio de reconocimiento facial.",
      status: 502,
    };
  }
}
