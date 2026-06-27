import { NextResponse } from "next/server";
import { searchFace } from "@/lib/fr-api";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const MAX_SEARCH_PHOTO_CHARS = 1_400_000;

export async function POST(request: Request) {
  const allowed = await checkRateLimit(`fr-search:${clientIp(request)}`, 10);
  if (!allowed) {
    return NextResponse.json(
      { error: "Vas muy rápido. Espera un momento antes de buscar de nuevo." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  let body: { photo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Solicitud inválida." },
      { status: 400 },
    );
  }

  if (!body.photo || typeof body.photo !== "string") {
    return NextResponse.json(
      { error: "Se requiere una foto para la búsqueda." },
      { status: 400 },
    );
  }

  if (body.photo.length > MAX_SEARCH_PHOTO_CHARS) {
    return NextResponse.json(
      { error: "La foto es demasiado grande." },
      { status: 413 },
    );
  }

  const dataUrlRegex = /^data:image\/(jpeg|png|webp);base64,(.+)$/;
  const match = body.photo.match(dataUrlRegex);
  if (!match) {
    return NextResponse.json(
      { error: "La foto debe ser una imagen JPG, PNG o WebP válida." },
      { status: 400 },
    );
  }

  const mimeType = `image/${match[1]}`;
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const file = new File([bytes], `search.${ext}`, { type: mimeType });

  const result = await searchFace(file);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    results: result.results,
    faces_detected: result.query.faces_detected,
  });
}
