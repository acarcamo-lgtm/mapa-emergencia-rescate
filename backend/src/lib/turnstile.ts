import { env } from "@/config/env";
import { clientIp } from "@/lib/client-ip";
import type { Request } from "express";

/**
 * Verifica un token de Cloudflare Turnstile contra siteverify (prueba de
 * humanidad en writes públicos). El secreto SOLO se usa aquí en el backend.
 *
 * El cliente envía el token en la cabecera `cf-turnstile-token` (o en el body
 * `turnstileToken`). Cada token es de un solo uso y caduca a los 300s.
 *
 * Si TURNSTILE_SECRET_KEY no está configurada (dev local), verifyTurnstile
 * devuelve true (desactivado) — así el desarrollo no exige captcha. En prod la
 * clave SIEMPRE está, por lo que el gate es real.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(req: Request): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // desactivado en dev

  const token =
    (req.headers["cf-turnstile-token"] as string | undefined) ??
    (typeof req.body === "object" && req.body
      ? (req.body as Record<string, unknown>).turnstileToken
      : undefined);

  if (typeof token !== "string" || !token) return false;

  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: clientIp(req),
      }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Si siteverify no responde, fallamos CERRADO en writes (no dejamos pasar).
    return false;
  }
}
