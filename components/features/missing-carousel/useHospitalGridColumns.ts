"use client";

import { useEffect, useState } from "react";

/**
 * Nº de columnas del grid según breakpoints (1 / 2 / 3). Verbatim del carousel
 * original; compartido por PersonsTab y HospitalsTab para calcular el pageSize.
 */
export function useHospitalGridColumns(): number {
  const [cols, setCols] = useState(3);

  useEffect(() => {
    const mqSm = window.matchMedia("(min-width: 640px)");
    const mqLg = window.matchMedia("(min-width: 960px)");
    const update = () => {
      if (mqLg.matches) setCols(3);
      else if (mqSm.matches) setCols(2);
      else setCols(1);
    };
    update();
    mqSm.addEventListener("change", update);
    mqLg.addEventListener("change", update);
    return () => {
      mqSm.removeEventListener("change", update);
      mqLg.removeEventListener("change", update);
    };
  }, []);

  return cols;
}
