/**
 * Detección de posibles duplicados (read-only) — sub-fase 6a.
 *
 * NO modifica datos ni agrupa: solo reporta candidatos para que el equipo vea la
 * magnitud y la calidad antes de colapsar nada. Ver RFC §6 / análisis sobre
 * datos reales:
 *  - El NOMBRE agrupa candidatos (blocking), no confirma.
 *  - El discriminador NO es el número de edades, sino su CONCENTRACIÓN
 *    (edades_distintas / registros). En reportes masivos la gente adivina la
 *    edad, así que la misma persona tiene varias edades; lo que la delata es la
 *    redundancia. Ej.: "Vicky Urdaneta" 33 reg / 4 edades (ratio 0.12) = 1
 *    persona mass-reportada; "Carlos González" 15 reg / 10 edades (ratio 0.67)
 *    = ~10 personas distintas.
 *  - La UBICACIÓN es señal débil (la misma persona se escribe de formas muy
 *    distintas), por eso no se usa para descartar.
 */

import { sql } from "drizzle-orm";
import { getDb, hasDbEnv, schema } from "../drizzle";

const { missingPersons } = schema;

/** Umbral de concentración: edades_distintas/registros <= esto => misma persona. */
const AGE_RATIO_THRESHOLD = 0.34;

/** Clasifica un grupo (mismo nombre) por concentración de edades. */
export function classify(
  count: number,
  distinctAges: number,
): "same-person" | "homonyms" {
  if (distinctAges <= 1) return "same-person";
  return distinctAges / count <= AGE_RATIO_THRESHOLD ? "same-person" : "homonyms";
}

export interface DuplicateGroup {
  /** Nombre de muestra (uno de los originales del grupo). */
  name: string;
  count: number;
  /** Edades no nulas distintas dentro del grupo. */
  distinctAges: number;
  distinctLocations: number;
  /**
   * `same-person`: edades consistentes (0 o 1 edad no nula) -> probable misma
   * persona, candidata a agrupar.
   * `homonyms`: 2+ edades distintas -> probablemente varias personas, NO agrupar.
   */
  classification: "same-person" | "homonyms";
}

export interface DuplicateReport {
  source: string;
  /** Filas totales de la fuente consideradas. */
  totalRows: number;
  /** Grupos (nombre normalizado) con más de un registro. */
  duplicateGroups: number;
  /** Filas que sobran si se colapsara TODO grupo (techo bruto). */
  collapsibleRows: number;
  /** Grupos clasificados como misma persona (alta confianza). */
  samePersonGroups: number;
  /** Filas colapsables solo de los grupos same-person (estimación segura). */
  samePersonCollapsible: number;
  /** Grupos ambiguos (posibles homónimos) a revisar a mano. */
  homonymGroups: number;
  /** Grupos ya materializados por el modelo local no destructivo. */
  persistedGroups: number;
  /** Filas crudas cubiertas por grupos materializados de más de un reporte. */
  persistedGroupedReports: number;
  /** Grupos materializados con conflicto active/found. */
  statusConflictGroups: number;
  /** Hashes exactos de imagen registrados para compuerta de duplicados. */
  imageHashes: number;
  /** Hashes exactos repetidos entre filas históricas ya existentes. */
  exactImageDuplicateGroups: number;
  /** Filas históricas sobrantes dentro de hashes exactos repetidos. */
  exactImageDuplicateReports: number;
  topGroups: DuplicateGroup[];
  generatedAt: number;
}

interface Row {
  name: string;
  c: number;
  ages: number;
  locs: number;
}

function execRows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

export async function buildDuplicateReport(
  opts: { source?: string; limitGroups?: number } = {},
): Promise<DuplicateReport> {
  if (!hasDbEnv()) {
    throw new Error("buildDuplicateReport requiere DATABASE_URL.");
  }
  const source = opts.source ?? "desaparecidosterremotovenezuela.com";
  const limitGroups = Math.min(Math.max(Math.trunc(opts.limitGroups ?? 50), 1), 200);
  const db = getDb();

  // Una sola pasada: agrupa por nombre normalizado y cuenta edades/ubicaciones.
  // Usa el escape hatch `sql`: translate() + agregados FILTER no se expresan
  // limpiamente con el query builder. Semántica idéntica a la versión SQL cruda.
  const groups = execRows<Row>(
    await db.execute(sql`
      WITH norm AS (
        SELECT translate(lower(trim(${missingPersons.name})), 'áéíóúüñ', 'aeiouun') AS nm,
               ${missingPersons.name} AS name, ${missingPersons.age} AS age,
               translate(lower(trim(${missingPersons.lastSeen})), 'áéíóúüñ', 'aeiouun') AS loc
        FROM ${missingPersons}
        WHERE ${missingPersons.source} = ${source} AND trim(${missingPersons.name}) <> ''
      )
      SELECT min(name) AS name,
             count(*)::int AS c,
             count(DISTINCT age) FILTER (WHERE age IS NOT NULL)::int AS ages,
             count(DISTINCT loc) FILTER (WHERE loc <> '')::int AS locs
      FROM norm
      GROUP BY nm
      HAVING count(*) > 1
    `),
  );

  const totalRowsRes = execRows<{ n: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS n FROM ${missingPersons}
      WHERE ${missingPersons.source} = ${source} AND trim(${missingPersons.name}) <> ''
    `),
  );

  const groupStats = execRows<{
    persisted_groups: number;
    persisted_grouped_reports: number;
    status_conflict_groups: number;
  }>(
    await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE report_count > 1)::int AS persisted_groups,
        COALESCE(sum(report_count) FILTER (WHERE report_count > 1), 0)::int AS persisted_grouped_reports,
        count(*) FILTER (WHERE status_conflict)::int AS status_conflict_groups
      FROM missing_person_groups
    `),
  )[0] ?? {
    persisted_groups: 0,
    persisted_grouped_reports: 0,
    status_conflict_groups: 0,
  };

  const imageStats = execRows<{
    image_hashes: number;
    duplicate_groups: number;
    duplicate_reports: number;
  }>(
    await db.execute(sql`
      WITH duplicate_hashes AS (
        SELECT photo_hash, count(*)::int AS c
        FROM missing_persons
        WHERE photo_hash IS NOT NULL
        GROUP BY photo_hash
        HAVING count(*) > 1
      )
      SELECT
        (SELECT count(*)::int FROM missing_person_image_hashes) AS image_hashes,
        count(*)::int AS duplicate_groups,
        COALESCE(sum(c - 1), 0)::int AS duplicate_reports
      FROM duplicate_hashes
    `),
  )[0] ?? {
    image_hashes: 0,
    duplicate_groups: 0,
    duplicate_reports: 0,
  };

  let collapsibleRows = 0;
  let samePersonGroups = 0;
  let samePersonCollapsible = 0;
  let homonymGroups = 0;
  for (const g of groups) {
    collapsibleRows += g.c - 1;
    if (classify(g.c, g.ages) === "same-person") {
      samePersonGroups++;
      samePersonCollapsible += g.c - 1;
    } else {
      homonymGroups++;
    }
  }

  const topGroups: DuplicateGroup[] = [...groups]
    .sort((a, b) => b.c - a.c)
    .slice(0, limitGroups)
    .map((g) => ({
      name: g.name,
      count: g.c,
      distinctAges: g.ages,
      distinctLocations: g.locs,
      classification: classify(g.c, g.ages),
    }));

  return {
    source,
    totalRows: totalRowsRes[0]?.n ?? 0,
    duplicateGroups: groups.length,
    collapsibleRows,
    samePersonGroups,
    samePersonCollapsible,
    homonymGroups,
    persistedGroups: Number(groupStats.persisted_groups),
    persistedGroupedReports: Number(groupStats.persisted_grouped_reports),
    statusConflictGroups: Number(groupStats.status_conflict_groups),
    imageHashes: Number(imageStats.image_hashes),
    exactImageDuplicateGroups: Number(imageStats.duplicate_groups),
    exactImageDuplicateReports: Number(imageStats.duplicate_reports),
    topGroups,
    generatedAt: Date.now(),
  };
}
