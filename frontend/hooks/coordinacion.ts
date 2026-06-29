"use client";

/**
 * Hooks de datos del dominio "coordinación de recursos privados" (Fase 1: pool
 * de oferta). Sigue el patrón canónico de hooks/donations.ts.
 *
 *  - useCoordKinds : GET /api/recursos/kinds -> registro de tipos (cache largo).
 *  - useCoordPool  : GET /api/recursos      -> recursos disponibles (sin PII).
 *  - useOfrecerRecurso : POST /api/recursos -> crea y refresca el pool.
 *  - fetchContacto : GET /api/recursos/:id/contacto -> revela el WhatsApp bajo
 *    demanda (no viene en el listado para evitar scraping masivo).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export interface CoordCampo {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface CoordKind {
  key: string;
  label: string;
  icono: string;
  categoria: string;
  campos: CoordCampo[];
  movilizaCon: string[];
  esPiezaDeMision: boolean;
  orden: number;
}

/** Recurso del pool — SIN datos de contacto (allowlist del backend). */
export interface CoordRecurso {
  id: string;
  kind: string;
  estado: string;
  nombreContacto: string;
  zona: string | null;
  atributos: Record<string, string>;
  createdAt: number;
}

export interface CoordContacto {
  nombreContacto: string;
  whatsapp: string;
  whatsappLink: string;
}

export function useCoordKinds() {
  return useQuery({
    queryKey: qk.coordinacion.kinds,
    queryFn: ({ signal }) =>
      apiGet<{ kinds: CoordKind[] }>("/api/recursos/kinds", signal).then(
        (r) => r.kinds ?? [],
      ),
    staleTime: 5 * 60_000,
  });
}

export function useCoordPool() {
  return useQuery({
    queryKey: qk.coordinacion.pool,
    queryFn: ({ signal }) =>
      apiGet<{ recursos: CoordRecurso[] }>("/api/recursos", signal).then(
        (r) => r.recursos ?? [],
      ),
  });
}

export interface OfrecerRecursoInput {
  kind: string;
  nombre: string;
  whatsapp: string;
  zona?: string;
  atributos?: Record<string, string>;
  turnstileToken?: string; // prueba de humanidad (Turnstile) para el backend
}

export function useOfrecerRecurso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OfrecerRecursoInput) =>
      apiSend<{ recurso: CoordRecurso }>("POST", "/api/recursos", input).then(
        (r) => r.recurso,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.coordinacion.all });
    },
  });
}

/** Revela el contacto de un recurso bajo demanda (al tocar "Contactar"). */
export function fetchContacto(id: string): Promise<CoordContacto> {
  return apiGet<{ contacto: CoordContacto }>(
    `/api/recursos/${encodeURIComponent(id)}/contacto`,
  ).then((r) => r.contacto);
}
