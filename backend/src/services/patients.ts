/**
 * Service de búsqueda de pacientes hospitalizados. Port directo de
 * lib/hospitals.ts:searchPatients (rama hasDbEnv), preservando EXACTAMENTE el
 * SQL (REGEXP_REPLACE para cédulas, los CASE de orden) vía el escape `sql` de
 * drizzle-orm, y el contrato de salida { patient, hospital } por resultado.
 *
 * publicSafe: el route público SIEMPRE pasa publicSafe=true → WHERE solo por
 * nombre (no notas/contacto/cédula) para que un caller anónimo no enumere por
 * cédula/teléfono parcial (audit C-1). Los campos de contacto SÍ se devuelven
 * (decisión de producto), pero no son vector de búsqueda público.
 *
 * NOTA de seeding: el lib previo llamaba seedHospitalsIfNeeded() en el request
 * path. En el backend el seed de hospitales es responsabilidad del Job de
 * migrate/seed, NO del request path (evita 174 inserts inline). Si la tabla está
 * vacía, la búsqueda devuelve []. (ponytail: seed fuera del request path.)
 *
 * Allowlist de salida: toSearchResultDTO selecciona campos explícitos; las filas
 * de paciente no tienen columnas sensibles tipo ip_hash.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export type PatientStatus =
  | "hospitalized"
  | "discharged"
  | "transferred"
  | "deceased";
export type PatientCondition =
  | "stable"
  | "serious"
  | "critical"
  | "recovering"
  | "unknown";

const PATIENT_STATUSES: ReadonlySet<PatientStatus> = new Set([
  "hospitalized",
  "discharged",
  "transferred",
  "deceased",
]);
const PATIENT_CONDITIONS: ReadonlySet<PatientCondition> = new Set([
  "stable",
  "serious",
  "critical",
  "recovering",
  "unknown",
]);

export interface PatientDTO {
  id: string;
  hospitalId: string;
  name: string;
  age: number | null;
  condition: PatientCondition;
  status: PatientStatus;
  notes: string;
  contact: string;
  admittedAt: number;
  updatedAt: number;
}

export interface PatientSearchResult {
  patient: PatientDTO;
  hospital: {
    id: string;
    name: string;
    state: string;
    municipality: string;
    address: string;
  };
}

// Fila cruda devuelta por el SELECT con join (camelCase por los alias del SQL).
interface PatientWithHospitalRow {
  id: string;
  hospitalId: string;
  name: string;
  age: number | null;
  condition: string;
  status: string;
  notes: string | null;
  contact: string | null;
  admittedAt: number;
  updatedAt: number;
  hospitalName: string;
  hospitalState: string;
  hospitalMunicipality: string;
  hospitalAddress: string;
}

function rowToPatientDTO(r: PatientWithHospitalRow): PatientDTO {
  return {
    id: r.id,
    hospitalId: r.hospitalId,
    name: r.name,
    age: r.age === null ? null : Number(r.age),
    condition: PATIENT_CONDITIONS.has(r.condition as PatientCondition)
      ? (r.condition as PatientCondition)
      : "unknown",
    status: PATIENT_STATUSES.has(r.status as PatientStatus)
      ? (r.status as PatientStatus)
      : "hospitalized",
    notes: r.notes ?? "",
    contact: r.contact ?? "",
    admittedAt: Number(r.admittedAt),
    updatedAt: Number(r.updatedAt),
  };
}

function rowToSearchResult(r: PatientWithHospitalRow): PatientSearchResult {
  return {
    patient: rowToPatientDTO(r),
    hospital: {
      id: r.hospitalId,
      name: r.hospitalName,
      state: r.hospitalState,
      municipality: r.hospitalMunicipality,
      address: r.hospitalAddress,
    },
  };
}

/**
 * Búsqueda global de pacientes. Port de lib/hospitals.ts:searchPatients.
 * @param limit ya viene acotado por el route (safeLimit + 1 para detectar hasMore).
 */
export async function searchPatients(
  query: string,
  limit = 50,
  opts: { publicSafe?: boolean } = {},
): Promise<PatientSearchResult[]> {
  const q = (query ?? "").trim();
  const cleanLimit = Math.min(Math.max(limit, 1), 200);
  const publicSafe = opts.publicSafe ?? false;
  const db = await getDb();

  // REGEXP_REPLACE y los CASE de orden no se expresan con el query builder sin
  // perder fidelidad: se preserva el SQL exacto vía escape `sql`.
  const baseSelect = sql`
    SELECT
      p.id, p.hospital_id AS "hospitalId", p.name, p.age, p.condition,
      p.status, p.notes, p.contact, p.admitted_at AS "admittedAt",
      p.updated_at AS "updatedAt",
      h.name AS "hospitalName",
      h.state AS "hospitalState",
      h.municipality AS "hospitalMunicipality",
      h.address AS "hospitalAddress"
    FROM hospital_patients p
    INNER JOIN hospitals h ON h.id = p.hospital_id
  `;

  if (!q) {
    const result = await db.execute(sql`
      ${baseSelect}
      ORDER BY
        CASE p.status WHEN 'hospitalized' THEN 0 ELSE 1 END,
        p.admitted_at DESC
      LIMIT ${cleanLimit}
    `);
    const rows = (Array.isArray(result)
      ? result
      : result.rows) as PatientWithHospitalRow[];
    return rows.map(rowToSearchResult);
  }

  if (q.length < 2) return [];

  const like = `%${q.toLowerCase()}%`;
  // Para cédulas el usuario puede escribir con o sin puntos: comparo también
  // contra una versión "limpia" (solo dígitos) de las notas.
  const digits = q.replace(/[^0-9]/g, "");
  const digitsLike = digits.length >= 4 ? `%${digits}%` : null;

  const whereSql = publicSafe
    ? sql`WHERE LOWER(p.name) LIKE ${like}`
    : sql`WHERE
        LOWER(p.name) LIKE ${like}
        OR LOWER(p.notes) LIKE ${like}
        OR LOWER(p.contact) LIKE ${like}
        OR (${digitsLike}::text IS NOT NULL
            AND REGEXP_REPLACE(p.notes, '[^0-9]', '', 'g') LIKE ${digitsLike})`;

  const result = await db.execute(sql`
    ${baseSelect}
    ${whereSql}
    ORDER BY
      CASE WHEN LOWER(p.name) LIKE ${like} THEN 0 ELSE 1 END,
      p.admitted_at DESC
    LIMIT ${cleanLimit}
  `);
  const rows = (Array.isArray(result)
    ? result
    : result.rows) as PatientWithHospitalRow[];
  return rows.map(rowToSearchResult);
}
