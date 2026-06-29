/**
 * Routes de coordinación de recursos privados — Fase 1 (pool de oferta).
 * Sigue el patrón canónico: route = HTTP + middleware; la lógica/DB vive en
 * services/recursos.ts.
 *
 * Seguridad por ruta:
 *  - GET /kinds, GET /  : lectura pública polleada → rateLimit + ETag + cache.
 *  - POST /             : escritura pública → rateLimit + requireHuman (Turnstile) + zod.
 *  - GET /:id/contacto  : revela el WhatsApp (PII) BAJO DEMANDA → rateLimit estricto.
 *                         No se expone en el listado para evitar scraping masivo.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireHuman, validate } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import { badRequest, notFound } from "@/lib/errors";
import * as service from "@/services/recursos";

export const recursosRouter = Router();

const LIST_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=4, stale-while-revalidate=30",
};
const KINDS_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
};

const ofrecerBody = z.object({
  kind: z.string().min(1, "Selecciona el tipo de recurso."),
  nombre: z.string().trim().min(1, "Indica tu nombre.").max(120),
  whatsapp: z.string().trim().min(5, "Indica un WhatsApp válido.").max(30),
  zona: z.string().trim().max(200).optional(),
  atributos: z.record(z.string().max(500)).optional(),
  // Turnstile lo consume requireHuman; lo permitimos sin reflejarlo en la salida.
  turnstileToken: z.string().optional(),
});

const idParam = z.object({ id: z.string().min(1, "Falta el id") });

/**
 * @swagger
 * /api/recursos/kinds:
 *   get:
 *     tags: [coordinacion]
 *     summary: Registro de tipos de recurso (maquinaria, flete, combustible, …)
 *     responses:
 *       200:
 *         description: Lista de tipos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 kinds: { type: array, items: { type: object } }
 */
recursosRouter.get(
  "/kinds",
  rateLimit({ scope: "recursos:kinds", limit: 240 }),
  asyncHandler(async (req, res) => {
    jsonWithEtag(req, res, { kinds: await service.listKinds() }, KINDS_CACHE);
  }),
);

/**
 * @swagger
 * /api/recursos:
 *   get:
 *     tags: [coordinacion]
 *     summary: Pool de recursos disponibles (sin datos de contacto)
 *     responses:
 *       200:
 *         description: Recursos disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recursos: { type: array, items: { type: object } }
 *   post:
 *     tags: [coordinacion]
 *     summary: Ofrecer un recurso (público, rate-limited + Turnstile)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, nombre, whatsapp]
 *             properties:
 *               kind: { type: string }
 *               nombre: { type: string }
 *               whatsapp: { type: string }
 *               zona: { type: string }
 *               atributos: { type: object, additionalProperties: { type: string } }
 *               turnstileToken: { type: string }
 *     responses:
 *       201:
 *         description: Recurso creado
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { recurso: { type: object } } }
 *       400:
 *         description: Entrada inválida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429:
 *         description: Demasiadas solicitudes (rate limit)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
recursosRouter.get(
  "/",
  rateLimit({ scope: "recursos:list", limit: 120 }),
  asyncHandler(async (req, res) => {
    jsonWithEtag(req, res, { recursos: await service.listDisponibles() }, LIST_CACHE);
  }),
);

recursosRouter.post(
  "/",
  rateLimit({ scope: "recursos:create", limit: 20 }),
  requireHuman, // Cloudflare Turnstile: solo humanos ofrecen
  validate({ body: ofrecerBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof ofrecerBody>;
    if (!(await service.kindExists(body.kind))) {
      throw badRequest("Tipo de recurso inválido.");
    }
    const recurso = await service.ofrecer({
      kind: body.kind,
      nombre: body.nombre,
      whatsapp: body.whatsapp,
      zona: body.zona,
      atributos: body.atributos,
    });
    res.status(201).json({ recurso });
  }),
);

/**
 * @swagger
 * /api/recursos/{id}/contacto:
 *   get:
 *     tags: [coordinacion]
 *     summary: Revela el contacto (WhatsApp) de un recurso, bajo demanda
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Contacto del recurso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 contacto:
 *                   type: object
 *                   properties:
 *                     nombreContacto: { type: string }
 *                     whatsapp: { type: string }
 *                     whatsappLink: { type: string }
 *       404:
 *         description: Recurso no encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
recursosRouter.get(
  "/:id/contacto",
  rateLimit({ scope: "recursos:contacto", limit: 40 }),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const contacto = await service.getContacto(String(req.params.id));
    if (!contacto) throw notFound("Recurso no encontrado.");
    res.json({ contacto });
  }),
);
