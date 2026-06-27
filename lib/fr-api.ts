export const FR_API_URL =
  process.env.FR_API_URL || "https://fr-api.reportavnzla.com:8443";
export const FR_API_KEY = process.env.FR_API_KEY || "";
export const FR_MIN_SCORE = Number(process.env.FR_MIN_SCORE || "0.55");

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

export interface FrIndexResponse {
  ok: boolean;
  indexed: boolean;
  record_id: string;
}

export interface FrIndexError {
  ok: false;
  error: string;
  status: number;
}

/**
 * Index a person's photo in the FR-API so other platforms can find them.
 * Idempotent by external_id — re-calling with the same id won't duplicate.
 * The photo can be a File or a data URL string (converted to File internally).
 */
export async function indexFace(
  externalId: string,
  personName: string,
  lastSeenLocation: string,
  photo: File | string,
): Promise<FrIndexResponse | FrIndexError> {
  if (!FR_API_KEY) {
    return { ok: false, error: "FR_API_KEY no configurada en el servidor.", status: 500 };
  }

  const formData = new FormData();
  formData.append("external_id", externalId);
  formData.append("person_name", personName);
  formData.append("last_seen_location", lastSeenLocation);

  if (typeof photo === "string") {
    // Data URL → File
    const match = photo.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
    if (!match) {
      return { ok: false, error: "Foto inválida para indexar.", status: 400 };
    }
    const mimeType = `image/${match[1]}`;
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    formData.append("file", new File([bytes], `index.${ext}`, { type: mimeType }));
  } else {
    formData.append("file", photo);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(`${FR_API_URL}/v1/index`, {
      method: "POST",
      headers: { "X-API-Key": FR_API_KEY },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        ok: false,
        error: res.status === 422
          ? "No se detectó ningún rostro en la foto."
          : `Error del servicio de reconocimiento facial (${res.status}).`,
        status: res.status,
      };
    }

    const data: FrIndexResponse = await res.json();
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "El servicio de reconocimiento facial tardó demasiado.", status: 504 };
    }
    return { ok: false, error: "No se pudo conectar con el servicio de reconocimiento facial.", status: 502 };
  }
}

/**
 * Search the FR-API index for faces similar to the given image file.
 * Returns the top matches with score >= minScore, or an error.
 */
export async function searchFace(
  file: File,
  minScore = FR_MIN_SCORE,
): Promise<FrSearchResponse | FrSearchError> {
  if (!FR_API_KEY) {
    return { ok: false, error: "FR_API_KEY no configurada en el servidor.", status: 500 };
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(`${FR_API_URL}/v1/search`, {
      method: "POST",
      headers: { "X-API-Key": FR_API_KEY },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: res.status === 422
          ? "No se detectó ningún rostro en la foto."
          : `Error del servicio de reconocimiento facial (${res.status}).`,
        status: res.status,
      };
    }

    const data: FrSearchResponse = await res.json();

    if (!data.ok) {
      return { ok: false, error: "El servicio de reconocimiento facial no respondió correctamente.", status: 502 };
    }

    data.results = data.results.filter((r) => r.score >= minScore);

    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "El servicio de reconocimiento facial tardó demasiado.", status: 504 };
    }
    return { ok: false, error: "No se pudo conectar con el servicio de reconocimiento facial.", status: 502 };
  }
}
