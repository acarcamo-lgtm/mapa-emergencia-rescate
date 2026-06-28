import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { isAdminRequest } from "./admin";
import { getDb, hasDbEnv, schema } from "./drizzle";

const POC_HEADER = "x-hospital-poc-token";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function isHospitalSupplyWriteRequest(
  request: Request,
  hospitalId: string,
): Promise<boolean> {
  if (isAdminRequest(request)) return true;

  const token = request.headers.get(POC_HEADER)?.trim();
  if (!token || !hasDbEnv()) return false;

  const rows = await getDb()
    .select({ id: schema.hospitalPocAssignments.id })
    .from(schema.hospitalPocAssignments)
    .where(
      and(
        eq(schema.hospitalPocAssignments.hospitalId, hospitalId),
        eq(schema.hospitalPocAssignments.active, true),
        eq(schema.hospitalPocAssignments.accessTokenHash, hashToken(token)),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

export { POC_HEADER };
