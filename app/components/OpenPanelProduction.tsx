"use client";

import { OpenPanelComponent } from "@openpanel/nextjs";

import { OPENPANEL_PRODUCTION_HOST } from "./openpanel-config";

export default function OpenPanelProduction({
  clientId,
}: {
  clientId: string;
}) {
  if (typeof window === "undefined") return null;
  if (window.location.hostname !== OPENPANEL_PRODUCTION_HOST) return null;

  return (
    <OpenPanelComponent
      apiUrl="/api/op"
      scriptUrl="/api/op/op1.js"
      clientId={clientId}
      trackScreenViews
      trackOutgoingLinks
      trackAttributes
    />
  );
}
