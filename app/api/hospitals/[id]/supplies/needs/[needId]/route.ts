import { NextResponse } from "next/server";
import { BODY_LIMIT_TEXT, bodyErrorResponse, readJson } from "@/lib/body";
import { invalidate } from "@/lib/cache";
import { getHospital } from "@/lib/hospitals";
import {
  updateHospitalSupplyNeed,
  type SupplyNeedPatchInput,
} from "@/lib/hospital-supplies";
import { isHospitalSupplyWriteRequest } from "@/lib/supply-auth";

export const dynamic = "force-dynamic";

/**
 * @swagger
 * /api/hospitals/{id}/supplies/needs/{needId}:
 *   patch:
 *     tags: [hospitals]
 *     summary: Actualiza el estado operativo de una necesidad específica (requiere x-admin-token o x-hospital-poc-token del hospital)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: needId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/HospitalSupplyNeedPatchInput' }
 *     responses:
 *       200:
 *         description: Necesidad actualizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 need: { $ref: '#/components/schemas/HospitalSupplyNeedRestricted' }
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
 *         description: Hospital o necesidad no encontrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       503:
 *         description: No se pudo actualizar la necesidad
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; needId: string }> },
) {
  const { id, needId } = await params;
  const hospital = await getHospital(id);
  if (!hospital) {
    return NextResponse.json({ error: "Hospital no encontrado." }, { status: 404 });
  }
  if (!(await isHospitalSupplyWriteRequest(request, hospital.id))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: SupplyNeedPatchInput;
  try {
    body = await readJson(request, BODY_LIMIT_TEXT);
  } catch (e) {
    return bodyErrorResponse(e);
  }

  try {
    const result = await updateHospitalSupplyNeed(hospital.id, needId, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (!result.value) {
      return NextResponse.json(
        { error: "Necesidad no encontrada." },
        { status: 404 },
      );
    }
    invalidate();
    return NextResponse.json({ need: result.value });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: `No se pudo actualizar la necesidad: ${message}` },
      { status: 503 },
    );
  }
}
