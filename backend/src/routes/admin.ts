/**
 * Superficie admin. login es PÚBLICO pero anti-brute-force (rateLimit por IP);
 * el resto requiere requireAdmin (header x-admin-token == ADMIN_PASSWORD). Mismo
 * contrato que app/api/admin/* del app Next.
 *
 * Nota de contrato (login): el app previo NO emite un JWT; el "token" de admin ES
 * la contraseña, que el frontend reenvía en x-admin-token. Por eso login solo
 * valida y responde { ok: true } (shape idéntico) — no cambiamos el frontend.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireAdmin, validate } from "@/middleware";
import { serviceUnavailable } from "@/lib/errors";
import * as adminSvc from "@/services/admin";
import * as donationsSvc from "@/services/donations";

export const adminRouter = Router();

const NO_STORE = { "Cache-Control": "no-store" };

const loginBody = z.object({ password: z.string().optional() });

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     tags: [admin]
 *     summary: Inicia sesión de administrador validando la contraseña (limitado por IP)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Contraseña válida.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean } } }
 *       401:
 *         description: Contraseña incorrecta.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       429:
 *         description: Demasiados intentos (rate limit por IP).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       503:
 *         description: Acceso de administrador no configurado en el servidor.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
adminRouter.post(
  "/login",
  rateLimit({ scope: "login", limit: 5 }), // anti-brute-force por IP
  validate({ body: loginBody }),
  asyncHandler(async (req, res) => {
    if (!adminSvc.isAdminConfigured()) {
      throw serviceUnavailable(
        "El acceso de administrador no está configurado en el servidor.",
      );
    }
    const { password } = req.body as z.infer<typeof loginBody>;
    if (!adminSvc.isValidAdminPassword(password)) {
      res.status(401).json({ error: "Contraseña incorrecta." });
      return;
    }
    res.json({ ok: true });
  }),
);

/**
 * @swagger
 * /api/admin/donations:
 *   get:
 *     tags: [admin]
 *     summary: Lista todas las donaciones con estadísticas (requiere admin)
 *     responses:
 *       200:
 *         description: Estadísticas y listado completo de donaciones.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generatedAt: { type: integer, description: epoch-ms }
 *                 stats: { $ref: '#/components/schemas/DonationStats' }
 *                 donations:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Donation' }
 *       401:
 *         description: No autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       503:
 *         description: No se pudieron cargar las donaciones.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
adminRouter.get(
  "/donations",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    try {
      const [stats, donations] = await Promise.all([
        donationsSvc.getDonationStats(),
        donationsSvc.listAllDonations(),
      ]);
      res.set(NO_STORE).json({ generatedAt: Date.now(), stats, donations });
    } catch {
      throw serviceUnavailable("No se pudieron cargar las donaciones.");
    }
  }),
);
