import type { EmergencyReport } from "@/lib/types";
import type { MissingMapMarker } from "@/hooks/missing";

export type MapBounds = {
	north: number;
	south: number;
	east: number;
	west: number;
};

export interface MapViewProps {
	reports: EmergencyReport[];
	missingMarkers?: MissingMapMarker[];
	showMissingOnMap?: boolean;
	onBoundsChange?: (bounds: MapBounds) => void;
	draft: { lat: number; lng: number } | null;
	onPick: (lat: number, lng: number) => void;
	onResolve: (id: string) => void;
	onConfirm: (id: string) => void;
	confirmed: Set<string>;
	isAdmin: boolean;
	focus: { lat: number; lng: number; ts: number; id?: string } | null;
	center: [number, number];
	zoom: number;
	/** Pedido para encuadrar el mapa a un conjunto de pines (al filtrar por tipo). */
	fitRequest?: { points: { lat: number; lng: number }[]; ts: number } | null;
	/** Muestra la capa de edificios afectados (snapshot de sismovenezuela.org). */
	showEdificios?: boolean;
}
