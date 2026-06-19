import { createFileRoute } from "@tanstack/react-router";

import { DocsCta } from "@/components/docs-cta";
import { FinalCta } from "@/components/final-cta";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { OpenSourceBand } from "@/components/open-source-band";
import { Pricing } from "@/components/pricing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const LandingPage = () => (
  <div className="flex min-h-screen flex-col bg-background text-foreground">
    <SiteHeader />
    <main className="flex-1">
      <Hero />
      <OpenSourceBand />
      <HowItWorks />
      <DocsCta />
      <Pricing />
      <FinalCta />
    </main>
    <SiteFooter />
  </div>
);

export const Route = createFileRoute("/")({
  component: LandingPage,
});
