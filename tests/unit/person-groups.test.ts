import { describe, expect, it } from "vitest";
import {
  materializedPersonGroup,
  normalizePersonName,
  personGroupSignal,
  representativeForGroup,
  summarizePersonGroup,
} from "@/lib/person-groups";

describe("person-groups", () => {
  it("normaliza acentos, mayusculas y puntuacion", () => {
    expect(normalizePersonName("  Alicia Falcón!! ")).toBe("alicia falcon");
  });

  it("usa nombre y edad como senal deterministica de grupo", () => {
    const a = personGroupSignal({ name: "Alicia Falcon", age: 34 });
    const b = personGroupSignal({ name: "ALICIA FALCÓN", age: 34 });
    const c = personGroupSignal({ name: "Alicia Falcon", age: 35 });

    expect(a.groupId).toBe(b.groupId);
    expect(a.groupId).not.toBe(c.groupId);
    expect(a.matchKind).toBe("name_age");
  });

  it("usa ubicacion como senal cuando no hay edad", () => {
    const a = personGroupSignal({
      name: "Cruzenaida Paredes",
      age: null,
      lastSeen: "Perez Carreno",
    });
    const b = personGroupSignal({
      name: "CRUZENAIDA PAREDES",
      age: null,
      lastSeen: "Pérez Carreño",
    });
    const c = personGroupSignal({
      name: "Cruzenaida Paredes",
      age: null,
      lastSeen: "La Guaira",
    });

    expect(a.groupId).toBe(b.groupId);
    expect(a.groupId).not.toBe(c.groupId);
    expect(a.matchKind).toBe("name_location");
  });

  it("no materializa grupos publicos cuando solo coincide el nombre", () => {
    const signal = personGroupSignal({
      name: "Nombre Comun",
      age: null,
      lastSeen: "",
    });

    expect(signal.matchKind).toBe("name_only");
    expect(materializedPersonGroup(signal)).toEqual({
      groupId: null,
      matchKind: "name_only",
    });
  });

  it("marca conflicto cuando el grupo mezcla reportes activos y localizados", () => {
    const summary = summarizePersonGroup("person:demo", [
      {
        id: "a",
        name: "Crisdeilis Quintero",
        age: null,
        lastSeen: "Hospital",
        source: "Lista hospital",
        sourceUrl: "https://example.test/lista",
        status: "active",
        createdAt: 20,
      },
      {
        id: "b",
        name: "Crisdeilis Quintero",
        age: null,
        lastSeen: "Hospital",
        status: "found",
        createdAt: 10,
        resolvedAt: 30,
      },
    ]);

    expect(summary.reportCount).toBe(2);
    expect(summary.statusConflict).toBe(true);
    expect(summary.members[0]?.status).toBe("active");
    expect(summary.members[0]?.source).toBe("Lista hospital");
    expect(summary.members[0]?.sourceUrl).toBe("https://example.test/lista");
  });

  it("permite preferir la representante localizada para listados de encontrados", () => {
    const members = [
      {
        id: "a",
        name: "Crisdeilis Quintero",
        age: null,
        lastSeen: "Hospital",
        status: "active" as const,
        createdAt: 40,
      },
      {
        id: "b",
        name: "Crisdeilis Quintero",
        age: null,
        lastSeen: "Hospital",
        status: "found" as const,
        createdAt: 10,
        resolvedAt: 30,
      },
    ];

    expect(representativeForGroup(members).id).toBe("a");
    expect(representativeForGroup(members, "found").id).toBe("b");
  });
});
