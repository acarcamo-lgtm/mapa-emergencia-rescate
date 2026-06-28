"use client";

/**
 * Shim de compatibilidad. El componente real se descompuso en
 * `components/features/hospitals/*` (contenedor + subcomponentes + hooks
 * TanStack). Este archivo solo re-exporta para no romper los importadores
 * existentes (app/hospitales/page.tsx, MissingPersonsCarousel).
 */
export { default } from "@/components/features/hospitals";
export { default as HospitalDetailOverlay } from "@/components/features/hospitals/HospitalDetailOverlay";
