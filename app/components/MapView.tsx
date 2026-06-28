"use client";

/**
 * Shim de compatibilidad. El mapa se descompuso en `components/features/map/*`
 * (contenedor + cluster layer + markers + handlers). Este archivo re-exporta el
 * contenedor nuevo para no romper a quienes importan `./MapView` (EmergencyApp
 * lo carga vía next/dynamic y usa el tipo MapBounds).
 */
export { default } from "@/components/features/map";
export type { MapBounds, MapViewProps } from "@/components/features/map";
