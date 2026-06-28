"use client";

/**
 * Cola offline (IndexedDB) de creación de reportes — PRESERVADA TAL CUAL.
 *
 * Es crítica: gente reporta sin señal en una emergencia. La lógica de envío,
 * clasificación de error y reintento NO se migra a TanStack ni se "limpia".
 * Este módulo aísla el camino de escritura offline-aware:
 *   - postReportToServer: POST /api/reports + clasificación ok/queue/drop.
 *   - re-export de la capa IndexedDB de @/lib/offline-queue (enqueue/list/…).
 *
 * El flush/retry (online event + intervalo) vive en el contenedor; usa estas
 * funciones. No es una mutación de TanStack a propósito.
 */
import {
  countPending,
  enqueueReport,
  listPending,
  removePending,
  type QueuedPayload,
  type QueuedReport,
} from "@/lib/offline-queue";
import type { EmergencyReport } from "@/lib/types";

export {
  countPending,
  enqueueReport,
  listPending,
  removePending,
  type QueuedPayload,
  type QueuedReport,
};

export type SubmitOutcome =
  | { status: "ok"; report?: EmergencyReport }
  // Fallo transitorio (sin conexión, 429 o 503): conviene encolar y reintentar.
  | { status: "queue" }
  // Fallo permanente (datos inválidos): no tiene sentido reintentar.
  | { status: "drop"; error: string };

/** Envía un reporte al servidor y clasifica el resultado para decidir si se
 * muestra, se encola para reintento, o se descarta. */
export async function postReportToServer(
  payload: QueuedPayload,
): Promise<SubmitOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Red caída: no llegó al servidor.
    return { status: "queue" };
  }
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    return { status: "ok", report: data.report };
  }
  // Servidor alcanzable pero con error transitorio: reintentamos más tarde.
  if (res.status === 429 || res.status === 503) return { status: "queue" };
  const data = await res.json().catch(() => ({}));
  return {
    status: "drop",
    error: data.error ?? "No se pudo publicar la alerta.",
  };
}
