import { z } from "zod";

/**
 * Validación de entorno en el arranque (fail-fast). Si falta algo crítico, el
 * server NO levanta — mejor que descubrir un undefined en runtime sirviendo a
 * gente en emergencia. Las claves opcionales degradan con gracia (ver notas).
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8080),

  // DB: misma elección de driver que el app Next (lib/drizzle.ts).
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio"),
  DB_DRIVER: z.enum(["neon", "tcp"]).default("neon"),

  // Valkey: OPCIONAL. Sin esto el rate-limit cae a memoria (degradado, no rompe).
  VALKEY_URL: z.string().optional(),

  // Auth.
  ADMIN_PASSWORD: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  // Privacidad: sal para hashear IPs antes de persistir. Sin esto, hashIp lanza.
  IP_SALT: z.string().optional(),

  // Cabecera de IP de confianza. Detrás de Cloudflare debe ser cf-connecting-ip
  // (el cliente NO puede falsificarla). Default a cf-connecting-ip aquí porque el
  // backend SIEMPRE está detrás del LB/Cloudflare en prod.
  TRUSTED_IP_HEADER: z.string().default("cf-connecting-ip"),

  // Cloudflare Turnstile (prueba de humanidad en writes públicos). OPCIONAL:
  // sin TURNSTILE_SECRET_KEY el middleware requireHuman se desactiva (dev local).
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // CORS: orígenes permitidos del frontend (coma-separados). En dev, localhost.
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Config de entorno inválida:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
