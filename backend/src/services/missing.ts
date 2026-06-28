/**
 * Service de personas desaparecidas. La LÓGICA y las consultas viven aquí (no en
 * el route). El workflow de port debe trasladar la implementación real desde el
 * lib/missing.ts del app Next previo (listMissingPage / addMissing / fotos /
 * stats / map), preservando el comportamiento EXACTO, y devolviendo SIEMPRE DTOs
 * por allowlist (toMissingDTO) — nunca la fila de DB cruda.
 *
 * Por ahora define los tipos + DTO + firmas para fijar el contrato; las consultas
 * Drizzle se completan en el port reusando getDb() de @/db.
 */
import { getDb, schema } from "@/db";

// DTO público (allowlist explícita de campos — NUNCA exponer ip_hash, etc.)
export interface MissingDTO {
  id: string;
  name: string;
  age: number | null;
  nationality: string;
  description: string;
  lastSeen: string;
  contact: string;
  photoUrl: string | null;
  status: "active" | "found";
  createdAt: number;
}

export interface ListResult {
  people: MissingDTO[];
  total: number;
  totalCapped: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  persistent: boolean;
}

export interface ListParams {
  status: "active" | "found" | "all";
  page: number;
  pageSize: number;
  search?: string;
}

export interface CreateInput {
  name: string;
  age?: number | string | null;
  nationality?: string;
  description?: string;
  lastSeen?: string;
  contact?: string;
  photo?: string | null;
  reportType?: "missing" | "found";
}

/** Allowlist de salida: fila DB -> DTO público.
 *
 *  IMPORTANTE sobre fotos (verificado contra lib/missing.ts + r2.ts):
 *   - La columna `photo` está SOBRECARGADA: con R2 configurado guarda la URL de
 *     R2 (puntero), sin R2 guarda el data-URL base64. `photoExternalUrl` es de la
 *     pipeline de import (fuentes externas), distinta de las fotos de usuario.
 *   - NUNCA exponemos `photo` cruda al cliente (puede ser base64 pesado, y aunque
 *     sea URL de R2 queremos una indirección estable). El DTO expone SIEMPRE la
 *     ruta /api/missing/:id/photo, que internamente hace 302 a R2 o sirve bytes.
 *   - photoUrl = esa ruta si hay CUALQUIER foto (photo o photoExternalUrl), si no null. */
export function toMissingDTO(row: typeof schema.missingPersons.$inferSelect): MissingDTO {
  const hasPhoto = Boolean(row.photo || row.photoExternalUrl);
  const photoUrl = hasPhoto ? `/api/missing/${row.id}/photo` : null;
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    nationality: row.nationality ?? "",
    description: row.description ?? "",
    lastSeen: row.lastSeen ?? "",
    contact: row.contact ?? "",
    photoUrl,
    status: (row.status as "active" | "found") ?? "active",
    createdAt: Number(row.createdAt),
  };
}

export function isValidPhotoDataUrl(photo: string): boolean {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/.test(photo);
}

// PORT: trasladar la consulta paginada real (trigram search, count cap, etc.)
// desde lib/missing.ts:listMissingPage. Firma y salida ya fijadas arriba.
export async function listMissingPage(_params: ListParams): Promise<ListResult> {
  await getDb();
  throw new Error("PORT_PENDING: listMissingPage — trasladar lógica de lib/missing.ts");
}

// PORT: trasladar addMissing (normalización, R2 upload, insert) desde lib/missing.ts.
export async function addMissing(_input: CreateInput): Promise<MissingDTO> {
  await getDb();
  throw new Error("PORT_PENDING: addMissing — trasladar lógica de lib/missing.ts");
}
