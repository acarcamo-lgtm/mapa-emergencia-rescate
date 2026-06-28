import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { listHospitals } from "@/lib/hospitals";
import {
  listRestrictedSupplySnapshotsForHospitals,
  type RestrictedHospitalSupplySnapshot,
} from "@/lib/hospital-supplies";
import {
  isOpenHospitalSupplyHelpStatus,
  type Hospital,
} from "@/lib/hospitals-meta";

export const dynamic = "force-dynamic";

interface AdminHospitalSupplyRow {
  hospital: Hospital;
  supply: RestrictedHospitalSupplySnapshot;
}

/**
 * @swagger
 * /api/admin/hospital-supplies:
 *   get:
 *     tags: [admin]
 *     summary: Superficie operativa de insumos hospitalarios (requiere admin)
 *     responses:
 *       200:
 *         description: Hospitales con estados, necesidades, POCs y solicitudes restringidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generatedAt:
 *                   type: integer
 *                   description: epoch-ms
 *                 stats:
 *                   type: object
 *                   properties:
 *                     hospitals: { type: integer }
 *                     redCategories: { type: integer }
 *                     yellowCategories: { type: integer }
 *                     staleCategories: { type: integer }
 *                     activeNeeds: { type: integer }
 *                     helpOpen: { type: integer }
 *                 hospitals:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AdminHospitalSupplyRow' }
 *       401:
 *         description: No autorizado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       503:
 *         description: No se pudo cargar la superficie de insumos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: "No autorizado." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const hospitals = await listHospitals({ limit: 1000 });
    const snapshots = await listRestrictedSupplySnapshotsForHospitals(
      hospitals.map((hospital) => hospital.id),
    );
    const rows: AdminHospitalSupplyRow[] = hospitals.map((hospital) => ({
      hospital,
      supply:
        snapshots.get(hospital.id) ??
        ({
          hospitalId: hospital.id,
          summary: {
            statuses: [],
            activeNeeds: [],
            counts: { red: 0, yellow: 0, stale: 0, activeNeeds: 0 },
            worstStatus: "unknown",
            lastConfirmedAt: null,
          },
          statuses: [],
          activeNeeds: [],
          helpRequests: [],
          pocs: [],
        } satisfies RestrictedHospitalSupplySnapshot),
    }));

    let redCategories = 0;
    let yellowCategories = 0;
    let staleCategories = 0;
    let activeNeeds = 0;
    let helpOpen = 0;
    for (const row of rows) {
      redCategories += row.supply.statuses.filter((s) => s.status === "red").length;
      yellowCategories += row.supply.statuses.filter(
        (s) => s.status === "yellow",
      ).length;
      staleCategories += row.supply.statuses.filter(
        (s) => s.freshness.isStale,
      ).length;
      activeNeeds += row.supply.summary.counts.activeNeeds;
      helpOpen += row.supply.helpRequests.filter((request) =>
        isOpenHospitalSupplyHelpStatus(request.status),
      ).length;
    }

    return NextResponse.json(
      {
        generatedAt: Date.now(),
        stats: {
          hospitals: rows.length,
          redCategories,
          yellowCategories,
          staleCategories,
          activeNeeds,
          helpOpen,
        },
        hospitals: rows,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: `No se pudieron cargar los insumos hospitalarios: ${message}` },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
