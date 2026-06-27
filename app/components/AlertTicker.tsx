"use client";

import { Fragment, useCallback, useRef, useState } from "react";

const SISMO_MESSAGE =
  "Sismo en Venezuela · Zonas afectadas: La Guaira, Miranda, Distrito Capital · Réplicas activas · Mantente alejado de estructuras dañadas";

const EMERGENCY_LINKS = [
  { label: "911 Emergencias", href: "tel:911" },
  { label: "171 CICPC", href: "tel:171" },
  { label: "172 Bomberos", href: "tel:172" },
  { label: "0800-RESCATE Protección Civil", href: "tel:08007372283" },
] as const;

type TickerItem =
  | { kind: "text"; message: string }
  | { kind: "emergency"; links: readonly (typeof EMERGENCY_LINKS)[number][] };

const TICKER_ITEMS: TickerItem[] = [
  { kind: "text", message: SISMO_MESSAGE },
  { kind: "emergency", links: EMERGENCY_LINKS },
];

function EmergencyTickerLinks({
  links,
}: {
  links: readonly (typeof EMERGENCY_LINKS)[number][];
}) {
  return (
    <span className="alert-ticker__phones inline-flex items-center px-8 text-xs font-bold text-red-900">
      <span aria-hidden className="mr-1">
        📞
      </span>
      {links.map((link, index) => (
        <Fragment key={link.href}>
          {index > 0 ? (
            <span aria-hidden className="mx-1.5 text-red-700/70">
              ·
            </span>
          ) : null}
          <a
            href={link.href}
            className="alert-ticker__link inline-flex min-h-9 items-center rounded px-1.5 py-1 underline decoration-red-400/70 underline-offset-2 transition hover:bg-red-200/70 hover:decoration-red-800 active:bg-red-300/80 sm:min-h-0 sm:py-0.5"
          >
            {link.label}
          </a>
        </Fragment>
      ))}
    </span>
  );
}

export default function AlertTicker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  const [paused, setPaused] = useState(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pauseTicker = useCallback(() => {
    setPaused(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setPaused(false), 8000);
  }, []);

  return (
    <div
      className={`alert-ticker flex min-h-[52px] items-stretch overflow-hidden border-y border-red-200 bg-red-100 sm:min-h-[38px] sm:items-center${
        paused ? " is-paused" : ""
      }`}
      aria-live="polite"
      onPointerDown={pauseTicker}
    >
      <div className="alert-ticker__label flex h-full shrink-0 items-center gap-1.5 self-stretch bg-[#C41A1A] px-3 text-[10px] font-extrabold uppercase tracking-widest text-white sm:px-4 sm:text-[11px]">
        <span
          className="inline-block h-[7px] w-[7px] rounded-full bg-white"
          style={{ animation: "pdot 2s ease-in-out infinite" }}
          aria-hidden
        />
        Alerta
      </div>
      <div className="alert-ticker__viewport relative flex flex-1 items-center self-stretch overflow-hidden">
        <div className="alert-ticker__track flex w-max items-center whitespace-nowrap">
          {items.map((item, i) =>
            item.kind === "text" ? (
              <span
                key={i}
                className="alert-ticker__message shrink-0 px-6 text-[11px] leading-none text-red-900 sm:px-8 sm:text-xs"
                style={{ fontWeight: 400 }}
              >
                {item.message}
              </span>
            ) : (
              <span key={i} className="hidden sm:inline-flex">
                <EmergencyTickerLinks links={item.links} />
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
