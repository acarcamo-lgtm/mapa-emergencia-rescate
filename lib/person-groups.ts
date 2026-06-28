import { createHash } from "crypto";

export type PersonGroupMatchKind = "name_age" | "name_location" | "name_only";
export type PersonGroupStatus = "active" | "found";

export interface PersonGroupSignal {
  groupId: string;
  normalizedName: string;
  matchKind: PersonGroupMatchKind;
}

export interface PersonGroupAssignment {
  groupId: string | null;
  matchKind: PersonGroupMatchKind;
}

export interface PersonGroupable {
  id: string;
  name: string;
  age: number | null;
  lastSeen: string;
  source?: string | null;
  sourceUrl?: string | null;
  status: PersonGroupStatus;
  createdAt: number;
  resolvedAt?: number | null;
  groupId?: string | null;
  groupMatchKind?: PersonGroupMatchKind | null;
  groupReportCount?: number;
  groupHasIdentityDocument?: boolean;
  groupStatusConflict?: boolean;
}

export interface PersonGroupMemberSummary {
  id: string;
  name: string;
  age: number | null;
  lastSeen: string;
  source: string | null;
  sourceUrl: string | null;
  status: PersonGroupStatus;
  createdAt: number;
  resolvedAt: number | null;
}

export interface PersonGroupSummary {
  groupId: string;
  matchKind: PersonGroupMatchKind | null;
  reportCount: number;
  hasIdentityDocument: boolean;
  statusConflict: boolean;
  members: PersonGroupMemberSummary[];
}

function stableId(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

export function normalizePersonName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function personGroupSignal(input: {
  name: string;
  age: number | null;
  lastSeen?: string | null;
}): PersonGroupSignal {
  const normalizedName = normalizePersonName(input.name);
  const normalizedArea = normalizePersonName(input.lastSeen ?? "");
  const matchKind: PersonGroupMatchKind =
    input.age !== null ? "name_age" : normalizedArea ? "name_location" : "name_only";
  const evidenceKey =
    input.age !== null ? String(input.age) : normalizedArea || "unknown";
  const seed = `${normalizedName || "unknown"}|${matchKind}|${evidenceKey}`;
  return {
    groupId: `person:${stableId(seed)}`,
    normalizedName,
    matchKind,
  };
}

export function materializedPersonGroup(
  signal: PersonGroupSignal,
): PersonGroupAssignment {
  return {
    groupId: signal.matchKind === "name_only" ? null : signal.groupId,
    matchKind: signal.matchKind,
  };
}

function statusSort(status: PersonGroupStatus): number {
  return status === "active" ? 0 : 1;
}

export function summarizePersonGroup<T extends PersonGroupable>(
  groupId: string,
  members: T[],
): PersonGroupSummary {
  const sortedMembers = [...members].sort((a, b) => {
    const byStatus = statusSort(a.status) - statusSort(b.status);
    if (byStatus !== 0) return byStatus;
    return (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt);
  });
  const statusSet = new Set(sortedMembers.map((member) => member.status));
  const first = sortedMembers[0];

  return {
    groupId,
    matchKind: first?.groupMatchKind ?? null,
    reportCount: Math.max(
      sortedMembers.length,
      ...sortedMembers.map((member) => member.groupReportCount ?? 0),
    ),
    hasIdentityDocument: sortedMembers.some((member) =>
      Boolean(member.groupHasIdentityDocument),
    ),
    statusConflict: statusSet.size > 1 || sortedMembers.some((member) =>
      Boolean(member.groupStatusConflict),
    ),
    members: sortedMembers.map((member) => ({
      id: member.id,
      name: member.name,
      age: member.age,
      lastSeen: member.lastSeen,
      source: member.source ?? null,
      sourceUrl: member.sourceUrl ?? null,
      status: member.status,
      createdAt: member.createdAt,
      resolvedAt: member.resolvedAt ?? null,
    })),
  };
}

export function representativeForGroup<T extends PersonGroupable>(
  members: T[],
  preferredStatus?: PersonGroupStatus,
): T {
  return [...members].sort((a, b) => {
    if (preferredStatus) {
      const byPreferred =
        (a.status === preferredStatus ? 0 : 1) -
        (b.status === preferredStatus ? 0 : 1);
      if (byPreferred !== 0) return byPreferred;
    }
    const byStatus = statusSort(a.status) - statusSort(b.status);
    if (byStatus !== 0) return byStatus;
    return (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt);
  })[0];
}
