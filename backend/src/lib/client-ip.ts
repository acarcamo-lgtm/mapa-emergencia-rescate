import { createHash } from "crypto";
import type { Request } from "express";
import { env } from "@/config/env";

/**
 * IP del cliente para rate-limit y hashing. Detrás de Cloudflare la ÚNICA fuente
 * de confianza es la cabecera que pone Cloudflare (cf-connecting-ip por defecto):
 * el cliente NO puede falsificarla porque CF la reescribe en cada request. NUNCA
 * usar el x-forwarded-for crudo del cliente (el valor más a la izquierda es
 * inyectable y evade el rate-limit cambiando un header).
 *
 * env.TRUSTED_IP_HEADER default = "cf-connecting-ip". Si por lo que sea llega
 * vacío, caemos a la IP del socket (req.ip, con trust proxy configurado), nunca
 * a un header arbitrario del cliente.
 */
export function clientIp(req: Request): string {
  const header = env.TRUSTED_IP_HEADER;
  if (header) {
    const v = req.headers[header.toLowerCase()];
    const raw = Array.isArray(v) ? v[0] : v;
    if (raw) {
      // cf-connecting-ip es un único valor; si vinieran varios, el último hop
      // (el que añadió el proxy más cercano) es el de confianza.
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1]!;
    }
  }
  return req.ip ?? "anon";
}

/**
 * Hash estable de la IP para persistir (columnas ip_hash). NUNCA guardar la IP
 * cruda: contexto humanitario. Salado con IP_SALT. Determinístico → dedup por IP.
 */
export function hashIp(req: Request): string {
  const salt = env.IP_SALT ?? "";
  return createHash("sha256").update(clientIp(req) + salt).digest("hex");
}
