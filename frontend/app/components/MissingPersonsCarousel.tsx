"use client";

/**
 * Shim de compatibilidad. El componente se descompuso en
 * `components/features/missing-carousel/` (contenedor + PersonsTab/HospitalsTab
 * + subcomponentes presentacionales + hooks TanStack). Este archivo se conserva
 * como re-export para no romper los imports existentes (app/page.tsx).
 */
export { default } from "@/components/features/missing-carousel";
