"use client";

import { OPENPANEL_PRODUCTION_HOST } from "./openpanel-config";

type OpenPanelWindow = Window & {
  op?: (method: "track", event: string, properties?: Record<string, unknown>) => void;
};

function isProductionHost(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hostname === OPENPANEL_PRODUCTION_HOST
  );
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!isProductionHost()) return;
  (window as OpenPanelWindow).op?.("track", event, {
    path: window.location.pathname,
    ...properties,
  });
}
