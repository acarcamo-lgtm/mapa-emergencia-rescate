import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";

const RecursosPool = dynamic(
  () => import("@/components/features/coordinacion/RecursosPool"),
  {
    loading: () => (
      <section className="mx-auto w-full max-w-5xl px-4 py-10 text-sm text-slate-500">
        Cargando coordinación de recursos…
      </section>
    ),
  },
);

export const metadata: Metadata = pageMetadata({
  title: "Coordinación de recursos",
  description:
    "Maquinaria, fletes, combustible y voluntarios que el sector privado ofrece para llegar a las zonas afectadas por el terremoto.",
  path: "/coordinar",
});

export default function CoordinarPage() {
  return (
    <SubPageShell breadcrumb="Coordinación de recursos">
      <RecursosPool />
    </SubPageShell>
  );
}
