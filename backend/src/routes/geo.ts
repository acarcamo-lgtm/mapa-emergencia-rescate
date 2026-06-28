/**
 * /api/geo — detecta el código de país (ISO 3166-1 alpha-2) desde las cabeceras
 * de geo que inyecta el edge/CDN (Cloudflare, Vercel, CloudFront…).
 *
 * Lectura pública sin DB ni rate-limit (es trivial y por-request, igual que el
 * Next previo). Respuesta { countryCode } con Cache-Control private, no-store
 * (depende de la IP del visitante; nunca cachear).
 */
import { Router } from "express";
import { asyncHandler } from "@/middleware";

export const geoRouter = Router();

const COUNTRY_HEADER_NAMES = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "x-country-code",
  "x-geo-country",
  "cloudfront-viewer-country",
];

/**
 * @swagger
 * /api/geo:
 *   get:
 *     tags: [system]
 *     summary: Detecta el código de país (ISO 3166-1 alpha-2) desde headers de geo del edge/CDN
 *     responses:
 *       200:
 *         description: Código de país detectado, o null si no hay header válido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 countryCode:
 *                   type: string
 *                   nullable: true
 *                   description: Código ISO 3166-1 alpha-2 en mayúsculas, o null
 */
geoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const countryCode = COUNTRY_HEADER_NAMES.map((name) => {
      const v = req.headers[name];
      const raw = Array.isArray(v) ? v[0] : v;
      return raw?.trim().toUpperCase();
    }).find((value) => value && /^[A-Z]{2}$/.test(value));

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({ countryCode: countryCode ?? null });
  }),
);
