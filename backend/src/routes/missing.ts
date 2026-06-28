/**
 * ============================================================================
 * ENDPOINT DE REFERENCIA — patrón canónico para TODOS los routes del backend.
 * El workflow de port replica EXACTAMENTE esta estructura para los 45 restantes.
 * ============================================================================
 *
 * Reglas que este patrón impone (las prácticas correctas que faltaban antes):
 *  1. Capas: route (HTTP + middleware) → service (lógica/DB) → db. El route NO
 *     habla con la DB directo.
 *  2. Validación de entrada con zod (validate()) ANTES del handler. Nada de leer
 *     req.body crudo.
 *  3. Mutaciones públicas: rateLimit + requireHuman (Turnstile). Mutaciones de
 *     admin: requireAdmin. (Aquí POST es público con captcha; DELETE sería admin.)
 *  4. Salida por allowlist de DTO (toMissingDTO) — NUNCA serializar la fila de DB
 *     entera (evita filtrar columnas internas, p.ej. ip_hash).
 *  5. Lecturas polleadas: jsonWithEtag (304) + Cache-Control. MISMO contrato de
 *     respuesta que el endpoint Next previo (el frontend no cambia).
 *  6. Errores vía throw de @/lib/errors → errorHandler central.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireHuman, validate } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import { badRequest, payloadTooLarge, serviceUnavailable } from "@/lib/errors";
import * as service from "@/services/missing";

export const missingRouter = Router();

// --- Constantes de validación (espejan el contrato previo) ---
const MAX_NAME = 120;
const MAX_NATIONALITY = 80;
const MAX_PHOTO_CHARS = 1_400_000;
const DEFAULT_PAGE_SIZE = 48;
const MAX_PAGE_SIZE = 100;

// --- Esquemas zod (validación de entrada, reemplaza el parseo manual) ---
const listQuery = z.object({
  status: z.enum(["active", "found", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(200).optional(),
});

const createBody = z.object({
  name: z.string().trim().min(1, "Indica el nombre de la persona.").max(MAX_NAME),
  age: z.union([z.number(), z.string(), z.null()]).optional(),
  nationality: z.string().trim().max(MAX_NATIONALITY).optional(),
  description: z.string().max(600).optional(),
  lastSeen: z.string().max(200).optional(),
  contact: z.string().max(120).optional(),
  photo: z.string().max(MAX_PHOTO_CHARS, "La foto es demasiado grande.").nullable().optional(),
  reportType: z.enum(["missing", "found"]).default("missing"),
  // Turnstile lo consume requireHuman; lo permitimos en el body sin reflejarlo.
  turnstileToken: z.string().optional(),
});

// Cache headers (idénticos al endpoint previo).
const LIST_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=15" };
const SEARCH_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120" };

// ---- GET /api/missing : lista paginada (pública, cacheada, con ETag) --------
missingRouter.get(
  "/",
  rateLimit({ scope: "missing:list", limit: 120 }), // generoso: es lectura polleada
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { status, page, pageSize, q } = req.query as unknown as z.infer<typeof listQuery>;
    const result = await service.listMissingPage({ status, page, pageSize, search: q });
    const isSearch = (q ?? "").length >= 3;
    jsonWithEtag(
      req,
      res,
      {
        people: result.people, // service ya devuelve DTOs (allowlist), no filas crudas
        total: result.total,
        totalCapped: result.totalCapped,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        persistent: result.persistent,
      },
      isSearch ? SEARCH_CACHE : LIST_CACHE,
    );
  }),
);

// ---- POST /api/missing : crear reporte (PÚBLICO → rate-limit + Turnstile) ---
missingRouter.post(
  "/",
  rateLimit({ scope: "missing:create", limit: 10 }),
  requireHuman, // Cloudflare Turnstile: solo humanos crean (mata el spam tipo "PRUEBA")
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBody>;
    if (body.photo && !service.isValidPhotoDataUrl(body.photo)) {
      throw badRequest("La foto debe ser una imagen JPG, PNG o WebP válida.");
    }
    if (body.photo && body.photo.length > MAX_PHOTO_CHARS) {
      throw payloadTooLarge("La foto es demasiado grande. Usa una imagen más liviana.");
    }
    try {
      const person = await service.addMissing(body);
      res.status(201).json({ person }); // person ya es DTO
    } catch {
      throw serviceUnavailable("No se pudo guardar el reporte. Inténtalo de nuevo.");
    }
  }),
);
