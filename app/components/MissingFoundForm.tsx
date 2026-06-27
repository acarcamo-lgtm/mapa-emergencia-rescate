"use client";

import { useCallback, useRef, useState } from "react";
import { trackEvent } from "./openpanel";
import { LOCALIZED_HOSPITAL_OPTIONS } from "./personReportOptions";

export interface MissingFoundPayload {
  note: string;
  photo: string | null;
}

interface Props {
  personName: string;
  onCancel: () => void;
  onSubmit: (payload: MissingFoundPayload) => Promise<void>;
}

type PersonStatus = "safe" | "deceased";
type FoundPlace = "hospital" | "street";

const MAX_DIM = 960;
const JPEG_QUALITY = 0.62;
const MAX_CONFIRMATION_CHARS = 420;

async function fileToResizedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width >= height && width > MAX_DIM) {
    height = Math.round((height * MAX_DIM) / width);
    width = MAX_DIM;
  } else if (height > MAX_DIM) {
    width = Math.round((width * MAX_DIM) / height);
    height = MAX_DIM;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function HospitalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M3 9h18" strokeLinecap="round" />
    </svg>
  );
}

function StreetIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

function buildResolutionNote(
  personStatus: PersonStatus,
  foundPlace: FoundPlace,
  foundLocation: string,
  note: string,
): string {
  const statusText = personStatus === "safe" ? "A salvo" : "Fallecido/a";
  const placeText =
    foundPlace === "hospital"
      ? `Hospital: ${foundLocation.trim()}`
      : `Calle o zona: ${foundLocation.trim()}`;

  return [
    `Estado final: ${statusText}.`,
    `Dónde fue encontrada: ${placeText}.`,
    `Confirmación: ${note.trim()}`,
  ].join("\n");
}

export default function MissingFoundForm({
  personName,
  onCancel,
  onSubmit,
}: Props) {
  const [personStatus, setPersonStatus] = useState<PersonStatus | null>(null);
  const [foundPlace, setFoundPlace] = useState<FoundPlace | null>(null);
  const [foundLocation, setFoundLocation] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("La prueba debe ser una imagen.");
        return;
      }
      setError(null);
      setProcessing(true);
      try {
        setPhoto(await fileToResizedDataUrl(file));
      } catch {
        setError("No se pudo procesar la imagen. Intenta con otra.");
      } finally {
        setProcessing(false);
      }
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      if (!personStatus) {
        setError("Indica el estado final de la persona.");
        return;
      }
      if (!foundPlace) {
        setError("Indica dónde fue encontrada.");
        return;
      }
      if (!foundLocation.trim()) {
        setError(
          foundPlace === "hospital"
            ? "Selecciona el hospital."
            : "Indica la calle o referencia.",
        );
        return;
      }
      if (!note.trim()) {
        setError(
          "Cuéntanos cómo te comunicaste con la persona o quién lo confirmó.",
        );
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit({
          note: buildResolutionNote(
            personStatus,
            foundPlace,
            foundLocation,
            note,
          ),
          photo,
        });
        trackEvent("missing_person_marked_found", {
          foundPlace,
          personStatus,
          hasPhoto: Boolean(photo),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
        setSubmitting(false);
      }
    },
    [foundLocation, foundPlace, note, onSubmit, personStatus, photo],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="found-title"
      onClick={onCancel}
      className="fixed inset-0 z-[2100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-[500px] overflow-y-auto rounded-2xl bg-white p-7 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            id="found-title"
            className="flex items-center gap-2 font-[family-name:var(--qi-font-display)] text-[22px] font-semibold leading-tight text-[var(--etext)]"
          >
            <span className="text-emerald-600" aria-hidden>
              ✓
            </span>
            Marcar como localizada
          </h3>
          <button
            type="button"
            onClick={onCancel}
            data-track="missing_found_close"
            aria-label="Cerrar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--etext2)]">
          Antes de quitar a <strong className="text-[var(--etext)]">{personName}</strong>{" "}
          del listado, ayúdanos a confirmar el contacto con una breve explicación.
          Esto previene cierres falsos.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-[18px]">
          <fieldset className="border-0 p-0">
            <legend className="mb-2 block text-[13px] font-semibold text-[var(--etext)]">
              ¿Cuál es el estado final de la persona?
            </legend>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPersonStatus("safe")}
                aria-pressed={personStatus === "safe"}
                className={`flex items-center justify-center gap-2 rounded-[10px] border-[1.5px] px-3 py-3 text-sm font-bold transition ${
                  personStatus === "safe"
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
                A salvo
              </button>
              <button
                type="button"
                onClick={() => setPersonStatus("deceased")}
                aria-pressed={personStatus === "deceased"}
                className={`flex items-center justify-center gap-2 rounded-[10px] border-[1.5px] px-3 py-3 text-sm font-bold transition ${
                  personStatus === "deceased"
                    ? "border-red-700 bg-red-700 text-white"
                    : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                Fallecido/a
              </button>
            </div>
          </fieldset>

          <fieldset className="border-0 p-0">
            <legend className="mb-2 block text-[13px] font-semibold text-[var(--etext)]">
              ¿Dónde fue encontrada?
            </legend>
            <div className="mb-2.5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setFoundPlace("hospital");
                  setFoundLocation("");
                }}
                aria-pressed={foundPlace === "hospital"}
                className={`flex items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] px-3 py-3 text-[13px] font-bold transition ${
                  foundPlace === "hospital"
                    ? "border-[#c41a1a] bg-[#c41a1a] text-white"
                    : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                }`}
              >
                <HospitalIcon className="h-3.5 w-3.5 shrink-0" />
                En un hospital
              </button>
              <button
                type="button"
                onClick={() => {
                  setFoundPlace("street");
                  setFoundLocation("");
                }}
                aria-pressed={foundPlace === "street"}
                className={`flex items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] px-3 py-3 text-[13px] font-bold transition ${
                  foundPlace === "street"
                    ? "border-[#c41a1a] bg-[#c41a1a] text-white"
                    : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                }`}
              >
                <StreetIcon className="h-3.5 w-3.5 shrink-0" />
                En la calle
              </button>
            </div>

            {foundPlace === "hospital" && (
              <select
                value={foundLocation}
                onChange={(e) => setFoundLocation(e.target.value)}
                className="e-input"
                aria-label="Seleccionar hospital"
              >
                <option value="">Seleccionar hospital...</option>
                {LOCALIZED_HOSPITAL_OPTIONS.map((hospital) => (
                  <option key={hospital.value} value={hospital.value}>
                    {hospital.label}
                  </option>
                ))}
              </select>
            )}

            {foundPlace === "street" && (
              <input
                type="text"
                value={foundLocation}
                onChange={(e) => setFoundLocation(e.target.value)}
                maxLength={160}
                placeholder="Ej. Av. Principal de Catia, frente a la Plaza Bolivar..."
                className="e-input"
                aria-label="Referencia en la calle"
              />
            )}
          </fieldset>

          <div>
            <label
              htmlFor="found-note"
              className="mb-1.5 block text-[13px] font-semibold text-[var(--etext)]"
            >
              ¿Cómo te comunicaste o quién lo confirmó?{" "}
              <span className="text-red-600">*</span>
            </label>
            <textarea
              id="found-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={MAX_CONFIRMATION_CHARS}
              required
              placeholder="Ej: Hablé por teléfono con su hermana, está en el refugio de Chacao. O: lo vi en persona en el centro médico."
              className="e-input min-h-[100px] resize-none"
            />
          </div>

          <div>
            <div className="mb-2 block text-[13px] font-semibold text-[var(--etext)]">
              Prueba (opcional): captura de pantalla o foto
            </div>
            <input
              id="found-photo"
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt="Vista previa"
                  className="h-[72px] w-[72px] rounded-[10px] object-cover ring-1 ring-slate-200"
                />
              ) : (
                <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[10px] border-[1.5px] border-[var(--eborder)] bg-[var(--einput)] text-2xl text-slate-400">
                  📎
                </div>
              )}
              <div className="flex flex-col items-start gap-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={processing}
                  className="rounded-lg border-[1.5px] border-[var(--eborder)] bg-white px-4 py-2 text-sm font-semibold text-[var(--etext)] hover:bg-[var(--einput)] disabled:opacity-50"
                >
                  {processing
                    ? "Procesando..."
                    : photo
                      ? "Cambiar"
                      : "Adjuntar captura"}
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Quitar
                  </button>
                )}
                <p className="text-xs text-[var(--etext3)]">
                  Ej: pantallazo de WhatsApp, foto con la persona, etc.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[10px] border-[1.5px] border-[var(--eborder)] bg-white px-5 py-3 text-sm font-semibold text-[var(--etext)] hover:bg-[var(--einput)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || processing}
              className="rounded-[10px] bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Enviando..." : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
