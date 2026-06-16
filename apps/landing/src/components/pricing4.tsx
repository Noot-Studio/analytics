import { Check } from "lucide-react";
import type { ElementType } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { APP_URL, DISCORD_URL, GITHUB_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

type IconComponent = ElementType<{ className?: string }>;
type PlanFeature =
  | string
  | {
      text: string;
      icon?: IconComponent;
    };
interface Plan {
  name: string;
  price: string;
  period?: string;
  buttonText: string;
  buttonUrl?: string;
  highlighted?: boolean;
  features: PlanFeature[];
}

interface Pricing4Props {
  heading: string;
  description?: string;
  plans: Plan[];
  className?: string;
}

type Props = Partial<Pricing4Props>;

const planFeatureText = (feature: PlanFeature): string =>
  typeof feature === "string" ? feature : feature.text;

const defaultProps: Pricing4Props = {
  description:
    "Own your data. Self-host it for free, let us run it for free, or talk to us when you need scale and support.",
  heading: "Pricing that respects open source",
  plans: [
    {
      buttonText: "View on GitHub",
      buttonUrl: GITHUB_URL,
      features: [
        "The entire platform, MIT licensed",
        "One-command Docker Compose deploy",
        "Your infrastructure, your data",
        "Unlimited events and projects",
        "Community support on Discord",
      ],
      name: "Self-hosted",
      period: "",
      price: "Self-host",
    },
    {
      buttonText: "Start free",
      buttonUrl: APP_URL,
      features: [
        "Fully managed — zero ops",
        "500K events per month, free",
        "Real-time dashboard and alerts",
        "Discord and Steam auth built in",
        "Email support",
      ],
      highlighted: true,
      name: "Free cloud",
      period: "forever",
      price: "$0",
    },
    {
      buttonText: "Join Discord",
      buttonUrl: DISCORD_URL,
      features: [
        "Everything in Free cloud",
        "Volume and retention SLAs",
        "SSO and audit logs",
        "Raw data export to S3",
        "Dedicated support channel",
      ],
      name: "Custom",
      period: "",
      price: "Let's talk",
    },
  ],
};

const Pricing4 = (props: Props) => {
  const { heading, description, plans, className } = {
    ...defaultProps,
    ...props,
  };
  const firstHighlightedIndex = plans.findIndex((p) => p.highlighted);

  return (
    <section className={cn("py-32", className)}>
      <div className="container mx-auto">
        <div className="flex flex-col gap-6">
          <h2 className="text-3xl font-medium tracking-tight text-pretty lg:text-5xl">
            {heading}
          </h2>
          {description && (
            <p className="max-w-3xl text-muted-foreground lg:text-xl">
              {description}
            </p>
          )}
          <div className="flex w-full flex-col items-stretch gap-6 md:flex-row">
            {plans.map((plan, index) => {
              const isHighlighted =
                firstHighlightedIndex !== -1 && index === firstHighlightedIndex;
              return (
                <div
                  key={plan.name}
                  className={cn(
                    "flex w-full flex-col rounded-lg border p-6 text-left",
                    isHighlighted && "bg-muted"
                  )}
                >
                  <h3 className="text-4xl font-semibold tracking-tight lg:text-5xl">
                    {plan.price}
                  </h3>
                  <p
                    className={cn(
                      "text-muted-foreground",
                      plan.price === "$0" && "invisible"
                    )}
                  >
                    {plan.period}
                  </p>
                  <Separator className="my-6" />
                  <div className="flex h-full flex-col justify-between gap-20">
                    <ul className="space-y-4 text-muted-foreground md:leading-snug">
                      {plan.features.map((feature) => (
                        <li
                          key={planFeatureText(feature)}
                          className="flex items-center gap-2"
                        >
                          <Check
                            className="size-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{planFeatureText(feature)}</span>
                        </li>
                      ))}
                    </ul>
                    {plan.buttonUrl && (
                      <Button
                        className="w-full"
                        variant={isHighlighted ? "default" : "outline"}
                        nativeButton={false}
                        render={
                          <a
                            aria-label={plan.buttonText}
                            href={plan.buttonUrl}
                            rel="noopener"
                            target="_blank"
                          />
                        }
                      >
                        {plan.buttonText}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export { Pricing4 };
