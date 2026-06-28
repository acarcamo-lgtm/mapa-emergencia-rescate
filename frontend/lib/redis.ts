/**
 * Cliente Valkey/Redis del lado de la APP (route handlers). Separado de
 * worker/redis.ts a propósito: el worker corre en otro proceso/imagen. Comparten
 * el mismo VALKEY_URL (ya presente en el secret app-env).
 *
 * Es OPCIONAL: si no hay VALKEY_URL o la conexión falla, getRedisSafe() devuelve
 * null y los consumidores caen a su modo degradado (el rate-limit cae a memoria,
 * nunca rompe el request). Contexto humanitario: jamás devolver 500 por Valkey.
 */
import IORedis from "ioredis";

let _client: IORedis | null = null;
let _tried = false;

/** Cliente compartido o null si Valkey no está disponible. Nunca lanza. */
export function getRedisSafe(): IORedis | null {
  if (_client) return _client;
  if (_tried) return null; // ya falló antes; no reintentar en cada request
  _tried = true;
  const url = process.env.VALKEY_URL;
  if (!url) return null;
  try {
    _client = new IORedis(url, {
      // En el request-path NO queremos que un comando quede colgado: límite de
      // reintentos y de tiempo bajo, y fail-open si Valkey no responde.
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      commandTimeout: 1000,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    _client.on("error", () => {
      /* swallow: el modo degradado lo maneja getRedisSafe/checkRateLimit */
    });
    return _client;
  } catch {
    return null;
  }
}
