import type { PatientSearchResult } from "@/hooks/hospitals";
import type { Hospital } from "@/lib/hospitals-meta";

/** Construye un enlace de Google Maps a partir de los datos del hospital. */
export function getDirectionsHref(
  hospital:
    | PatientSearchResult["hospital"]
    | Pick<Hospital, "name" | "address" | "municipality" | "state">,
): string {
  const query = [
    hospital.name,
    hospital.address,
    hospital.municipality,
    hospital.state,
    "Venezuela",
  ]
    .filter(Boolean)
    .join(", ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
