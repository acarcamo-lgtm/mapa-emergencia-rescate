import { NextResponse } from "next/server";
import { BODY_LIMIT_TEXT, bodyErrorResponse, readJson } from "@/lib/body";
import { invalidate } from "@/lib/cache";
import { getHospital } from "@/lib/hospitals";
import {
  createHospitalSupplyNeed,
  getPublicHospitalSupplySummary,
  type SupplyNeedInput,
} from "@/lib/hospital-supplies";
import { isHospitalSupplyWriteRequest } from "@/lib/supply-auth";

export const dynamic = "force-dynamic";

/**
 * @swagger
 * /api/hospitals/{id}/supplies/needs:
 *   post:
 *     tags: [hospitals]
 *     summary: Crea una necesidad específica de insumos para un hospital (requiere x-admin-token o x-hospital-poc-token del hospital)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/HospitalSupplyNeedInput' }
 *     responses:
 *       201:
 *         description: Necesidad creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 need: { $ref: '#/components/schemas/HospitalSupplyNeedRestricted' }
 *                 supply: { $ref: '#/components/schemas/HospitalSupplySummary' }
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       413:
 *         description: Payload demasiado grande
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: No autorizado (falta token admin o POC activo para el hospital)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Hospital no encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       503:
 *         description: No se pudo guardar la necesidad
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const hospital = await getHospital(id);
  if (!hospital) {
    return NextResponse.json({ error: "Hospital no encontrado." }, { status: 404 });
  }
  if (!(await isHospitalSupplyWriteRequest(request, hospital.id))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: SupplyNeedInput;
  try {
    body = await readJson(request, BODY_LIMIT_TEXT);
  } catch (e) {
    return bodyErrorResponse(e);
  }

  try {
    const result = await createHospitalSupplyNeed(hospital.id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    invalidate();
    const supply = await getPublicHospitalSupplySummary(hospital.id);
    return NextResponse.json({ need: result.value, supply }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: `No se pudo guardar la necesidad: ${message}` },
      { status: 503 },
    );
  }
}
