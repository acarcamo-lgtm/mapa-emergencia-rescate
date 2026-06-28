import dynamic from "next/dynamic";
import type { Metadata } from "next";
import SubPageShell from "@/app/components/SubPageShell";

const InternationalHelp = dynamic(
  () => import("@/app/components/InternationalHelp"),
  {
    loading: () => (
      <section className="mx-auto w-full max-w-7xl px-4 py-10 text-sm text-slate-500">
        Cargando ayuda internacional…
      </section>
    ),
  },
);

export const metadata: Metadata = {
  title: "Apoyo global · Mapa de Emergencia Venezuela",
  alternates: { canonical: "/apoyo-global" },
  description:
    "Recursos y ayuda internacional para apoyar la emergencia en Venezuela. Iniciativa ciudadana, independiente y no gubernamental.",
  openGraph: {
    title: "Apoyo global · Mapa de Emergencia Venezuela",
    description:
      "Recursos y ayuda internacional para apoyar la emergencia en Venezuela. Iniciativa ciudadana, independiente y no gubernamental.",
    url: "/apoyo-global",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Apoyo global · Mapa de Emergencia Venezuela",
    description:
      "Recursos y ayuda internacional para apoyar la emergencia en Venezuela. Iniciativa ciudadana, independiente y no gubernamental.",
  },
};

export default function ApoyoGlobalPage() {
  return (
    <SubPageShell breadcrumb="Apoyo global">
      <InternationalHelp />
    </SubPageShell>
  );
}
