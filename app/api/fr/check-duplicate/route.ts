import { NextResponse } from "next/server";
import { FR_API_URL, FR_API_KEY } from "@/lib/fr-api";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PHOTO_CHARS = 1_400_000;

export async function POST(request: Request) {
  const allowed = await checkRateLimit(`fr-check-dup:${clientIp(request)}`, 10);
  if (!allowed) {
    return NextResponse.json(
      { ok: true, possible_duplicate: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  if (!FR_API_KEY) {
    return NextResponse.json({
      ok: true,
      possible_duplicate: false,
      disabled: true,
    });
  }

  let photo = "";
  try {
    const body = await request.json();
    photo = body?.photo || "";
  } catch {
    return NextResponse.json({
      ok: true,
      possible_duplicate: false,
    });
  }

  if (!photo || typeof photo !== "string") {
    return NextResponse.json({
      ok: true,
      possible_duplicate: false,
    });
  }

  if (photo.length > MAX_PHOTO_CHARS) {
    return NextResponse.json({
      ok: true,
      possible_duplicate: false,
    });
  }

  const m =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(photo);
  if (!m) {
    return NextResponse.json({
      ok: true,
      possible_duplicate: false,
    });
  }

  try {
    const fd = new FormData();
    fd.append(
      "file",
      new Blob([Buffer.from(m[2], "base64")], { type: m[1] }),
      "foto.jpg",
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(`${FR_API_URL}/v1/check-duplicate`, {
      method: "POST",
      headers: { "X-API-Key": FR_API_KEY },
      body: fd,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 422) {
      return NextResponse.json({
        ok: true,
        possible_duplicate: false,
        no_face: true,
      });
    }

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({
      ok: true,
      possible_duplicate: false,
      error: "fr_unreachable",
    });
  }
}
