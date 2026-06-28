import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, hasDbEnv, schema } from "./drizzle";
import { timeAgo } from "./format";
import {
  ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES,
  HOSPITAL_SUPPLY_CATEGORIES,
  HOSPITAL_SUPPLY_CATEGORY_META,
  HOSPITAL_SUPPLY_HELP_STATUSES,
  HOSPITAL_SUPPLY_NEED_STATUSES,
  HOSPITAL_SUPPLY_STATUSES,
  MAX_SUPPLY_ACTOR,
  MAX_SUPPLY_HELP_MESSAGE,
  MAX_SUPPLY_ITEM,
  MAX_SUPPLY_NOTE,
  MAX_SUPPLY_UNIT,
  type HospitalPocAssignment,
  type HospitalSupplyCategory,
  type HospitalSupplyHelpRequest,
  type HospitalSupplyHelpStatus,
  type HospitalSupplyNeedStatus,
  type HospitalSupplyStatus,
  type PublicHospitalSupplyNeed,
  type PublicHospitalSupplyStatus,
  type PublicHospitalSupplySummary,
  type RestrictedHospitalSupplyNeed,
  type RestrictedHospitalSupplyStatus,
  type SupplyFreshness,
  isOpenHospitalSupplyHelpStatus,
} from "./hospitals-meta";

const {
  hospitalSupplyStatuses,
  hospitalSupplyNeeds,
  hospitalSupplyHelpRequests,
  hospitalPocAssignments,
  hospitalSupplyEvents,
} = schema;

const STATUS_RANK: Record<HospitalSupplyStatus, number> = {
  red: 3,
  yellow: 2,
  unknown: 1,
  green: 0,
};

export interface SupplyStatusUpdateInput {
  category?: unknown;
  status?: unknown;
  publicNote?: unknown;
  restrictedNote?: unknown;
  staleAfterHours?: unknown;
  updatedBy?: unknown;
  source?: unknown;
  confirmOnly?: unknown;
}

export interface SupplyNeedInput {
  category?: unknown;
  itemType?: unknown;
  quantity?: unknown;
  unit?: unknown;
  urgency?: unknown;
  status?: unknown;
  publicNote?: unknown;
  restrictedNote?: unknown;
  updatedBy?: unknown;
  source?: unknown;
}

export interface SupplyNeedPatchInput {
  status?: unknown;
  publicNote?: unknown;
  restrictedNote?: unknown;
  updatedBy?: unknown;
  source?: unknown;
}

export interface SupplyHelpRequestInput {
  category?: unknown;
  message?: unknown;
  urgency?: unknown;
  requestedBy?: unknown;
  source?: unknown;
  restrictedNote?: unknown;
}

export interface SupplyHelpPatchInput {
  status?: unknown;
  restrictedNote?: unknown;
  requestedBy?: unknown;
  source?: unknown;
}

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

type StatusRow = typeof hospitalSupplyStatuses.$inferSelect;
type NeedRow = typeof hospitalSupplyNeeds.$inferSelect;
type HelpRow = typeof hospitalSupplyHelpRequests.$inferSelect;
type PocRow = typeof hospitalPocAssignments.$inferSelect;

export interface RestrictedHospitalSupplySnapshot {
  hospitalId: string;
  summary: PublicHospitalSupplySummary;
  statuses: RestrictedHospitalSupplyStatus[];
  activeNeeds: RestrictedHospitalSupplyNeed[];
  helpRequests: HospitalSupplyHelpRequest[];
  pocs: HospitalPocAssignment[];
}

interface ValidStatusUpdate {
  category: HospitalSupplyCategory;
  status: HospitalSupplyStatus | null;
  publicNote: string | null;
  restrictedNote: string | null;
  staleAfterHours: number | null;
  updatedBy: string;
  source: string;
  confirmOnly: boolean;
}

interface ValidNeedInput {
  category: HospitalSupplyCategory;
  itemType: string;
  quantity: number | null;
  unit: string;
  urgency: HospitalSupplyStatus;
  status: HospitalSupplyNeedStatus;
  publicNote: string;
  restrictedNote: string;
  updatedBy: string;
  source: string;
}

interface ValidNeedPatch {
  status: HospitalSupplyNeedStatus | null;
  publicNote: string | null;
  restrictedNote: string | null;
  updatedBy: string;
  source: string;
}

interface ValidHelpInput {
  category: HospitalSupplyCategory;
  message: string;
  urgency: HospitalSupplyStatus;
  requestedBy: string;
  source: string;
  restrictedNote: string;
}

interface ValidHelpPatch {
  status: HospitalSupplyHelpStatus | null;
  restrictedNote: string | null;
  requestedBy: string;
  source: string;
}

const memoryStatuses = new Map<string, RestrictedHospitalSupplyStatus>();
const memoryNeeds = new Map<string, RestrictedHospitalSupplyNeed>();
const memoryHelpRequests = new Map<string, HospitalSupplyHelpRequest>();
const memoryPocs = new Map<string, HospitalPocAssignment>();
let memorySeeded = false;

function statusKey(hospitalId: string, category: HospitalSupplyCategory): string {
  return `${hospitalId}:${category}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampText(value: unknown, max: number): string {
  return text(value).slice(0, max);
}

function optionalClampedText(value: unknown, max: number): string | null {
  return value === undefined ? null : clampText(value, max);
}

export function hasUnsafePublicSupplyText(value: unknown): boolean {
  const raw = text(value);
  if (!raw) return false;
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw);
  const hasPhoneLikeNumber = /(?:\d[\s().-]*){7,}/.test(raw);
  const hasContactMarker =
    /\b(telefono|whatsapp|contacto|contactar|llamar|sms|correo|email|poc|doctor|doctora|dr|dra)\b/.test(
      normalized,
    );
  const hasIdentityMarker =
    /\b(cedula|ci|dni|pasaporte|historia clinica|numero de historia)\b/.test(
      normalized,
    );
  return hasEmail || hasPhoneLikeNumber || hasContactMarker || hasIdentityMarker;
}

function rejectUnsafePublicText(
  fields: Array<[string, unknown]>,
): { ok: false; error: string } | null {
  const unsafe = fields.find(([, value]) => hasUnsafePublicSupplyText(value));
  if (!unsafe) return null;
  return {
    ok: false,
    error: `No publiques ${unsafe[0]} con contactos, POC o datos identificables. Muévelo a la nota restringida.`,
  };
}

export function normalizeSupplyCategory(
  value: unknown,
): HospitalSupplyCategory | null {
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[-\s]+/g, "_");
  return HOSPITAL_SUPPLY_CATEGORIES.includes(normalized as HospitalSupplyCategory)
    ? (normalized as HospitalSupplyCategory)
    : null;
}

export function normalizeSupplyStatus(
  value: unknown,
): HospitalSupplyStatus | null {
  const raw = text(value).toLowerCase();
  return HOSPITAL_SUPPLY_STATUSES.has(raw as HospitalSupplyStatus)
    ? (raw as HospitalSupplyStatus)
    : null;
}

function normalizeNeedStatus(value: unknown): HospitalSupplyNeedStatus | null {
  const raw = text(value).toLowerCase();
  return HOSPITAL_SUPPLY_NEED_STATUSES.has(raw as HospitalSupplyNeedStatus)
    ? (raw as HospitalSupplyNeedStatus)
    : null;
}

function normalizeHelpStatus(value: unknown): HospitalSupplyHelpStatus | null {
  const raw = text(value).toLowerCase();
  return HOSPITAL_SUPPLY_HELP_STATUSES.has(raw as HospitalSupplyHelpStatus)
    ? (raw as HospitalSupplyHelpStatus)
    : null;
}

function normalizeStaleAfterHours(
  value: unknown,
  category: HospitalSupplyCategory,
): number {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 1 && n <= 168) return Math.trunc(n);
  return HOSPITAL_SUPPLY_CATEGORY_META[category].staleAfterHours;
}

function normalizeOptionalQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.trunc(n);
}

export function deriveSupplyFreshness(
  input: {
    lastUpdatedAt: number;
    lastConfirmedAt: number;
    staleAfterHours: number;
  },
  now: number = Date.now(),
): SupplyFreshness {
  const staleAfterHours = Math.max(1, Math.trunc(input.staleAfterHours));
  return {
    lastUpdatedAt: input.lastUpdatedAt,
    lastConfirmedAt: input.lastConfirmedAt,
    staleAfterHours,
    isStale: now - input.lastConfirmedAt > staleAfterHours * 60 * 60 * 1000,
    updatedAgo: timeAgo(input.lastUpdatedAt, now),
    confirmedAgo: timeAgo(input.lastConfirmedAt, now),
  };
}

export function validateSupplyStatusUpdate(
  input: SupplyStatusUpdateInput,
): Validation<ValidStatusUpdate> {
  const category = normalizeSupplyCategory(input.category);
  if (!category) return { ok: false, error: "Categoría de insumos inválida." };

  const confirmOnly = input.confirmOnly === true;
  const status = normalizeSupplyStatus(input.status);
  if (!confirmOnly && !status) {
    return { ok: false, error: "Indica un semáforo válido." };
  }
  const unsafe = rejectUnsafePublicText([["nota pública", input.publicNote]]);
  if (unsafe) return unsafe;

  return {
    ok: true,
    value: {
      category,
      status,
      publicNote: optionalClampedText(input.publicNote, MAX_SUPPLY_NOTE),
      restrictedNote: optionalClampedText(input.restrictedNote, MAX_SUPPLY_NOTE),
      staleAfterHours:
        input.staleAfterHours === undefined
          ? null
          : normalizeStaleAfterHours(input.staleAfterHours, category),
      updatedBy: clampText(input.updatedBy, MAX_SUPPLY_ACTOR) || "equipo_operativo",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
      confirmOnly,
    },
  };
}

export function validateSupplyNeedInput(
  input: SupplyNeedInput,
): Validation<ValidNeedInput> {
  const category = normalizeSupplyCategory(input.category);
  if (!category) return { ok: false, error: "Categoría de insumos inválida." };
  const itemType = clampText(input.itemType, MAX_SUPPLY_ITEM);
  if (!itemType) {
    return { ok: false, error: "Indica el insumo o tipo requerido." };
  }
  const unsafe = rejectUnsafePublicText([
    ["insumo/tipo", input.itemType],
    ["unidad", input.unit],
    ["nota pública", input.publicNote],
  ]);
  if (unsafe) return unsafe;
  const urgency = normalizeSupplyStatus(input.urgency) ?? "yellow";
  if (urgency === "green") {
    return { ok: false, error: "La urgencia de una necesidad no puede ser verde." };
  }
  return {
    ok: true,
    value: {
      category,
      itemType,
      quantity: normalizeOptionalQuantity(input.quantity),
      unit: clampText(input.unit, MAX_SUPPLY_UNIT),
      urgency,
      status: normalizeNeedStatus(input.status) ?? "active",
      publicNote: clampText(input.publicNote, MAX_SUPPLY_NOTE),
      restrictedNote: clampText(input.restrictedNote, MAX_SUPPLY_NOTE),
      updatedBy: clampText(input.updatedBy, MAX_SUPPLY_ACTOR) || "equipo_operativo",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
    },
  };
}

export function validateSupplyNeedPatch(
  input: SupplyNeedPatchInput,
): Validation<ValidNeedPatch> {
  const status =
    input.status === undefined ? null : normalizeNeedStatus(input.status);
  if (input.status !== undefined && !status) {
    return { ok: false, error: "Estado de necesidad inválido." };
  }
  return {
    ok: true,
    value: {
      status,
      publicNote:
        input.publicNote === undefined
          ? null
          : clampText(input.publicNote, MAX_SUPPLY_NOTE),
      restrictedNote:
        input.restrictedNote === undefined
          ? null
          : clampText(input.restrictedNote, MAX_SUPPLY_NOTE),
      updatedBy: clampText(input.updatedBy, MAX_SUPPLY_ACTOR) || "equipo_operativo",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
    },
  };
}

export function validateSupplyHelpRequest(
  input: SupplyHelpRequestInput,
): Validation<ValidHelpInput> {
  const category = normalizeSupplyCategory(input.category);
  if (!category) return { ok: false, error: "Categoría de insumos inválida." };
  const message = clampText(input.message, MAX_SUPPLY_HELP_MESSAGE);
  if (!message) return { ok: false, error: "Indica un mensaje corto." };
  const urgency = normalizeSupplyStatus(input.urgency) ?? "yellow";
  if (urgency === "green") {
    return { ok: false, error: "La urgencia de ayuda no puede ser verde." };
  }
  return {
    ok: true,
    value: {
      category,
      message,
      urgency,
      requestedBy:
        clampText(input.requestedBy, MAX_SUPPLY_ACTOR) || "poc_hospitalario",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
      restrictedNote: clampText(input.restrictedNote, MAX_SUPPLY_NOTE),
    },
  };
}

export function validateSupplyHelpPatch(
  input: SupplyHelpPatchInput,
): Validation<ValidHelpPatch> {
  const status =
    input.status === undefined ? null : normalizeHelpStatus(input.status);
  if (input.status !== undefined && !status) {
    return { ok: false, error: "Estado de solicitud inválido." };
  }
  return {
    ok: true,
    value: {
      status,
      restrictedNote:
        input.restrictedNote === undefined
          ? null
          : clampText(input.restrictedNote, MAX_SUPPLY_NOTE),
      requestedBy:
        clampText(input.requestedBy, MAX_SUPPLY_ACTOR) || "equipo_operativo",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
    },
  };
}

function rowToRestrictedStatus(
  row: StatusRow,
  now: number = Date.now(),
): RestrictedHospitalSupplyStatus {
  const category =
    normalizeSupplyCategory(row.category) ?? "other";
  const status = normalizeSupplyStatus(row.status) ?? "unknown";
  return {
    id: row.id,
    hospitalId: row.hospitalId,
    category,
    status,
    label: HOSPITAL_SUPPLY_CATEGORY_META[category].label,
    publicNote: row.publicNote,
    restrictedNote: row.restrictedNote,
    updatedBy: row.updatedBy,
    source: row.source,
    freshness: deriveSupplyFreshness(
      {
        lastUpdatedAt: Number(row.lastUpdatedAt),
        lastConfirmedAt: Number(row.lastConfirmedAt),
        staleAfterHours: Number(row.staleAfterHours),
      },
      now,
    ),
  };
}

function rowToRestrictedNeed(
  row: NeedRow,
  now: number = Date.now(),
): RestrictedHospitalSupplyNeed {
  const category = normalizeSupplyCategory(row.category) ?? "other";
  const urgency = normalizeSupplyStatus(row.urgency) ?? "yellow";
  const status = normalizeNeedStatus(row.status) ?? "active";
  return {
    id: row.id,
    hospitalId: row.hospitalId,
    category,
    categoryLabel: HOSPITAL_SUPPLY_CATEGORY_META[category].label,
    itemType: row.itemType,
    quantity: row.quantity,
    unit: row.unit,
    urgency,
    status,
    publicNote: row.publicNote,
    restrictedNote: row.restrictedNote,
    updatedBy: row.updatedBy,
    source: row.source,
    lastConfirmedAt: Number(row.lastConfirmedAt),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    updatedAgo: timeAgo(Number(row.updatedAt), now),
  };
}

function rowToHelpRequest(
  row: HelpRow,
  now: number = Date.now(),
): HospitalSupplyHelpRequest {
  const category = normalizeSupplyCategory(row.category) ?? "other";
  return {
    id: row.id,
    hospitalId: row.hospitalId,
    category,
    categoryLabel: HOSPITAL_SUPPLY_CATEGORY_META[category].label,
    message: row.message,
    urgency: normalizeSupplyStatus(row.urgency) ?? "yellow",
    status: normalizeHelpStatus(row.status) ?? "open",
    requestedBy: row.requestedBy,
    source: row.source,
    restrictedNote: row.restrictedNote,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    updatedAgo: timeAgo(Number(row.updatedAt), now),
  };
}

function rowToPoc(row: PocRow): HospitalPocAssignment {
  const role =
    row.role === "operator_admin" ||
    row.role === "hospital_poc" ||
    row.role === "ops_reader"
      ? row.role
      : "hospital_poc";
  return {
    id: row.id,
    hospitalId: row.hospitalId,
    displayName: row.displayName,
    role,
    restrictedContact: row.restrictedContact,
    active: Boolean(row.active),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export function redactPublicNeed(
  need: RestrictedHospitalSupplyNeed,
): PublicHospitalSupplyNeed {
  return {
    id: need.id,
    hospitalId: need.hospitalId,
    category: need.category,
    categoryLabel: need.categoryLabel,
    itemType: need.itemType,
    quantity: need.quantity,
    unit: need.unit,
    urgency: need.urgency,
    status: need.status,
    publicNote: need.publicNote,
    lastConfirmedAt: need.lastConfirmedAt,
    updatedAt: need.updatedAt,
    updatedAgo: need.updatedAgo,
  };
}

export function redactPublicStatus(
  status: RestrictedHospitalSupplyStatus,
): PublicHospitalSupplyStatus {
  return {
    category: status.category,
    status: status.status,
    label: status.label,
    publicNote: status.publicNote,
    freshness: status.freshness,
  };
}

export function buildSupplySummary(
  statuses: RestrictedHospitalSupplyStatus[],
  needs: RestrictedHospitalSupplyNeed[],
): PublicHospitalSupplySummary {
  const publicNeeds = needs
    .filter((need) => ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES.has(need.status))
    .map(redactPublicNeed);
  const publicStatuses = statuses.map(redactPublicStatus);

  let worstStatus: HospitalSupplyStatus = "unknown";
  let red = 0;
  let yellow = 0;
  let stale = 0;
  let lastConfirmedAt: number | null = null;
  for (const status of publicStatuses) {
    if (status.status === "red") red += 1;
    if (status.status === "yellow") yellow += 1;
    if (status.freshness.isStale) stale += 1;
    if (STATUS_RANK[status.status] > STATUS_RANK[worstStatus]) {
      worstStatus = status.status;
    }
    lastConfirmedAt = Math.max(
      lastConfirmedAt ?? 0,
      status.freshness.lastConfirmedAt,
    );
  }

  for (const need of publicNeeds) {
    if (STATUS_RANK[need.urgency] > STATUS_RANK[worstStatus]) {
      worstStatus = need.urgency;
    }
    if (need.urgency === "red") red += 1;
    if (need.urgency === "yellow") yellow += 1;
    lastConfirmedAt = Math.max(lastConfirmedAt ?? 0, need.lastConfirmedAt);
  }

  return {
    statuses: publicStatuses,
    activeNeeds: publicNeeds,
    counts: {
      red,
      yellow,
      stale,
      activeNeeds: publicNeeds.length,
    },
    worstStatus,
    lastConfirmedAt,
  };
}

export function redactPublicSupplySnapshot(
  snapshot: RestrictedHospitalSupplySnapshot,
): PublicHospitalSupplySummary {
  return buildSupplySummary(snapshot.statuses, snapshot.activeNeeds);
}

function emptySummary(): PublicHospitalSupplySummary {
  return {
    statuses: [],
    activeNeeds: [],
    counts: { red: 0, yellow: 0, stale: 0, activeNeeds: 0 },
    worstStatus: "unknown",
    lastConfirmedAt: null,
  };
}

function ensureMemorySeed(hospitalIds: string[]) {
  if (memorySeeded || hospitalIds.length === 0) return;
  memorySeeded = true;
  const now = Date.now();
  const demoIds = hospitalIds.slice(0, 3);
  for (const [index, hospitalId] of demoIds.entries()) {
    const category: HospitalSupplyCategory =
      index === 0 ? "iv_fluids" : index === 1 ? "medications" : "water";
    const status: HospitalSupplyStatus =
      index === 0 ? "red" : index === 1 ? "yellow" : "green";
    const confirmedAt = now - (index + 1) * 90 * 60 * 1000;
    const restrictedStatus: RestrictedHospitalSupplyStatus = {
      id: crypto.randomUUID(),
      hospitalId,
      category,
      status,
      label: HOSPITAL_SUPPLY_CATEGORY_META[category].label,
      publicNote:
        index === 0
          ? "Demo sintético: se requieren sueros isotónicos."
          : index === 1
            ? "Demo sintético: medicamentos en seguimiento."
            : "Demo sintético: agua estable por ahora.",
      restrictedNote: "Nota demo restringida para coordinación.",
      updatedBy: "Equipo demo",
      source: "demo_memory",
      freshness: deriveSupplyFreshness({
        lastUpdatedAt: confirmedAt,
        lastConfirmedAt: confirmedAt,
        staleAfterHours: HOSPITAL_SUPPLY_CATEGORY_META[category].staleAfterHours,
      }),
    };
    memoryStatuses.set(statusKey(hospitalId, category), restrictedStatus);
    if (index < 2) {
      const need: RestrictedHospitalSupplyNeed = {
        id: crypto.randomUUID(),
        hospitalId,
        category,
        categoryLabel: HOSPITAL_SUPPLY_CATEGORY_META[category].label,
        itemType: index === 0 ? "Solución fisiológica 0.9%" : "Analgésicos",
        quantity: index === 0 ? 80 : 40,
        unit: index === 0 ? "bolsas 500 ml" : "unidades",
        urgency: status,
        status: "active",
        publicNote: "Demo sintético para validar el flujo público.",
        restrictedNote: "No contiene datos reales ni contactos.",
        updatedBy: "Equipo demo",
        source: "demo_memory",
        lastConfirmedAt: confirmedAt,
        createdAt: confirmedAt,
        updatedAt: confirmedAt,
        updatedAgo: timeAgo(confirmedAt),
      };
      memoryNeeds.set(need.id, need);
    }
  }
}

async function logSupplyEvent(input: {
  hospitalId: string;
  category?: HospitalSupplyCategory | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  actor: string;
  source: string;
  payload: Record<string, unknown>;
}) {
  if (!hasDbEnv()) return;
  await getDb().insert(hospitalSupplyEvents).values({
    id: crypto.randomUUID(),
    hospitalId: input.hospitalId,
    category: input.category ?? null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    action: input.action,
    actor: input.actor,
    source: input.source,
    payload: input.payload,
    createdAt: Date.now(),
  });
}

export async function upsertHospitalSupplyStatus(
  hospitalId: string,
  input: SupplyStatusUpdateInput,
): Promise<Validation<RestrictedHospitalSupplyStatus>> {
  const parsed = validateSupplyStatusUpdate(input);
  if (!parsed.ok) return parsed;

  const now = Date.now();
  const value = parsed.value;

  if (hasDbEnv()) {
    const existing = await getDb()
      .select()
      .from(hospitalSupplyStatuses)
      .where(
        and(
          eq(hospitalSupplyStatuses.hospitalId, hospitalId),
          eq(hospitalSupplyStatuses.category, value.category),
        ),
      )
      .limit(1);
    const previous = existing[0];
    if (value.confirmOnly && !previous) {
      return {
        ok: false,
        error: "No hay reporte previo para confirmar sin cambios.",
      };
    }
    const nextStatus =
      value.confirmOnly && previous
        ? normalizeSupplyStatus(previous.status) ?? "unknown"
        : value.status ?? "unknown";
    const nextPublicNote = value.confirmOnly
      ? previous?.publicNote ?? ""
      : value.publicNote ?? previous?.publicNote ?? "";
    const nextRestrictedNote =
      value.confirmOnly
        ? previous?.restrictedNote ?? ""
        : value.restrictedNote ?? previous?.restrictedNote ?? "";
    const staleAfterHours =
      value.staleAfterHours ??
      previous?.staleAfterHours ??
      HOSPITAL_SUPPLY_CATEGORY_META[value.category].staleAfterHours;
    const lastUpdatedAt = value.confirmOnly && previous ? previous.lastUpdatedAt : now;

    const rows = await getDb()
      .insert(hospitalSupplyStatuses)
      .values({
        id: previous?.id ?? crypto.randomUUID(),
        hospitalId,
        category: value.category,
        status: nextStatus,
        publicNote: nextPublicNote,
        restrictedNote: nextRestrictedNote,
        staleAfterHours,
        lastUpdatedAt,
        lastConfirmedAt: now,
        updatedBy: value.updatedBy,
        source: value.source,
        createdAt: previous?.createdAt ?? now,
      })
      .onConflictDoUpdate({
        target: [
          hospitalSupplyStatuses.hospitalId,
          hospitalSupplyStatuses.category,
        ],
        set: {
          status: nextStatus,
          publicNote: nextPublicNote,
          restrictedNote: nextRestrictedNote,
          staleAfterHours,
          lastUpdatedAt,
          lastConfirmedAt: now,
          updatedBy: value.updatedBy,
          source: value.source,
        },
      })
      .returning();

    await logSupplyEvent({
      hospitalId,
      category: value.category,
      entityType: "status",
      entityId: rows[0]?.id,
      action: value.confirmOnly ? "confirmed_no_changes" : "upserted_status",
      actor: value.updatedBy,
      source: value.source,
      payload: { status: nextStatus },
    });
    return { ok: true, value: rowToRestrictedStatus(rows[0]) };
  }

  const key = statusKey(hospitalId, value.category);
  const previous = memoryStatuses.get(key);
  if (value.confirmOnly && !previous) {
    return {
      ok: false,
      error: "No hay reporte previo para confirmar sin cambios.",
    };
  }
  const lastUpdatedAt = value.confirmOnly && previous
    ? previous.freshness.lastUpdatedAt
    : now;
  const status =
    value.confirmOnly && previous ? previous.status : value.status ?? "unknown";
  const next: RestrictedHospitalSupplyStatus = {
    id: previous?.id ?? crypto.randomUUID(),
    hospitalId,
    category: value.category,
    status,
    label: HOSPITAL_SUPPLY_CATEGORY_META[value.category].label,
    publicNote:
      value.confirmOnly
        ? previous?.publicNote ?? ""
        : value.publicNote ?? previous?.publicNote ?? "",
    restrictedNote:
      value.confirmOnly
        ? previous?.restrictedNote ?? ""
        : value.restrictedNote ?? previous?.restrictedNote ?? "",
    updatedBy: value.updatedBy,
    source: value.source,
    freshness: deriveSupplyFreshness({
      lastUpdatedAt,
      lastConfirmedAt: now,
      staleAfterHours:
        value.staleAfterHours ??
        previous?.freshness.staleAfterHours ??
        HOSPITAL_SUPPLY_CATEGORY_META[value.category].staleAfterHours,
    }),
  };
  memoryStatuses.set(key, next);
  return { ok: true, value: next };
}

export async function createHospitalSupplyNeed(
  hospitalId: string,
  input: SupplyNeedInput,
): Promise<Validation<RestrictedHospitalSupplyNeed>> {
  const parsed = validateSupplyNeedInput(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const now = Date.now();

  if (hasDbEnv()) {
    const rows = await getDb()
      .insert(hospitalSupplyNeeds)
      .values({
        id: crypto.randomUUID(),
        hospitalId,
        category: value.category,
        itemType: value.itemType,
        quantity: value.quantity,
        unit: value.unit,
        urgency: value.urgency,
        status: value.status,
        publicNote: value.publicNote,
        restrictedNote: value.restrictedNote,
        lastConfirmedAt: now,
        updatedBy: value.updatedBy,
        source: value.source,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await logSupplyEvent({
      hospitalId,
      category: value.category,
      entityType: "need",
      entityId: rows[0]?.id,
      action: "created_need",
      actor: value.updatedBy,
      source: value.source,
      payload: { itemType: value.itemType, urgency: value.urgency },
    });
    return { ok: true, value: rowToRestrictedNeed(rows[0]) };
  }

  const need: RestrictedHospitalSupplyNeed = {
    id: crypto.randomUUID(),
    hospitalId,
    category: value.category,
    categoryLabel: HOSPITAL_SUPPLY_CATEGORY_META[value.category].label,
    itemType: value.itemType,
    quantity: value.quantity,
    unit: value.unit,
    urgency: value.urgency,
    status: value.status,
    publicNote: value.publicNote,
    restrictedNote: value.restrictedNote,
    updatedBy: value.updatedBy,
    source: value.source,
    lastConfirmedAt: now,
    createdAt: now,
    updatedAt: now,
    updatedAgo: timeAgo(now),
  };
  memoryNeeds.set(need.id, need);
  return { ok: true, value: need };
}

export async function updateHospitalSupplyNeed(
  hospitalId: string,
  needId: string,
  input: SupplyNeedPatchInput,
): Promise<Validation<RestrictedHospitalSupplyNeed | null>> {
  const parsed = validateSupplyNeedPatch(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const now = Date.now();

  if (hasDbEnv()) {
    const existing = await getDb()
      .select()
      .from(hospitalSupplyNeeds)
      .where(
        and(
          eq(hospitalSupplyNeeds.hospitalId, hospitalId),
          eq(hospitalSupplyNeeds.id, needId),
        ),
      )
      .limit(1);
    if (!existing[0]) return { ok: true, value: null };
    const current = existing[0];
    const rows = await getDb()
      .update(hospitalSupplyNeeds)
      .set({
        status: value.status ?? current.status,
        publicNote: value.publicNote ?? current.publicNote,
        restrictedNote: value.restrictedNote ?? current.restrictedNote,
        updatedBy: value.updatedBy,
        source: value.source,
        lastConfirmedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(hospitalSupplyNeeds.hospitalId, hospitalId),
          eq(hospitalSupplyNeeds.id, needId),
        ),
      )
      .returning();
    await logSupplyEvent({
      hospitalId,
      category: normalizeSupplyCategory(rows[0]?.category),
      entityType: "need",
      entityId: needId,
      action: "updated_need",
      actor: value.updatedBy,
      source: value.source,
      payload: { status: rows[0]?.status },
    });
    return { ok: true, value: rowToRestrictedNeed(rows[0]) };
  }

  const existing = memoryNeeds.get(needId);
  if (!existing || existing.hospitalId !== hospitalId) {
    return { ok: true, value: null };
  }
  const next: RestrictedHospitalSupplyNeed = {
    ...existing,
    status: value.status ?? existing.status,
    publicNote: value.publicNote ?? existing.publicNote,
    restrictedNote: value.restrictedNote ?? existing.restrictedNote,
    updatedBy: value.updatedBy,
    source: value.source,
    lastConfirmedAt: now,
    updatedAt: now,
    updatedAgo: timeAgo(now),
  };
  memoryNeeds.set(needId, next);
  return { ok: true, value: next };
}

export async function createHospitalSupplyHelpRequest(
  hospitalId: string,
  input: SupplyHelpRequestInput,
): Promise<Validation<HospitalSupplyHelpRequest>> {
  const parsed = validateSupplyHelpRequest(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const now = Date.now();

  if (hasDbEnv()) {
    const rows = await getDb()
      .insert(hospitalSupplyHelpRequests)
      .values({
        id: crypto.randomUUID(),
        hospitalId,
        category: value.category,
        message: value.message,
        urgency: value.urgency,
        status: "open",
        requestedBy: value.requestedBy,
        source: value.source,
        restrictedNote: value.restrictedNote,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await logSupplyEvent({
      hospitalId,
      category: value.category,
      entityType: "help_request",
      entityId: rows[0]?.id,
      action: "created_help_request",
      actor: value.requestedBy,
      source: value.source,
      payload: { urgency: value.urgency },
    });
    return { ok: true, value: rowToHelpRequest(rows[0]) };
  }

  const request: HospitalSupplyHelpRequest = {
    id: crypto.randomUUID(),
    hospitalId,
    category: value.category,
    categoryLabel: HOSPITAL_SUPPLY_CATEGORY_META[value.category].label,
    message: value.message,
    urgency: value.urgency,
    status: "open",
    requestedBy: value.requestedBy,
    source: value.source,
    restrictedNote: value.restrictedNote,
    createdAt: now,
    updatedAt: now,
    updatedAgo: timeAgo(now),
  };
  memoryHelpRequests.set(request.id, request);
  return { ok: true, value: request };
}

export async function updateHospitalSupplyHelpRequest(
  hospitalId: string,
  requestId: string,
  input: SupplyHelpPatchInput,
): Promise<Validation<HospitalSupplyHelpRequest | null>> {
  const parsed = validateSupplyHelpPatch(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const now = Date.now();

  if (hasDbEnv()) {
    const existing = await getDb()
      .select()
      .from(hospitalSupplyHelpRequests)
      .where(
        and(
          eq(hospitalSupplyHelpRequests.hospitalId, hospitalId),
          eq(hospitalSupplyHelpRequests.id, requestId),
        ),
      )
      .limit(1);
    if (!existing[0]) return { ok: true, value: null };
    const current = existing[0];
    const rows = await getDb()
      .update(hospitalSupplyHelpRequests)
      .set({
        status: value.status ?? current.status,
        restrictedNote: value.restrictedNote ?? current.restrictedNote,
        requestedBy: value.requestedBy,
        source: value.source,
        updatedAt: now,
      })
      .where(
        and(
          eq(hospitalSupplyHelpRequests.hospitalId, hospitalId),
          eq(hospitalSupplyHelpRequests.id, requestId),
        ),
      )
      .returning();
    await logSupplyEvent({
      hospitalId,
      category: normalizeSupplyCategory(rows[0]?.category),
      entityType: "help_request",
      entityId: requestId,
      action: "updated_help_request",
      actor: value.requestedBy,
      source: value.source,
      payload: { status: rows[0]?.status },
    });
    return { ok: true, value: rowToHelpRequest(rows[0]) };
  }

  const existing = memoryHelpRequests.get(requestId);
  if (!existing || existing.hospitalId !== hospitalId) {
    return { ok: true, value: null };
  }
  const next: HospitalSupplyHelpRequest = {
    ...existing,
    status: value.status ?? existing.status,
    restrictedNote: value.restrictedNote ?? existing.restrictedNote,
    requestedBy: value.requestedBy,
    source: value.source,
    updatedAt: now,
    updatedAgo: timeAgo(now),
  };
  memoryHelpRequests.set(requestId, next);
  return { ok: true, value: next };
}

async function loadRestrictedSupplyForHospitalIds(
  hospitalIds: string[],
): Promise<Map<string, RestrictedHospitalSupplySnapshot>> {
  const uniqueIds = [...new Set(hospitalIds)].filter(Boolean);
  const map = new Map<string, RestrictedHospitalSupplySnapshot>();
  for (const hospitalId of uniqueIds) {
    map.set(hospitalId, {
      hospitalId,
      summary: emptySummary(),
      statuses: [],
      activeNeeds: [],
      helpRequests: [],
      pocs: [],
    });
  }
  if (uniqueIds.length === 0) return map;

  const now = Date.now();
  if (hasDbEnv()) {
    const [statusRows, needRows, helpRows, pocRows] = await Promise.all([
      getDb()
        .select()
        .from(hospitalSupplyStatuses)
        .where(inArray(hospitalSupplyStatuses.hospitalId, uniqueIds)),
      getDb()
        .select()
        .from(hospitalSupplyNeeds)
        .where(
          and(
            inArray(hospitalSupplyNeeds.hospitalId, uniqueIds),
            inArray(hospitalSupplyNeeds.status, [
              ...ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES,
            ]),
          ),
        )
        .orderBy(desc(hospitalSupplyNeeds.updatedAt)),
      getDb()
        .select()
        .from(hospitalSupplyHelpRequests)
        .where(
          and(
            inArray(hospitalSupplyHelpRequests.hospitalId, uniqueIds),
            inArray(hospitalSupplyHelpRequests.status, ["open", "contacting"]),
          ),
        )
        .orderBy(desc(hospitalSupplyHelpRequests.updatedAt)),
      getDb()
        .select()
        .from(hospitalPocAssignments)
        .where(inArray(hospitalPocAssignments.hospitalId, uniqueIds)),
    ]);

    for (const row of statusRows) {
      const snapshot = map.get(row.hospitalId);
      if (snapshot) snapshot.statuses.push(rowToRestrictedStatus(row, now));
    }
    for (const row of needRows) {
      const snapshot = map.get(row.hospitalId);
      if (snapshot) snapshot.activeNeeds.push(rowToRestrictedNeed(row, now));
    }
    for (const row of helpRows) {
      const snapshot = map.get(row.hospitalId);
      if (snapshot) snapshot.helpRequests.push(rowToHelpRequest(row, now));
    }
    for (const row of pocRows) {
      const snapshot = map.get(row.hospitalId);
      if (snapshot) snapshot.pocs.push(rowToPoc(row));
    }
  } else {
    ensureMemorySeed(uniqueIds);
    for (const status of memoryStatuses.values()) {
      const snapshot = map.get(status.hospitalId);
      if (snapshot) {
        snapshot.statuses.push({
          ...status,
          freshness: deriveSupplyFreshness(status.freshness, now),
        });
      }
    }
    for (const need of memoryNeeds.values()) {
      const snapshot = map.get(need.hospitalId);
      if (snapshot && ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES.has(need.status)) {
        snapshot.activeNeeds.push({
          ...need,
          updatedAgo: timeAgo(need.updatedAt, now),
        });
      }
    }
    for (const request of memoryHelpRequests.values()) {
      const snapshot = map.get(request.hospitalId);
      if (snapshot && isOpenHospitalSupplyHelpStatus(request.status)) {
        snapshot.helpRequests.push({
          ...request,
          updatedAgo: timeAgo(request.updatedAt, now),
        });
      }
    }
    for (const poc of memoryPocs.values()) {
      const snapshot = map.get(poc.hospitalId);
      if (snapshot) snapshot.pocs.push(poc);
    }
  }

  for (const snapshot of map.values()) {
    snapshot.statuses.sort(
      (a, b) =>
        HOSPITAL_SUPPLY_CATEGORIES.indexOf(a.category) -
        HOSPITAL_SUPPLY_CATEGORIES.indexOf(b.category),
    );
    snapshot.activeNeeds.sort((a, b) => b.updatedAt - a.updatedAt);
    snapshot.helpRequests.sort((a, b) => b.updatedAt - a.updatedAt);
    snapshot.summary = buildSupplySummary(snapshot.statuses, snapshot.activeNeeds);
  }
  return map;
}

async function loadPublicSupplySummariesForHospitalIds(
  hospitalIds: string[],
): Promise<Map<string, PublicHospitalSupplySummary>> {
  const uniqueIds = [...new Set(hospitalIds)].filter(Boolean);
  const grouped = new Map<
    string,
    {
      statuses: RestrictedHospitalSupplyStatus[];
      activeNeeds: RestrictedHospitalSupplyNeed[];
    }
  >();
  for (const hospitalId of uniqueIds) {
    grouped.set(hospitalId, { statuses: [], activeNeeds: [] });
  }
  if (uniqueIds.length === 0) return new Map();

  const now = Date.now();
  if (hasDbEnv()) {
    const [statusRows, needRows] = await Promise.all([
      getDb()
        .select()
        .from(hospitalSupplyStatuses)
        .where(inArray(hospitalSupplyStatuses.hospitalId, uniqueIds)),
      getDb()
        .select()
        .from(hospitalSupplyNeeds)
        .where(
          and(
            inArray(hospitalSupplyNeeds.hospitalId, uniqueIds),
            inArray(hospitalSupplyNeeds.status, [
              ...ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES,
            ]),
          ),
        )
        .orderBy(desc(hospitalSupplyNeeds.updatedAt)),
    ]);

    for (const row of statusRows) {
      grouped.get(row.hospitalId)?.statuses.push(rowToRestrictedStatus(row, now));
    }
    for (const row of needRows) {
      grouped.get(row.hospitalId)?.activeNeeds.push(rowToRestrictedNeed(row, now));
    }
  } else {
    ensureMemorySeed(uniqueIds);
    for (const status of memoryStatuses.values()) {
      grouped.get(status.hospitalId)?.statuses.push({
        ...status,
        freshness: deriveSupplyFreshness(status.freshness, now),
      });
    }
    for (const need of memoryNeeds.values()) {
      if (!ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES.has(need.status)) continue;
      grouped.get(need.hospitalId)?.activeNeeds.push({
        ...need,
        updatedAgo: timeAgo(need.updatedAt, now),
      });
    }
  }

  const map = new Map<string, PublicHospitalSupplySummary>();
  for (const [hospitalId, snapshot] of grouped) {
    snapshot.statuses.sort(
      (a, b) =>
        HOSPITAL_SUPPLY_CATEGORIES.indexOf(a.category) -
        HOSPITAL_SUPPLY_CATEGORIES.indexOf(b.category),
    );
    snapshot.activeNeeds.sort((a, b) => b.updatedAt - a.updatedAt);
    map.set(hospitalId, buildSupplySummary(snapshot.statuses, snapshot.activeNeeds));
  }
  return map;
}

export async function getRestrictedHospitalSupplySnapshot(
  hospitalId: string,
): Promise<RestrictedHospitalSupplySnapshot> {
  const snapshots = await loadRestrictedSupplyForHospitalIds([hospitalId]);
  return (
    snapshots.get(hospitalId) ?? {
      hospitalId,
      summary: emptySummary(),
      statuses: [],
      activeNeeds: [],
      helpRequests: [],
      pocs: [],
    }
  );
}

export async function getPublicHospitalSupplySummary(
  hospitalId: string,
): Promise<PublicHospitalSupplySummary> {
  const summaries = await loadPublicSupplySummariesForHospitalIds([hospitalId]);
  return summaries.get(hospitalId) ?? emptySummary();
}

export async function getPublicSupplySummariesForHospitals(
  hospitalIds: string[],
): Promise<Map<string, PublicHospitalSupplySummary>> {
  return loadPublicSupplySummariesForHospitalIds(hospitalIds);
}

export async function listRestrictedSupplySnapshotsForHospitals(
  hospitalIds: string[],
): Promise<Map<string, RestrictedHospitalSupplySnapshot>> {
  return loadRestrictedSupplyForHospitalIds(hospitalIds);
}

export async function getSupplyEventCount(hospitalId: string): Promise<number> {
  if (!hasDbEnv()) return 0;
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(hospitalSupplyEvents)
    .where(eq(hospitalSupplyEvents.hospitalId, hospitalId));
  return Number(rows[0]?.count ?? 0);
}
