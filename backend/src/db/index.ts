/**
 * Acceso a la base con Drizzle ORM. El esquema vive en infra/db/schema.ts (la
 * fuente de verdad, compartida con las migraciones drizzle-kit). Mismo criterio
 * de driver que el app Next previo:
 *   DB_DRIVER=tcp  -> Postgres VPS (Hetzner) via node-postgres
 *   DB_DRIVER=neon -> Neon (HTTP)            via neon-http   (default seguro)
 */
import * as schema from "../../../infra/db/schema.js";
import { env } from "@/config/env";

type Db =
  | ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>>
  | ReturnType<typeof import("drizzle-orm/node-postgres").drizzle<typeof schema>>;

let _db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (_db) return _db;
  if (env.DB_DRIVER === "tcp") {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    _db = drizzle(pool, { schema });
  } else {
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { neon } = await import("@neondatabase/serverless");
    _db = drizzle(neon(env.DATABASE_URL), { schema });
  }
  return _db;
}

export { schema };
