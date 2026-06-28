import { NextResponse } from "next/server";
import { BODY_LIMIT_TEXT, bodyErrorResponse, readJson } from "@/lib/body";
import { invalidate } from "@/lib/cache";
import { getHospital } from "@/lib/hospitals";
import {
  createHospitalSupplyHelpRequest,
  type SupplyHelpRequestInput,
} from "@/lib/hospital-supplies";
import { isHospitalSupplyWriteRequest } from "@/lib/supply-auth";

export const dynamic = "force-dynamic";

/**
 * @swagger
 * /api/hospitals/{id}/supplies/help:
 *   post:
 *     tags: [hospitals]
 *     summary: Crea una solicitud restringida de ayuda para actualizar insumos (requiere x-admin-token o x-hospital-poc-token del hospital)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/HospitalSupplyHelpRequestInput' }
 *     responses:
 *       201:
 *         description: Solicitud creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 request: { $ref: '#/components/schemas/HospitalSupplyHelpRequest' }
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
 *         description: No se pudo guardar la solicitud
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

  let body: SupplyHelpRequestInput;
  try {
    body = await readJson(request, BODY_LIMIT_TEXT);
  } catch (e) {
    return bodyErrorResponse(e);
  }

  try {
    const result = await createHospitalSupplyHelpRequest(hospital.id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    invalidate();
    return NextResponse.json({ request: result.value }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: `No se pudo guardar la solicitud: ${message}` },
      { status: 503 },
    );
  }
}
