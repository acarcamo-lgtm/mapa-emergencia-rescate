/**
 * Service de coordinación de recursos privados — Fase 1 (pool de oferta).
 *
 * La LÓGICA y las consultas Drizzle viven aquí (no en el route), igual que
 * services/reports.ts. El caso de uso: cerrar el ciclo del mapa con la OFERTA
 * privada (maquinaria, flete, combustible, voluntarios, etc.) que alguien
 * aporta para llegar a las zonas afectadas.
 *
 * Privacidad: `whatsapp` es PII. El DTO de lista (`RecursoDTO`) NO lo incluye;
 * el contacto se entrega solo, y con rate-limit por ruta, vía `getContacto(id)`,
 * para evitar el scraping masivo de números desde el listado público.
 */
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { serviceUnavailable } from "@/lib/errors";

const { coordKinds, coordRecursos } = schema;

/** Definición de un campo del formulario, declarada en el registro de tipos. */
export interface CampoDef {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

/** DTO del tipo de recurso (registro/ontología). */
export interface KindDTO {
  key: string;
  label: string;
  icono: string;
  categoria: string;
  campos: CampoDef[];
  movilizaCon: string[];
  esPiezaDeMision: boolean;
  orden: number;
}

/** DTO público del recurso. ALLOWLIST explícita: SIN `whatsapp` (PII). */
export interface RecursoDTO {
  id: string;
  kind: string;
  estado: string;
  nombreContacto: string;
  zona: string | null;
  atributos: Record<string, string>;
  createdAt: number;
}

export interface OfrecerInput {
  kind: string;
  nombre: string;
  whatsapp: string;
  zona?: string;
  atributos?: Record<string, string>;
}

/** Contacto revelado bajo demanda (incluye el WhatsApp; ruta con rate-limit). */
export interface ContactoDTO {
  nombreContacto: string;
  whatsapp: string;
  whatsappLink: string;
}

export async function listKinds(): Promise<KindDTO[]> {
  const db = getDb();
  const rows = await db.select().from(coordKinds).orderBy(coordKinds.orden);
  return rows.map((k) => ({
    key: k.key,
    label: k.label,
    icono: k.icono,
    categoria: k.categoria,
    campos: (k.campos as CampoDef[]) ?? [],
    movilizaCon: (k.movilizaCon as string[]) ?? [],
    esPiezaDeMision: k.esPiezaDeMision,
    orden: k.orden,
  }));
}

export async function kindExists(key: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ key: coordKinds.key })
    .from(coordKinds)
    .where(eq(coordKinds.key, key))
    .limit(1);
  return rows.length > 0;
}

function toDTO(r: typeof coordRecursos.$inferSelect): RecursoDTO {
  return {
    id: r.id,
    kind: r.kind,
    estado: r.estado,
    nombreContacto: r.nombreContacto,
    zona: r.zona,
    atributos: (r.atributos as Record<string, string>) ?? {},
    createdAt: r.createdAt,
  };
}

/** Pool de recursos disponibles (más recientes primero). */
export async function listDisponibles(): Promise<RecursoDTO[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(coordRecursos)
    .where(eq(coordRecursos.estado, "disponible"))
    .orderBy(desc(coordRecursos.createdAt));
  return rows.map(toDTO);
}

export async function ofrecer(input: OfrecerInput): Promise<RecursoDTO> {
  const db = getDb();
  const [row] = await db
    .insert(coordRecursos)
    .values({
      id: randomUUID(),
      kind: input.kind,
      estado: "disponible",
      nombreContacto: input.nombre.trim(),
      whatsapp: input.whatsapp.trim(),
      zona: input.zona?.trim() || null,
      atributos: input.atributos ?? {},
      createdAt: Date.now(),
    })
    .returning();
  if (!row) throw serviceUnavailable("No se pudo guardar el recurso. Inténtalo de nuevo.");
  return toDTO(row);
}

/** Revela el contacto de un recurso (PII). La ruta lo protege con rate-limit. */
export async function getContacto(id: string): Promise<ContactoDTO | null> {
  const db = getDb();
  const [row] = await db
    .select({
      nombre: coordRecursos.nombreContacto,
      whatsapp: coordRecursos.whatsapp,
    })
    .from(coordRecursos)
    .where(eq(coordRecursos.id, id))
    .limit(1);
  if (!row) return null;
  const digits = row.whatsapp.replace(/[^\d]/g, "");
  return {
    nombreContacto: row.nombre,
    whatsapp: row.whatsapp,
    whatsappLink: `https://wa.me/${digits}`,
  };
}
