"use client";

/**
 * Hooks de datos del dominio "donations" — sigue el patrón canónico de
 * hooks/missing.ts.
 *
 *  - useDonationMonthly: GET /api/donations -> stats mensuales (raised/goal).
 *    queryKey qk.donations.monthly (compartida => dedup entre paneles).
 *  - useCreateDonation: POST /api/donations -> { paypalUrl }. Invalida el
 *    dominio en onSuccess para refrescar el monto recaudado.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export type MonthlyDonation = {
  raisedCents: number;
  goalCents: number;
};

/** Stats mensuales de donaciones (raised / goal). Misma queryKey en todos los
 *  paneles => un solo request (dedup). La invalidación tras donar la refresca. */
export function useDonationMonthly() {
  return useQuery({
    queryKey: qk.donations.monthly,
    queryFn: ({ signal }) =>
      apiGet<{ monthly?: MonthlyDonation }>("/api/donations", signal).then(
        (r) => r.monthly ?? null,
      ),
  });
}

// ---- Mutaciones ----
export interface CreateDonationInput {
  name: string;
  amountCents: number;
  turnstileToken?: string; // prueba de humanidad (Turnstile) para el backend
}

export interface CreateDonationResult {
  paypalUrl?: string;
}

/** Registra la intención de donación. Devuelve la URL de PayPal. Invalida el
 *  dominio en onSuccess para refrescar el monto recaudado del panel. */
export function useCreateDonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDonationInput) =>
      apiSend<CreateDonationResult>("POST", "/api/donations", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.donations.all }),
  });
}
