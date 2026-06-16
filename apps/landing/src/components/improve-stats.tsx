import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface StatFeature {
  title: string;
  body: string;
  alt: string;
}

// Each `alt` describes the in-editor capture its panel will eventually show.
// The preview image column is temporarily removed; restore it to use these.
const features: StatFeature[] = [
  {
    alt: "In-editor heatmap of player death locations across the map",
    body: "Death events carry a world position, so every wipe lands on the map. The chokepoint nobody survives stops being a guess.",
    title: "Find where your players keep dying",
  },
  {
    alt: "Economy flow chart tracing how players earn and spend",
    body: "Follow the economy event by event, from first pickup to final purchase, and see which loops actually pay off.",
    title: "Understand how your players get rich",
  },
  {
    alt: "Movement heatmap highlighting the most-visited areas of a level",
    body: "Fog and voxel heatmaps light up the routes players love and the corners they never touch.",
    title: "Discover which areas players visit most",
  },
  {
    alt: "Dwell-time heatmap showing where players linger longest",
    body: "Dwell-time heatmaps show where attention pools and where players rush straight past.",
    title: "Track where players spend the most time",
  },
  {
    alt: "Session funnel showing where players drop off and quit",
    body: "Session funnels pin the exact moment interest drops, so you fix the leak instead of guessing at it.",
    title: "Identify where players drop off or quit",
  },
];

const ImproveStats = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleToggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index));
  };

  return (
    <section className="py-32">
      <div className="container">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-balance lg:text-5xl">
            Improve your games through statistics.
          </h2>
          <p className="mt-6 text-muted-foreground lg:text-lg">
            Every session leaves a trail. Open a question to see the view that
            answers it — all from your own data, on infrastructure you control.
          </p>
        </div>
        <div className="mx-auto max-w-2xl border-t border-border">
          {features.map((feature, index) => {
            const isOpen = openIndex === index;
            const panelId = `improve-panel-${index}`;
            const buttonId = `improve-trigger-${index}`;
            return (
              <div className="border-b border-border" key={feature.title}>
                <h3>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left text-lg font-medium text-foreground transition-colors hover:text-primary"
                    onClick={() => handleToggle(index)}
                  >
                    <span>{feature.title}</span>
                    <ChevronDown
                      className={cn(
                        "size-5 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180 text-primary"
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                {isOpen && (
                  <section
                    id={panelId}
                    aria-labelledby={buttonId}
                    className="pb-5 text-muted-foreground"
                  >
                    {feature.body}
                  </section>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export { ImproveStats };
