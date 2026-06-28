#!/usr/bin/env node
/**
 * Rellena grupos no destructivos e hashes de imagen para registros historicos.
 *
 * Solo calcula hashes de fotos que siguen guardadas como data URL local. No
 * descarga fotos externas ni CDN para evitar tocar evidencia remota desde un
 * script manual.
 *
 * Uso:
 *   npm run missing:backfill-groups -- --limit 500
 *   npm run missing:backfill-groups -- --dry-run --limit 20
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../lib/drizzle";
import { parsePhotoDataUrl } from "../lib/photo-hash";
import {
  materializedPersonGroup,
  personGroupSignal,
} from "../lib/person-groups";

const args = parseArgs(process.argv.slice(2));
await loadEnvLocal();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no configurada.");
  process.exit(1);
}

const db = getDb();
const limitSql = args.limit ? sql`LIMIT ${args.limit}` : sql``;
const rows = execRows<Row>(
  await db.execute(sql`
    SELECT id, name, age, last_seen, person_group_id, photo, resolution_photo
    FROM missing_persons
    WHERE group_match_kind IS NULL
       OR (group_match_kind IN ('name_age', 'name_location') AND person_group_id IS NULL)
       OR (photo_hash IS NULL AND photo LIKE 'data:image/%;base64,%')
       OR (resolution_photo_hash IS NULL AND resolution_photo LIKE 'data:image/%;base64,%')
    ORDER BY created_at DESC, id DESC
    ${limitSql}
  `),
);

const groupIds = new Set<string>();
let updated = 0;
let imageHashes = 0;
let duplicateHashes = 0;

for (const row of rows) {
  const age = row.age === null ? null : Number(row.age);
  const group = materializedPersonGroup(
    personGroupSignal({ name: row.name, age, lastSeen: row.last_seen }),
  );
  const photoHash = photoHashFromStored(row.photo);
  const resolutionPhotoHash = photoHashFromStored(row.resolution_photo);
  if (row.person_group_id) groupIds.add(row.person_group_id);
  if (group.groupId) groupIds.add(group.groupId);

  if (args.dryRun) {
    updated++;
    if (photoHash) imageHashes++;
    if (resolutionPhotoHash) imageHashes++;
    continue;
  }

  await db.execute(sql`
    UPDATE missing_persons
    SET person_group_id = ${group.groupId},
        group_match_kind = ${group.matchKind},
        photo_hash = COALESCE(photo_hash, ${photoHash}),
        resolution_photo_hash = COALESCE(resolution_photo_hash, ${resolutionPhotoHash})
    WHERE id = ${row.id}
  `);
  updated++;

  for (const entry of [
    photoHash ? { hash: photoHash, purpose: "missing_photo" } : null,
    resolutionPhotoHash
      ? { hash: resolutionPhotoHash, purpose: "resolution_photo" }
      : null,
  ].filter((entry): entry is { hash: string; purpose: string } => Boolean(entry))) {
    const inserted = execRows<{ photo_hash: string }>(
      await db.execute(sql`
        INSERT INTO missing_person_image_hashes (
          photo_hash,
          missing_person_id,
          purpose,
          created_at
        ) VALUES (
          ${entry.hash},
          ${row.id},
          ${entry.purpose},
          ${Date.now()}
        )
        ON CONFLICT DO NOTHING
        RETURNING photo_hash
      `),
    );
    if (inserted.length > 0) imageHashes++;
    else duplicateHashes++;
  }
}

if (!args.dryRun) {
  for (const groupId of groupIds) {
    await rebuildGroup(groupId);
  }
}

console.log(args.dryRun ? "Dry-run completado" : "Backfill completado");
console.log(`Registros revisados: ${rows.length}`);
console.log(`Registros actualizados: ${updated}`);
console.log(`Hashes registrados: ${imageHashes}`);
console.log(`Hashes ya existentes: ${duplicateHashes}`);
console.log(`Grupos recalculados: ${groupIds.size}`);

interface Row {
  id: string;
  name: string;
  age: string | number | null;
  last_seen: string | null;
  person_group_id: string | null;
  photo: string | null;
  resolution_photo: string | null;
}

function execRows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

function photoHashFromStored(stored: string | null): string | null {
  if (!stored || /^https?:\/\//i.test(stored)) return null;
  return parsePhotoDataUrl(stored)?.hash ?? null;
}

async function rebuildGroup(groupId: string): Promise<void> {
  const now = Date.now();
  await db.execute(sql`
    INSERT INTO missing_person_groups (
      id,
      display_name,
      normalized_name,
      representative_area,
      status,
      report_count,
      has_identity_document,
      status_conflict,
      created_at,
      updated_at
    )
    SELECT
      ${groupId},
      COALESCE((array_agg(name ORDER BY created_at DESC))[1], ''),
      COALESCE((array_agg(lower(trim(name)) ORDER BY created_at DESC))[1], ''),
      COALESCE((array_agg(last_seen ORDER BY created_at DESC))[1], ''),
      CASE WHEN count(*) FILTER (WHERE COALESCE(status, 'active') = 'active') > 0
        THEN 'active'
        ELSE 'found'
      END,
      count(*)::int,
      bool_or(identity_document_hash IS NOT NULL),
      count(DISTINCT COALESCE(status, 'active')) > 1,
      ${now},
      ${now}
    FROM missing_persons
    WHERE person_group_id = ${groupId}
    HAVING count(*) > 0
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      normalized_name = EXCLUDED.normalized_name,
      representative_area = EXCLUDED.representative_area,
      status = EXCLUDED.status,
      report_count = EXCLUDED.report_count,
      has_identity_document = EXCLUDED.has_identity_document,
      status_conflict = EXCLUDED.status_conflict,
      updated_at = EXCLUDED.updated_at
  `);
  await db.execute(sql`
    DELETE FROM missing_person_groups
    WHERE id = ${groupId}
      AND NOT EXISTS (
        SELECT 1 FROM missing_persons WHERE person_group_id = ${groupId}
      )
  `);
}

function parseArgs(argv: string[]): { dryRun: boolean; limit: number | null } {
  const out = { dryRun: false, limit: null as number | null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") out.dryRun = true;
    else if (argv[i] === "--limit") {
      const n = Math.trunc(Number(argv[++i]));
      out.limit = Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return out;
}

async function loadEnvLocal(): Promise<void> {
  try {
    const raw = await readFile(resolve(".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env.local is optional; production/CI should inject DATABASE_URL directly.
  }
}
