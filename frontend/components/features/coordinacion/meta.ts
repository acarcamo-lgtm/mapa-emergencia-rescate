/**
 * Metadatos de presentación por categoría de recurso. Usa solo familias de
 * color definidas en el tema (amber, violet, sky, indigo, emerald, red, slate).
 */
export interface CatMeta {
  label: string;
  text: string;
  bg: string;
  ring: string;
}

const CATS: Record<string, CatMeta> = {
  maquinaria: { label: "Maquinaria", text: "text-amber-700", bg: "bg-amber-100", ring: "ring-amber-200" },
  personas: { label: "Personas", text: "text-violet-700", bg: "bg-violet-100", ring: "ring-violet-200" },
  transporte: { label: "Transporte", text: "text-sky-700", bg: "bg-sky-100", ring: "ring-sky-200" },
  energia: { label: "Energía", text: "text-indigo-700", bg: "bg-indigo-100", ring: "ring-indigo-200" },
  agua: { label: "Agua", text: "text-emerald-700", bg: "bg-emerald-100", ring: "ring-emerald-200" },
  conectividad: { label: "Conectividad", text: "text-slate-700", bg: "bg-slate-100", ring: "ring-slate-200" },
  rescate: { label: "Rescate", text: "text-red-700", bg: "bg-red-100", ring: "ring-red-200" },
  saneamiento: { label: "Saneamiento", text: "text-emerald-700", bg: "bg-emerald-100", ring: "ring-emerald-200" },
  refugio: { label: "Refugio", text: "text-slate-700", bg: "bg-slate-100", ring: "ring-slate-200" },
  salud: { label: "Salud", text: "text-red-700", bg: "bg-red-100", ring: "ring-red-200" },
};

const DEFAULT_CAT: CatMeta = {
  label: "Otro",
  text: "text-slate-700",
  bg: "bg-slate-100",
  ring: "ring-slate-200",
};

export function catMeta(categoria: string): CatMeta {
  return CATS[categoria] ?? DEFAULT_CAT;
}
