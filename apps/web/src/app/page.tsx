import { ComparisonSection } from "~/components/landing/comparison-section";
import { CtaBand } from "~/components/landing/cta-band";
import { FeaturesGrid } from "~/components/landing/features-grid";
import { Hero } from "~/components/landing/hero";
import { HowItWorks } from "~/components/landing/how-it-works";
import { OpenSourceSection } from "~/components/landing/open-source-section";
import { Pillars } from "~/components/landing/pillars";
import { SiteFooter } from "~/components/landing/site-footer";
import { SiteHeader } from "~/components/landing/site-header";
import { WaitlistSection } from "~/components/landing/waitlist-section";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Pillars />
        <HowItWorks />
        <ComparisonSection />
        <FeaturesGrid />
        <OpenSourceSection />
        <CtaBand />
        <WaitlistSection />
      </main>
      <SiteFooter />
    </>
  );
}
