/**
 * Service de la bandeja de contacto. Port directo de lib/contact-inbox.ts
 * (rama hasDbEnv): inserta el mensaje persistiendo el HASH de IP (nunca la IP
 * cruda — contexto humanitario).
 *
 * La validación de longitudes/formato vive en el route (zod). Aquí solo persiste.
 * Devuelve solo el id (el route arma la respuesta pública); NUNCA expone ip_hash.
 */
import { getDb, schema } from "@/db";

const { contactMessages } = schema;

export async function createContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  ipHash?: string | null;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const db = await getDb();
  await db.insert(contactMessages).values({
    id,
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
    read: false,
    ipHash: input.ipHash ?? null,
    createdAt: Date.now(),
  });
  return { id };
}
