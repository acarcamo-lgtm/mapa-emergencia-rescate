import { NextResponse } from "next/server";
import { searchFace } from "@/lib/fr-api";
import { isAdminRequest } from "@/lib/admin";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // La guía FR-API indica que /v1/search debe ir detrás de la auth de admin.
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 },
    );
  }

  const allowed = await checkRateLimit(`fr-search:${clientIp(request)}`, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Vas muy rápido. Espera un momento antes de buscar de nuevo." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Se requiere una foto para la búsqueda." },
      { status: 400 },
    );
  }

  // Convertimos el Blob en File para mantener la interfaz de lib/fr-api.
  const searchFile = new File(
    [file],
    file instanceof File ? file.name : "search.jpg",
    { type: file.type || "image/jpeg" },
  );

  const result = await searchFace(searchFile);

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
