import dynamic from "next/dynamic";
import EmergencyApp from "@/components/features/emergency";
import { HeroDesktopNav, MobileStickyNav } from "@/app/components/SectionNav";
import SiteFooter from "@/app/components/SiteFooter";
import HeroSection from "@/app/components/HeroSection";
import HelpSection from "@/app/components/HelpSection";
import AlertTicker from "@/app/components/AlertTicker";
import TutorialSteps from "@/app/components/TutorialSteps";

const MissingPersonsCarousel = dynamic(
  () => import("@/components/features/missing-carousel"),
  {
    loading: () => (
      <section className="border-b border-[var(--eborder)] bg-[var(--esurf)] px-4 py-6 text-center text-sm text-[var(--etext2)]">
        Cargando directorio…
      </section>
    ),
  },
);

export default function Home() {
  return (
    <>
      <HeroDesktopNav />
      <main id="main" className="flex-1">
        <HeroSection />
        <AlertTicker />

        <MissingPersonsCarousel />

        <TutorialSteps />
        
        <HelpSection />

        <EmergencyApp />
      </main >

      <SiteFooter />
      <MobileStickyNav />
    </>
  );
}
