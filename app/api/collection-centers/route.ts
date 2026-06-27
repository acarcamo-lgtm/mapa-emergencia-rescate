import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { cached, invalidate } from "@/lib/cache";
import {
  addCollectionCenter,
  importCollectionCenters,
  listCollectionCenters,
  type CollectionCenterInput,
} from "@/lib/collection-centers";
import {
  BODY_LIMIT_BULK_TEXT,
  bodyErrorResponse,
  readJson,
} from "@/lib/body";
import { jsonWithEtag } from "@/lib/http";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=20, stale-while-revalidate=120",
};

export async function GET(request: Request) {
  const centers = await cached("collection-centers", 20_000, () =>
    listCollectionCenters(),
  );
  return jsonWithEtag(request, { centers }, CACHE_HEADERS);
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: CollectionCenterInput | { centers?: CollectionCenterInput[] };
  try {
    body = await readJson(request, BODY_LIMIT_BULK_TEXT);
  } catch (e) {
    return bodyErrorResponse(e);
  }

  try {
    if (
      body &&
      typeof body === "object" &&
      "centers" in body &&
      Array.isArray(body.centers)
    ) {
      const result = await importCollectionCenters(body.centers);
      invalidate();
      return NextResponse.json({ ok: true, ...result });
    }

    const center = await addCollectionCenter(body as CollectionCenterInput);
    invalidate();
    return NextResponse.json({ center }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: `No se pudo guardar el centro de acopio: ${message}` },
      { status: 400 },
    );
  }
}
