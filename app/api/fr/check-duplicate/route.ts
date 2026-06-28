import { NextResponse } from "next/server";
import {
  FR_API_URL,
  frConfigured,
  frHeaders,
  type FrDuplicateResponse,
} from "@/lib/fr-api";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PHOTO_CHARS = 1_400_000;

export async function POST(request: Request) {
  const allowed = await checkRateLimit(
    `fr-check-dup:${clientIp(request)}`,
    10,
  );
  if (!allowed) {
    return NextResponse.json(
      { ok: true, possible_duplicate: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  if (!frConfigured()) {
    return NextResponse.json({
      ok: true,
      possible_duplicate: false,
      disabled: true,
    });
  }

  let photo = "";
  try {
    photo = (await request.json())?.photo || "";
  } catch {
    return NextResponse.json({ ok: true, possible_duplicate: false });
  }

  if (!photo || typeof photo !== "string" || photo.length > MAX_PHOTO_CHARS) {
    return NextResponse.json({ ok: true, possible_duplicate: false });
  }

  const m =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(photo);
  if (!m) {
    return NextResponse.json({ ok: true, possible_duplicate: false });
  }

  try {
    const fd = new FormData();
    fd.append(
      "file",
      new Blob([Buffer.from(m[2], "base64")], { type: m[1] }),
      "foto.jpg",
    );

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);

    const res = await fetch(`${FR_API_URL}/v1/check-duplicate`, {
      method: "POST",
      headers: frHeaders(),
      body: fd,
      signal: ctrl.signal,
    });

    clearTimeout(t);

    if (res.status === 422) {
      const body: FrDuplicateResponse = {
        ok: true,
        possible_duplicate: false,
        no_face: true,
      };
      return NextResponse.json(body);
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
