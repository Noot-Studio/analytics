import { createFileRoute } from "@tanstack/react-router";

import { CodeExample } from "@/components/code-example";
import { Hero1 } from "@/components/hero1";
import { ImproveStats } from "@/components/improve-stats";
import { Pricing4 } from "@/components/pricing4";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const LandingPage = () => (
  <div className="flex min-h-screen flex-col bg-background">
    <SiteHeader />
    <main className="flex-1">
      <Hero1 />
      <div id="features">
        <ImproveStats />
      </div>
      <CodeExample />
      <div id="pricing">
        <Pricing4 />
      </div>
    </main>
    <SiteFooter />
  </div>
);

export const Route = createFileRoute("/")({
  component: LandingPage,
});
