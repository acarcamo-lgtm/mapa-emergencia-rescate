import { getSql, hasDbEnv } from "./db";
import {
  COLLECTION_CENTER_SEED,
  MAX_COLLECTION_CENTER_ADDRESS,
  MAX_COLLECTION_CENTER_FIELD,
  MAX_COLLECTION_CENTER_ITEM,
  MAX_COLLECTION_CENTER_ITEMS,
  MAX_COLLECTION_CENTER_PHONES,
  MAX_COLLECTION_CENTER_SOURCE,
  type CollectionCenter,
  type CollectionCenterInput,
} from "./collection-centers-meta";

export * from "./collection-centers-meta";

let _schemaReady: Promise<void> | null = null;
let _seedDone = false;

function ensureSchema(): Promise<void> {
  if (!_schemaReady) {
    const sql = getSql();
    _schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS collection_centers (
          id TEXT PRIMARY KEY,
          organization TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT '',
          municipality TEXT NOT NULL DEFAULT '',
          parish TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          items TEXT NOT NULL DEFAULT '',
          schedule TEXT NOT NULL DEFAULT '',
          phones TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT '',
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_collection_centers_location
        ON collection_centers (state, municipality, organization)
      `;
    })().catch((err) => {
      _schemaReady = null;
      throw err;
    });
  }
  return _schemaReady;
}

async function seedCollectionCentersIfNeeded(): Promise<void> {
  if (_seedDone) return;
  _seedDone = true;
  const sql = getSql();
  const [{ count }] = (await sql`
    SELECT COUNT(*)::int AS count FROM collection_centers
  `) as { count: number }[];
  if (count > 0) return;

  const now = Date.now();
  for (const center of COLLECTION_CENTER_SEED) {
    await sql`
      INSERT INTO collection_centers (
        id, organization, state, municipality, parish, address, items,
        schedule, phones, source, created_at, updated_at
      ) VALUES (
        ${center.id}, ${center.organization}, ${center.state},
        ${center.municipality}, ${center.parish}, ${center.address},
        ${serializeList(center.items)}, ${center.schedule},
        ${serializeList(center.phones)}, ${center.source}, ${now}, ${now}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

interface CollectionCenterRow {
  id: string;
  organization: string;
  state: string;
  municipality: string;
  parish: string;
  address: string;
  items: string;
  schedule: string;
  phones: string;
  source: string;
  created_at: string | number;
  updated_at: string | number;
}

const memoryCenters = new Map<string, CollectionCenter>();
let memorySeeded = false;

function ensureMemorySeed(): void {
  if (memorySeeded) return;
  memorySeeded = true;
  const now = Date.now();
  for (const center of COLLECTION_CENTER_SEED) {
    memoryCenters.set(center.id, {
      ...center,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function clip(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > max ? text.slice(0, max) : text;
}

function sanitizeList(
  values: unknown[] | undefined,
  maxItems: number,
): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const item = clip(value, MAX_COLLECTION_CENTER_ITEM);
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

function serializeList(values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join("\n");
}

function parseList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeInput(input: CollectionCenterInput): CollectionCenterInput {
  return {
    organization: clip(input.organization, MAX_COLLECTION_CENTER_FIELD),
    state: clip(input.state, MAX_COLLECTION_CENTER_FIELD),
    municipality: clip(input.municipality, MAX_COLLECTION_CENTER_FIELD),
    parish: clip(input.parish, MAX_COLLECTION_CENTER_FIELD),
    address: clip(input.address, MAX_COLLECTION_CENTER_ADDRESS),
    items: sanitizeList(input.items, MAX_COLLECTION_CENTER_ITEMS),
    schedule: clip(input.schedule, MAX_COLLECTION_CENTER_FIELD),
    phones: sanitizeList(input.phones, MAX_COLLECTION_CENTER_PHONES),
    source: clip(input.source, MAX_COLLECTION_CENTER_SOURCE),
  };
}

function rowToCenter(row: CollectionCenterRow): CollectionCenter {
  return {
    id: row.id,
    organization: row.organization,
    state: row.state,
    municipality: row.municipality,
    parish: row.parish,
    address: row.address,
    items: parseList(row.items),
    schedule: row.schedule,
    phones: parseList(row.phones),
    source: row.source,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function listCollectionCenters(): Promise<CollectionCenter[]> {
  if (hasDbEnv()) {
    await ensureSchema();
    await seedCollectionCentersIfNeeded();
    const rows = (await getSql()`
      SELECT id, organization, state, municipality, parish, address, items,
             schedule, phones, source, created_at, updated_at
      FROM collection_centers
      ORDER BY state, municipality, organization
    `) as CollectionCenterRow[];
    return rows.map(rowToCenter);
  }

  ensureMemorySeed();
  return [...memoryCenters.values()].sort((a, b) => {
    const byState = a.state.localeCompare(b.state);
    if (byState !== 0) return byState;
    const byMunicipality = a.municipality.localeCompare(b.municipality);
    if (byMunicipality !== 0) return byMunicipality;
    return a.organization.localeCompare(b.organization);
  });
}

export async function addCollectionCenter(
  input: CollectionCenterInput,
): Promise<CollectionCenter> {
  const normalized = normalizeInput(input);
  if (!normalized.organization) {
    throw new Error("La organización es obligatoria.");
  }
  if (!normalized.state) {
    throw new Error("El estado es obligatorio.");
  }
  if (!normalized.address) {
    throw new Error("La dirección o referencia es obligatoria.");
  }

  const now = Date.now();
  const center: CollectionCenter = {
    id: crypto.randomUUID(),
    organization: normalized.organization,
    state: normalized.state,
    municipality: normalized.municipality ?? "",
    parish: normalized.parish ?? "",
    address: normalized.address,
    items: normalized.items ?? [],
    schedule: normalized.schedule ?? "",
    phones: normalized.phones ?? [],
    source: normalized.source ?? "",
    createdAt: now,
    updatedAt: now,
  };

  if (hasDbEnv()) {
    await ensureSchema();
    await getSql()`
      INSERT INTO collection_centers (
        id, organization, state, municipality, parish, address, items,
        schedule, phones, source, created_at, updated_at
      ) VALUES (
        ${center.id}, ${center.organization}, ${center.state},
        ${center.municipality}, ${center.parish}, ${center.address},
        ${serializeList(center.items)}, ${center.schedule},
        ${serializeList(center.phones)}, ${center.source},
        ${center.createdAt}, ${center.updatedAt}
      )
    `;
    return center;
  }

  ensureMemorySeed();
  memoryCenters.set(center.id, center);
  return center;
}

export async function updateCollectionCenter(
  id: string,
  input: CollectionCenterInput,
): Promise<CollectionCenter | null> {
  const normalized = normalizeInput(input);
  if (!normalized.organization) {
    throw new Error("La organización es obligatoria.");
  }
  if (!normalized.state) {
    throw new Error("El estado es obligatorio.");
  }
  if (!normalized.address) {
    throw new Error("La dirección o referencia es obligatoria.");
  }

  const updatedAt = Date.now();
  if (hasDbEnv()) {
    await ensureSchema();
    const rows = (await getSql()`
      UPDATE collection_centers
      SET organization = ${normalized.organization},
          state = ${normalized.state},
          municipality = ${normalized.municipality ?? ""},
          parish = ${normalized.parish ?? ""},
          address = ${normalized.address},
          items = ${serializeList(normalized.items ?? [])},
          schedule = ${normalized.schedule ?? ""},
          phones = ${serializeList(normalized.phones ?? [])},
          source = ${normalized.source ?? ""},
          updated_at = ${updatedAt}
      WHERE id = ${id}
      RETURNING id, organization, state, municipality, parish, address, items,
                schedule, phones, source, created_at, updated_at
    `) as CollectionCenterRow[];
    return rows[0] ? rowToCenter(rows[0]) : null;
  }

  ensureMemorySeed();
  const existing = memoryCenters.get(id);
  if (!existing) return null;
  const next: CollectionCenter = {
    ...existing,
    organization: normalized.organization,
    state: normalized.state,
    municipality: normalized.municipality ?? "",
    parish: normalized.parish ?? "",
    address: normalized.address,
    items: normalized.items ?? [],
    schedule: normalized.schedule ?? "",
    phones: normalized.phones ?? [],
    source: normalized.source ?? "",
    updatedAt,
  };
  memoryCenters.set(id, next);
  return next;
}

export async function removeCollectionCenter(id: string): Promise<boolean> {
  if (hasDbEnv()) {
    await ensureSchema();
    const rows = (await getSql()`
      DELETE FROM collection_centers WHERE id = ${id} RETURNING id
    `) as { id: string }[];
    return rows.length > 0;
  }

  ensureMemorySeed();
  return memoryCenters.delete(id);
}

export interface CollectionCenterImportResult {
  inserted: number;
  errors: number;
}

export async function importCollectionCenters(
  centers: CollectionCenterInput[],
): Promise<CollectionCenterImportResult> {
  const limited = centers.slice(0, 200);
  let inserted = 0;
  let errors = 0;
  for (const center of limited) {
    try {
      await addCollectionCenter(center);
      inserted += 1;
    } catch {
      errors += 1;
    }
  }
  return { inserted, errors };
}
