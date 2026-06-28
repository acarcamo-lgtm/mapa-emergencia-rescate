import { describe, expect, it } from "vitest";
import { GET as getAdminSupplies } from "@/app/api/admin/hospital-supplies/route";
import { PATCH as patchHelpRequest } from "@/app/api/hospitals/[id]/supplies/help/[requestId]/route";
import { POST as postHelpRequest } from "@/app/api/hospitals/[id]/supplies/help/route";
import { PATCH as patchNeed } from "@/app/api/hospitals/[id]/supplies/needs/[needId]/route";
import { POST as postNeed } from "@/app/api/hospitals/[id]/supplies/needs/route";
import { POST as postStatus } from "@/app/api/hospitals/[id]/supplies/route";
import {
  buildSupplySummary,
  createHospitalSupplyNeed,
  deriveSupplyFreshness,
  getPublicHospitalSupplySummary,
  listRestrictedSupplySnapshotsForHospitals,
  redactPublicSupplySnapshot,
  updateHospitalSupplyNeed,
  upsertHospitalSupplyStatus,
  validateSupplyHelpPatch,
  validateSupplyHelpRequest,
  validateSupplyNeedInput,
  validateSupplyStatusUpdate,
} from "@/lib/hospital-supplies";
import { listHospitals } from "@/lib/hospitals";
import type {
  HospitalPocAssignment,
  HospitalSupplyHelpRequest,
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

function jsonRequest(body: unknown, token?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("x-admin-token", token);
  return new Request("http://test.local/api", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function firstHospitalId(): Promise<string> {
  const hospitals = await listHospitals({ limit: 1 });
  const id = hospitals[0]?.id;
  if (!id) throw new Error("No hay hospital demo para la prueba.");
  return id;
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

  it("rechaza datos de contacto o POC en notas públicas", () => {
    const result = validateSupplyStatusUpdate({
      category: "water",
      status: "yellow",
      publicNote: "Llamar al POC por WhatsApp +58 412 000 0000",
      restrictedNote: "Este dato sí puede vivir restringido.",
    });

    expect(result.ok).toBe(false);
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

  it("rechaza contacto o identificadores en campos públicos de necesidad", () => {
    const result = validateSupplyNeedInput({
      category: "medical_supplies",
      itemType: "Gasas",
      urgency: "red",
      publicNote: "Contacto: poc@example.test",
    });

    expect(result.ok).toBe(false);
  });
});

describe("validateSupplyHelpRequest", () => {
  it("rechaza mensajes vacíos, urgencia verde y patches inválidos", () => {
    expect(validateSupplyHelpRequest({ category: "water", message: "" }).ok).toBe(
      false,
    );
    expect(
      validateSupplyHelpRequest({
        category: "water",
        message: "Sin acceso al panel",
        urgency: "green",
      }).ok,
    ).toBe(false);
    expect(validateSupplyHelpPatch({ status: "archived" }).ok).toBe(false);
  });
});

describe("supply write helpers", () => {
  it("no permite confirmar sin cambios si no hay reporte previo", async () => {
    const result = await upsertHospitalSupplyStatus("hospital-no-previo", {
      category: "water",
      confirmOnly: true,
      updatedBy: "POC demo",
    });

    expect(result.ok).toBe(false);
  });

  it("preserva notas omitidas al cambiar semáforo", async () => {
    const hospitalId = "hospital-preserva-notas";
    const created = await upsertHospitalSupplyStatus(hospitalId, {
      category: "medications",
      status: "yellow",
      publicNote: "Nota pública inicial.",
      restrictedNote: "Nota restringida inicial.",
    });
    expect(created.ok).toBe(true);

    const updated = await upsertHospitalSupplyStatus(hospitalId, {
      category: "medications",
      status: "red",
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.status).toBe("red");
      expect(updated.value.publicNote).toBe("Nota pública inicial.");
      expect(updated.value.restrictedNote).toBe("Nota restringida inicial.");
    }
  });

  it("saca necesidades cubiertas de activeNeeds restringidas y públicas", async () => {
    const hospitalId = "hospital-necesidad-cubierta";
    const created = await createHospitalSupplyNeed(hospitalId, {
      category: "iv_fluids",
      itemType: "Ringer lactato",
      urgency: "red",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const patched = await updateHospitalSupplyNeed(hospitalId, created.value.id, {
      status: "covered",
    });
    expect(patched.ok).toBe(true);

    const restricted = await listRestrictedSupplySnapshotsForHospitals([
      hospitalId,
    ]);
    const publicSummary = await getPublicHospitalSupplySummary(hospitalId);

    expect(
      restricted.get(hospitalId)?.activeNeeds.some((n) => n.id === created.value.id),
    ).toBe(false);
    expect(publicSummary.activeNeeds.some((n) => n.id === created.value.id)).toBe(
      false,
    );
  });
});

describe("supply route auth and validation", () => {
  it("rechaza escrituras sin token en todos los endpoints de insumos", async () => {
    const hospitalId = await firstHospitalId();
    const params = Promise.resolve({ id: hospitalId });
    const idParams = Promise.resolve({
      id: hospitalId,
      needId: "need-demo",
      requestId: "help-demo",
    });

    const responses = await Promise.all([
      postStatus(jsonRequest({ category: "water", status: "yellow" }), {
        params,
      }),
      postNeed(jsonRequest({ category: "water", itemType: "Agua" }), {
        params,
      }),
      patchNeed(jsonRequest({ status: "covered" }), {
        params: idParams,
      }),
      postHelpRequest(jsonRequest({ category: "water", message: "Ayuda" }), {
        params,
      }),
      patchHelpRequest(jsonRequest({ status: "resolved" }), {
        params: idParams,
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401,
      401,
      401,
      401,
      401,
    ]);
  });

  it("mantiene la superficie admin solo con token admin", async () => {
    const response = await getAdminSupplies(new Request("http://test.local/api"));
    expect(response.status).toBe(401);
  });

  it("rechaza nota pública insegura en el endpoint autenticado", async () => {
    const previousPassword = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = "demo-secret";
    try {
      const hospitalId = await firstHospitalId();
      const response = await postStatus(
        jsonRequest(
          {
            category: "water",
            status: "yellow",
            publicNote: "Llamar al POC +58 412 000 0000",
          },
          "demo-secret",
        ),
        { params: Promise.resolve({ id: hospitalId }) },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("nota pública"),
        }),
      );
    } finally {
      if (previousPassword === undefined) {
        delete process.env.ADMIN_PASSWORD;
      } else {
        process.env.ADMIN_PASSWORD = previousPassword;
      }
    }
  });
});

describe("public supply redaction", () => {
  it("construye resumen público sin notas restringidas ni actores privados", () => {
    const helpRequest: HospitalSupplyHelpRequest = {
      id: "help-demo",
      hospitalId: "hospital-demo",
      category: "iv_fluids",
      categoryLabel: "Líquidos IV / sueros",
      message: "POC interno pidió ayuda.",
      urgency: "red",
      status: "open",
      requestedBy: "Dra. Demo",
      source: "test",
      restrictedNote: "Contacto restringido.",
      createdAt: NOW,
      updatedAt: NOW,
      updatedAgo: "ahora mismo",
    };
    const poc: HospitalPocAssignment = {
      id: "poc-demo",
      hospitalId: "hospital-demo",
      displayName: "POC Demo",
      role: "hospital_poc",
      restrictedContact: "+58 412 000 0000",
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const snapshot = {
      hospitalId: "hospital-demo",
      statuses: [statusFixture()],
      activeNeeds: [needFixture()],
      helpRequests: [helpRequest],
      pocs: [poc],
      summary: buildSupplySummary([statusFixture()], [needFixture()]),
    };

    const publicSummary = redactPublicSupplySnapshot(snapshot);
    const serialized = JSON.stringify(publicSummary);

    expect(publicSummary.counts.red).toBe(2);
    expect(Object.keys(publicSummary.statuses[0] ?? {}).sort()).toEqual([
      "category",
      "freshness",
      "label",
      "publicNote",
      "status",
    ]);
    expect(Object.keys(publicSummary.activeNeeds[0] ?? {}).sort()).toEqual([
      "category",
      "categoryLabel",
      "hospitalId",
      "id",
      "itemType",
      "lastConfirmedAt",
      "publicNote",
      "quantity",
      "status",
      "unit",
      "updatedAgo",
      "updatedAt",
      "urgency",
    ]);
    expect(publicSummary.activeNeeds[0]?.itemType).toBe("Solución fisiológica 0.9%");
    expect(serialized).not.toContain("Nota restringida");
    expect(serialized).not.toContain("POC");
    expect(serialized).not.toContain("Dra. Demo");
    expect(serialized).not.toContain("+58");
    expect(serialized).not.toContain("helpRequests");
    expect(serialized).not.toContain("pocs");
    expect(serialized).not.toContain("restrictedContact");
    expect(serialized).not.toContain("updatedBy");
    expect(serialized).not.toContain("source");
  });
});
