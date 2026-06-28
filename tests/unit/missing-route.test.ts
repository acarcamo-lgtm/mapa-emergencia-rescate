import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/missing/route";
import { submitFederationIntake } from "@/lib/federation";

vi.mock("@/lib/federation", () => ({
  missingPersonEnvelope: vi.fn((person: { id: string }) => ({
    kind: "missing_person",
    sourceRecordId: person.id,
  })),
  submitFederationIntake: vi.fn(async () => ({ ok: true })),
}));

function imageDataUrl(seed: string): string {
  return `data:image/png;base64,${Buffer.from(seed).toString("base64")}`;
}

function jsonRequest(body: unknown, ip: string): Request {
  return new Request("http://test.local/api/missing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": ip,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("VERCEL", "");
  vi.mocked(submitFederationIntake).mockClear();
});

describe("/api/missing", () => {
  it("rechaza fotos exactas duplicadas y no espeja el segundo reporte", async () => {
    const photo = imageDataUrl(`duplicate-${crypto.randomUUID()}`);
    const first = await POST(
      jsonRequest(
        {
          name: "Foto Demo Sintetica",
          age: 30,
          lastSeen: "Hospital Demo",
          photo,
        },
        "203.0.113.10",
      ),
    );
    const second = await POST(
      jsonRequest(
        {
          name: "Otra Foto Demo Sintetica",
          age: 31,
          lastSeen: "Hospital Demo",
          photo,
        },
        "203.0.113.11",
      ),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({
      code: "duplicate_photo",
    });
    expect(submitFederationIntake).toHaveBeenCalledTimes(1);
  });

  it("devuelve grupos activos con conflicto sin exponer filas localizadas", async () => {
    const name = `Grupo Demo ${crypto.randomUUID()}`;
    await POST(
      jsonRequest(
        {
          name,
          age: 42,
          lastSeen: "Hospital Demo",
          description: "Reporte activo sintetico",
        },
        "203.0.113.12",
      ),
    );
    await POST(
      jsonRequest(
        {
          name,
          age: 42,
          lastSeen: "Hospital Demo",
          description: "Reporte localizado sintetico",
          reportType: "found",
        },
        "203.0.113.13",
      ),
    );

    const response = await GET(
      new Request(
        `http://test.local/api/missing?grouped=1&status=active&q=${encodeURIComponent(name)}&pageSize=10`,
      ),
    );
    const body = (await response.json()) as {
      people: Array<{
        name: string;
        status: "active" | "found";
        groupReportCount?: number;
        groupStatusConflict?: boolean;
        groupMembers?: Array<{ status: "active" | "found" }>;
      }>;
    };
    const grouped = body.people.find((person) => person.name === name);

    expect(response.status).toBe(200);
    expect(grouped).toMatchObject({
      status: "active",
      groupReportCount: 2,
      groupStatusConflict: true,
    });
    expect(grouped?.groupMembers?.map((member) => member.status)).toEqual([
      "active",
    ]);

    const allResponse = await GET(
      new Request(
        `http://test.local/api/missing?grouped=1&status=all&q=${encodeURIComponent(name)}&pageSize=10`,
      ),
    );
    const allBody = (await allResponse.json()) as typeof body;
    const allGrouped = allBody.people.find((person) => person.name === name);
    expect(allGrouped?.groupMembers?.map((member) => member.status).sort()).toEqual([
      "active",
      "found",
    ]);
  });
});
