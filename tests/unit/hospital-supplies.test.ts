import { describe, expect, it } from "vitest";
import {
  buildSupplySummary,
  deriveSupplyFreshness,
  redactPublicSupplySnapshot,
  validateSupplyNeedInput,
  validateSupplyStatusUpdate,
} from "@/lib/hospital-supplies";
import type {
  RestrictedHospitalSupplyNeed,
  RestrictedHospitalSupplyStatus,
} from "@/lib/hospitals-meta";

const NOW = 1_800_000_000_000;

function statusFixture(
  overrides: Partial<RestrictedHospitalSupplyStatus> = {},
): RestrictedHospitalSupplyStatus {
  return {
    id: "status-demo",
    hospitalId: "hospital-demo",
    category: "iv_fluids",
    status: "red",
    label: "Líquidos IV / sueros",
    publicNote: "Se requieren sueros isotónicos.",
    restrictedNote: "Nota restringida para coordinación.",
    updatedBy: "Equipo demo",
    source: "test",
    freshness: deriveSupplyFreshness(
      {
        lastUpdatedAt: NOW - 2 * 60 * 60 * 1000,
        lastConfirmedAt: NOW - 2 * 60 * 60 * 1000,
        staleAfterHours: 6,
      },
      NOW,
    ),
    ...overrides,
  };
}

function needFixture(
  overrides: Partial<RestrictedHospitalSupplyNeed> = {},
): RestrictedHospitalSupplyNeed {
  return {
    id: "need-demo",
    hospitalId: "hospital-demo",
    category: "iv_fluids",
    categoryLabel: "Líquidos IV / sueros",
    itemType: "Solución fisiológica 0.9%",
    quantity: 80,
    unit: "bolsas 500 ml",
    urgency: "red",
    status: "active",
    publicNote: "Entrega coordinada por triaje.",
    restrictedNote: "No publicar nombre del POC.",
    updatedBy: "Equipo demo",
    source: "test",
    lastConfirmedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    updatedAgo: "ahora mismo",
    ...overrides,
  };
}

describe("deriveSupplyFreshness", () => {
  it("marca stale por categoría usando lastConfirmedAt y staleAfterHours", () => {
    const fresh = deriveSupplyFreshness(
      {
        lastUpdatedAt: NOW - 2 * 60 * 60 * 1000,
        lastConfirmedAt: NOW - 2 * 60 * 60 * 1000,
        staleAfterHours: 6,
      },
      NOW,
    );
    const stale = deriveSupplyFreshness(
      {
        lastUpdatedAt: NOW - 20 * 60 * 60 * 1000,
        lastConfirmedAt: NOW - 20 * 60 * 60 * 1000,
        staleAfterHours: 6,
      },
      NOW,
    );

    expect(fresh.isStale).toBe(false);
    expect(stale.isStale).toBe(true);
    expect(stale.confirmedAgo).toBe("hace 20 h");
  });
});

describe("validateSupplyStatusUpdate", () => {
  it("acepta sin cambios sin exigir nuevo semáforo", () => {
    const result = validateSupplyStatusUpdate({
      category: "medications",
      confirmOnly: true,
      updatedBy: "POC demo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.category).toBe("medications");
      expect(result.value.status).toBeNull();
      expect(result.value.confirmOnly).toBe(true);
    }
  });

  it("rechaza categorías y semáforos inválidos", () => {
    expect(validateSupplyStatusUpdate({ category: "patients", status: "red" }).ok)
      .toBe(false);
    expect(
      validateSupplyStatusUpdate({ category: "medications", status: "blue" }).ok,
    ).toBe(false);
  });
});

describe("validateSupplyNeedInput", () => {
  it("permite free text clasificado por categoría con cantidad y unidad", () => {
    const result = validateSupplyNeedInput({
      category: "iv_fluids",
      itemType: "Ringer lactato",
      quantity: "25",
      unit: "cajas",
      urgency: "red",
      publicNote: "Recibir solo material sellado.",
      restrictedNote: "Nota demo restringida.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.itemType).toBe("Ringer lactato");
      expect(result.value.quantity).toBe(25);
      expect(result.value.unit).toBe("cajas");
    }
  });

  it("rechaza necesidades con urgencia verde", () => {
    const result = validateSupplyNeedInput({
      category: "medical_supplies",
      itemType: "Gasas",
      urgency: "green",
    });

    expect(result.ok).toBe(false);
  });
});

describe("public supply redaction", () => {
  it("construye resumen público sin notas restringidas ni actores privados", () => {
    const snapshot = {
      hospitalId: "hospital-demo",
      statuses: [statusFixture()],
      activeNeeds: [needFixture()],
      helpRequests: [],
      pocs: [],
      summary: buildSupplySummary([statusFixture()], [needFixture()]),
    };

    const publicSummary = redactPublicSupplySnapshot(snapshot);
    const serialized = JSON.stringify(publicSummary);

    expect(publicSummary.counts.red).toBe(2);
    expect(publicSummary.activeNeeds[0]?.itemType).toBe("Solución fisiológica 0.9%");
    expect(serialized).not.toContain("Nota restringida");
    expect(serialized).not.toContain("POC");
    expect(serialized).not.toContain("updatedBy");
  });
});
