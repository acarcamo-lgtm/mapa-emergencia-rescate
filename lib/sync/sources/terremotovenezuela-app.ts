/**
 * Adaptador para la API de deduplicación de terremotovenezuela.app.
 *
 * Fuente: Venezuela Dedupe Review API (FastAPI).
 *   - Swagger: https://venezuela-terremoto-c4gafbfpc0dadpcj.eastus-01.azurewebsites.net/docs
 *   - OpenAPI: /openapi.json
 *
 * La API expone grupos de registros ya revisados manualmente. Cada grupo contiene
 * uno o más records (personas). Para obtener los records hay que:
 *   1. Listar grupos paginados con GET /api/groups?limit=N&offset=M.
 *   2. Para cada grupo, consultar GET /api/groups/{group_id} y leer `records`.
 *
 * El adaptador soporta tanto `fetchAll` como `fetchPage`, de modo que el motor de
 * sync pueda ejecutarlo en modo chunked (recomendado: hay miles de grupos).
 *
 * Privacidad:
 *   - `contact_phone_e164` NO se importa salvo que se active el flag explicito.
 *   - Se respetan los límites de tamaño de `lib/missing.ts`.
 *   - Se usa un User-Agent identificable y pausas entre peticiones.
 */

import type { SourceAdapter, FetchCtx, ExternalPerson } from "../types";
import { normalizeAge } from "../normalize";

const SOURCE_ID = "terremotovenezuela.app";
const DEFAULT_BASE_URL =
  "https://venezuela-terremoto-c4gafbfpc0dadpcj.eastus-01.azurewebsites.net";

const FETCH_TIMEOUT_MS = 45_000;
const INTER_PAGE_DELAY_MS = 200;
const DEFAULT_GROUPS_PER_RUN = 100;
const MAX_GROUPS_PER_RUN = 200;
const HARD_GROUP_CAP = 10_000;

interface ApiGroupSummary {
  group_id: string;
  record_count: number;
  duplicate_record_count?: number;
  family_record_count?: number;
  duplicate_cluster_count?: number;
  sample_names?: string[];
  sample_locations?: string[];
  sample_phones?: string[];
  primary_record_ids?: string[];
}

interface ApiRecord {
  record_id: string;
  group_id?: string | null;
  duplicate_cluster_id?: string | null;
  proposed_primary_record_id?: string | null;
  duplicate_role?: string | null;
  relationship_bucket?: string | null;
  person_name_raw?: string | null;
  age?: number | string | null;
  last_seen_location_raw?: string | null;
  contact_phone_e164?: string | null;
  source_text_raw?: string | null;
  image_public_path?: string | null;
  status?: string | null;
  folio?: string | null;
  manual_group_status?: string | null;
}

interface ApiGroupDetail {
  group: ApiGroupSummary;
  records: ApiRecord[];
  relationships: unknown[];
}

interface GroupsResponse {
  groups: ApiGroupSummary[];
  total: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function baseUrl(): string {
  return (
    process.env.SOURCE_TERREMOTOVENEZUELAAPP_URL || DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
}

function datasetSlug(): string | null {
  const s = (process.env.SOURCE_TERREMOTOVENEZUELAAPP_DATASET_SLUG || "").trim();
  return s || null;
}

function groupsPerRun(): number {
  const raw = process.env.SOURCE_TERREMOTOVENEZUELAAPP_GROUPS_PER_RUN || "";
  const n = Math.trunc(Number(raw || String(DEFAULT_GROUPS_PER_RUN)));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_GROUPS_PER_RUN;
  return Math.min(n, MAX_GROUPS_PER_RUN);
}

function importContact(): boolean {
  return process.env.SOURCE_TERREMOTOVENEZUELAAPP_IMPORT_CONTACT === "true";
}

function apiPath(suffix: string): string {
  const slug = datasetSlug();
  if (slug) return `${baseUrl()}/${slug}${suffix}`;
  return `${baseUrl()}${suffix}`;
}

function absolutePhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path.slice(0, 600);
  const base = baseUrl();
  return (base + (path.startsWith("/") ? path : `/${path}`)).slice(0, 600);
}

function mapStatus(status: string | null | undefined): "active" | "found" {
  const s = (status ?? "").toLowerCase();
  if (
    s === "found" ||
    s === "localizado" ||
    s === "resolved" ||
    s === "encontrado"
  ) {
    return "found";
  }
  return "active";
}

function mapPerson(r: ApiRecord): ExternalPerson | null {
  const externalId = String(r.record_id ?? "").trim();
  const name = String(r.person_name_raw ?? "").trim();
  if (!externalId || !name) return null;

  const status = mapStatus(r.status);
  const descriptionParts = [r.source_text_raw, r.folio].filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  const description = descriptionParts.join(" | ").trim();

  return {
    externalId,
    source: SOURCE_ID,
    sourceUrl: null,
    name,
    age: normalizeAge(r.age),
    lastSeen: r.last_seen_location_raw ?? null,
    description: description || null,
    contact: importContact() ? (r.contact_phone_e164 ?? null) : null,
    photoUrl: absolutePhotoUrl(r.image_public_path),
    status,
    resolutionNote: null,
    resolvedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function requestGroups(
  offset: number,
  limit: number,
  ctx: FetchCtx,
): Promise<GroupsResponse> {
  const url = new URL(apiPath("/api/groups"));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  ctx.signal?.addEventListener("abort", () => controller.abort());

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": ctx.userAgent },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} al listar grupos de ${SOURCE_ID} (offset ${offset})`,
      );
    }
    const body = (await res.json()) as GroupsResponse;
    return { groups: body.groups ?? [], total: body.total ?? 0 };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGroupDetail(
  groupId: string,
  ctx: FetchCtx,
): Promise<ApiGroupDetail> {
  const url = new URL(
    apiPath(`/api/groups/${encodeURIComponent(groupId)}`),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  ctx.signal?.addEventListener("abort", () => controller.abort());

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": ctx.userAgent },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} al consultar grupo ${groupId} de ${SOURCE_ID}`,
      );
    }
    return (await res.json()) as ApiGroupDetail;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Trae los records de un chunk de grupos, evitando duplicados por
 * `record_id` dentro del chunk.
 */
async function fetchRecordsForGroups(
  groups: ApiGroupSummary[],
  ctx: FetchCtx,
): Promise<ExternalPerson[]> {
  const seen = new Set<string>();
  const people: ExternalPerson[] = [];

  for (const g of groups) {
    const detail = await requestGroupDetail(g.group_id, ctx);
    for (const r of detail.records ?? []) {
      const person = mapPerson(r);
      if (!person || seen.has(person.externalId)) continue;
      seen.add(person.externalId);
      people.push(person);
    }
    if (groups.length > 1) await sleep(INTER_PAGE_DELAY_MS);
  }
  return people;
}

export const terremotoVenezuelaAppAdapter: SourceAdapter = {
  id: SOURCE_ID,
  label: "terremotovenezuela.app (Dedupe Review)",
  kind: "json-api",

  async fetchAll(ctx: FetchCtx): Promise<ExternalPerson[]> {
    const limit = ctx.limit ?? Infinity;
    const perRun = groupsPerRun();
    const seen = new Set<string>();
    const people: ExternalPerson[] = [];
    let offset = 0;
    let totalGroups = Infinity;

    while (
      offset < totalGroups &&
      offset < HARD_GROUP_CAP &&
      people.length < limit
    ) {
      const { groups, total } = await requestGroups(
        offset,
        perRun,
        ctx,
      );
      totalGroups = total;
      if (groups.length === 0) break;

      for (const g of groups) {
        if (people.length >= limit) break;
        const detail = await requestGroupDetail(g.group_id, ctx);
        for (const r of detail.records ?? []) {
          const person = mapPerson(r);
          if (!person || seen.has(person.externalId)) continue;
          seen.add(person.externalId);
          people.push(person);
          if (people.length >= limit) break;
        }
        await sleep(INTER_PAGE_DELAY_MS);
      }

      offset += groups.length;
    }

    return people;
  },

  async fetchPage(page: number, ctx: FetchCtx) {
    const perRun = groupsPerRun();
    const offset = (page - 1) * perRun;
    const { groups, total } = await requestGroups(offset, perRun, ctx);

    const totalPages =
      typeof total === "number" && total > 0
        ? Math.ceil(total / perRun)
        : null;

    const people = await fetchRecordsForGroups(groups, ctx);
    return { people, totalPages };
  },
};
