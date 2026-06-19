import { useEffect, useRef, useState } from "react";

import { OptimizedImage } from "@/components/optimized-image";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

import dwellHeatmapPicture from "../assets/dwell-heatmap.png?format=avif;webp&w=640;960;1280;1536&as=picture";

// The drop-in s&box components (real names + editor display names, see
// docs/agents/features.md). Adding these to a GameObject is the whole setup.
const COMPONENTS = [
  {
    desc: "Init, sessions, scenes, and connections.",
    name: "Session Helper",
    type: "AnalyticsComponent",
  },
  {
    desc: "Throttled position samples.",
    name: "Movement Tracker",
    type: "AnalyticsMovementComponent",
  },
  {
    desc: "Per-cell dwell time.",
    name: "Dwell",
    type: "AnalyticsDwellComponent",
  },
  {
    desc: "Movement density.",
    name: "Heatmap",
    type: "AnalyticsHeatmapComponent",
  },
  {
    desc: "RDP-simplified player paths.",
    name: "Trajectory",
    type: "AnalyticsTrajectoryComponent",
  },
];

type StepKey = "project" | "components" | "track";

interface Step {
  key: StepKey;
  heading: string;
  body: string;
}

const STEPS: Step[] = [
  {
    body: "Sign up, create a project, and copy your publishable and secret keys. That is the only step that touches a dashboard.",
    heading: "Create a project.",
    key: "project",
  },
  {
    body: "Drop the analytics components onto your GameObjects in the s&box editor. Sessions, movement, dwell, density, and trajectories all track themselves.",
    heading: "Add the components.",
    key: "components",
  },
  {
    body: "Events stream in within five seconds. Dwell and density roll up into a heatmap rendered as a fog volume right inside the editor.",
    heading: "Track, then read your map.",
    key: "track",
  },
];

const ProjectVisual = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "flex flex-col justify-center rounded-xl border border-border/80 bg-card p-7 shadow-2xl shadow-black/30",
      className
    )}
  >
    <span className="font-mono text-muted-foreground text-xs">
      project created
    </span>
    <p className="mt-4 font-semibold text-lg">Demo Studio</p>
    <div className="mt-6 flex flex-col gap-4">
      <div>
        <span className="text-muted-foreground text-xs">Publishable key</span>
        <p className="mt-1 truncate rounded-md border border-border/60 bg-background/60 px-3 py-2 font-mono text-foreground text-sm">
          pk_live_xxxxxxxx
        </p>
      </div>
      <div>
        <span className="text-muted-foreground text-xs">Secret key</span>
        <p className="mt-1 truncate rounded-md border border-border/60 bg-background/60 px-3 py-2 font-mono text-muted-foreground text-sm">
          sk_live_••••••••••••
        </p>
      </div>
    </div>
  </div>
);

const ComponentsVisual = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "flex flex-col justify-center rounded-xl border border-border/80 bg-card p-6 shadow-2xl shadow-black/30",
      className
    )}
  >
    <span className="font-mono text-muted-foreground text-xs">
      add component
    </span>
    <ul className="mt-5 flex flex-col gap-3">
      {COMPONENTS.map((component) => (
        <li
          className="rounded-lg border border-border/60 bg-background/60 px-4 py-3"
          key={component.type}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-sm">{component.name}</span>
            <span className="truncate font-mono text-muted-foreground text-xs">
              {component.type}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">{component.desc}</p>
        </li>
      ))}
    </ul>
  </div>
);

// fill = true stretches the image to the sticky panel height (object-cover, so
// width stays the column width and never bleeds into the text). fill = false is
// the mobile inline case: natural aspect, full column width.
const HeatmapVisual = ({ fill }: { fill: boolean }) => (
  <div
    className={cn(
      "relative overflow-hidden rounded-xl border border-border/80 shadow-2xl shadow-black/50",
      fill && "h-full"
    )}
  >
    <OptimizedImage
      alt="A city map in the s&box editor overlaid with a purple-to-orange dwell heatmap and player position markers"
      className={cn(
        "w-full object-cover",
        fill ? "absolute inset-0 h-full" : "h-auto"
      )}
      picture={dwellHeatmapPicture}
      sizes="(min-width: 1024px) 580px, 100vw"
    />
  </div>
);

const StepVisual = ({
  step,
  fill = false,
}: {
  step: StepKey;
  fill?: boolean;
}) => {
  const fillClass = fill ? "h-full" : undefined;
  if (step === "project") {
    return <ProjectVisual className={fillClass} />;
  }
  if (step === "components") {
    return <ComponentsVisual className={fillClass} />;
  }
  return <HeatmapVisual fill={fill} />;
};

const HowItWorks = () => {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Drive the active step from scroll position with one IntersectionObserver
  // (no scroll listeners). The observed step nearest the viewport middle wins.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.step));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    for (const el of stepRefs.current) {
      if (el) {
        observer.observe(el);
      }
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-32 lg:py-44" id="how-it-works">
      <div className="container">
        <Reveal className="max-w-2xl">
          <h2 className="text-balance font-bold text-4xl tracking-tight md:text-5xl">
            From a fresh project to a live heatmap.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            No SDK to wire up by hand. Create a project, drop in the components,
            and the data shows up as dashboards and in-editor visualizers.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-10 lg:mt-24 lg:grid-cols-2 lg:gap-20">
          {/* Sticky visual (desktop): crossfades to the active step's panel. */}
          <div className="hidden min-w-0 lg:block">
            <div className="sticky top-24 h-[70vh]">
              <div className="relative h-full overflow-hidden">
                {STEPS.map((step, index) => (
                  <div
                    aria-hidden={active !== index}
                    className={cn(
                      "step-fade absolute inset-0",
                      active === index ? "opacity-100" : "opacity-0"
                    )}
                    key={step.key}
                  >
                    <StepVisual fill step={step.key} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Steps scroll past; each advances the sticky visual. On mobile the
              visual renders inline under its step instead. */}
          <ol className="flex min-w-0 flex-col">
            {STEPS.map((step, index) => (
              <li
                className="flex flex-col justify-center py-8 lg:min-h-[80vh] lg:py-0"
                data-step={index}
                key={step.key}
                ref={(el) => {
                  stepRefs.current[index] = el;
                }}
              >
                <span
                  className={cn(
                    "font-mono text-5xl transition-colors duration-300",
                    active === index
                      ? "text-primary"
                      : "text-muted-foreground/30"
                  )}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-5 text-balance font-bold text-3xl tracking-tight md:text-4xl">
                  {step.heading}
                </h3>
                <p className="mt-4 max-w-md text-lg text-muted-foreground leading-relaxed">
                  {step.body}
                </p>
                <div className="mt-8 lg:hidden">
                  <StepVisual step={step.key} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
};

export { HowItWorks };
