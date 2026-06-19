import { DiscordIcon, GitHubIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { APP_URL, DISCORD_URL, GITHUB_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

interface Plan {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  cta: { label: string; url?: string; icon?: React.ReactNode };
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    cta: {
      icon: <GitHubIcon className="size-4" />,
      label: "View on GitHub",
      url: GITHUB_URL,
    },
    features: [
      "The entire platform, MIT licensed",
      "One-command Docker Compose deploy",
      "Your infrastructure, your data",
      "Unlimited events and projects",
      "Community support on Discord",
    ],
    name: "Self-hosted",
    price: "Free",
    tagline: "Run it yourself, forever.",
  },
  {
    cta: { label: "Start free", url: APP_URL },
    features: [
      "Fully managed, zero ops",
      "500K events per month, free",
      "Real-time dashboards and alerts",
      "Discord and Steam auth built in",
      "Email support",
    ],
    highlighted: true,
    name: "Free cloud",
    price: "$0",
    tagline: "We host it. You ship.",
  },
  {
    cta: {
      icon: <DiscordIcon className="size-4" />,
      label: "Join Discord",
      url: DISCORD_URL,
    },
    features: [
      "Everything in Free cloud",
      "Volume and retention SLAs",
      "SSO and audit logs",
      "Raw data export to S3",
      "Dedicated support channel",
    ],
    name: "Custom",
    price: "Let's talk",
    tagline: "Scale and support, tailored.",
  },
];

const Pricing = () => (
  <section className="py-32 lg:py-44" id="pricing">
    <div className="container">
      <Reveal className="max-w-2xl">
        <h2 className="text-balance font-bold text-4xl tracking-tight md:text-5xl">
          You pay for hosting, never for features.
        </h2>
        <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
          The software is free and complete. Self-host it, start free in our
          cloud, or talk to us when you need scale and support.
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
        {PLANS.map((plan, index) => (
          <Reveal delay={index * 90} key={plan.name}>
            <div
              className={cn(
                "relative flex h-full flex-col rounded-2xl border p-7",
                plan.highlighted
                  ? "border-primary/60 bg-card shadow-2xl shadow-primary/10 ring-1 ring-primary/30"
                  : "border-border/70 bg-card/40"
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground text-xs">
                  Recommended
                </span>
              )}
              <h3 className="font-medium text-muted-foreground text-sm">
                {plan.name}
              </h3>
              <p className="mt-3 font-bold text-4xl tracking-tight">
                {plan.price}
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                {plan.tagline}
              </p>

              <ul className="mt-7 flex flex-1 flex-col gap-3.5 text-sm">
                {plan.features.map((feature) => (
                  <li className="text-muted-foreground" key={feature}>
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.cta.url && (
                <Button
                  className="mt-8 w-full"
                  nativeButton={false}
                  render={
                    <a
                      aria-label={plan.cta.label}
                      href={plan.cta.url}
                      rel="noopener"
                      target="_blank"
                    />
                  }
                  variant={plan.highlighted ? "default" : "outline"}
                >
                  {plan.cta.icon}
                  {plan.cta.label}
                </Button>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

export { Pricing };
