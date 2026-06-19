import { HeatField } from "@/components/heat-field";
import { GitHubIcon } from "@/components/icons";
import { OptimizedImage } from "@/components/optimized-image";
import { Button } from "@/components/ui/button";
import { APP_URL, GITHUB_URL } from "@/lib/site";

import heatmapPicture from "../assets/dwell-heatmap.png?format=avif;webp&w=640;960;1280;1536&as=picture";

const Hero = () => (
  <section className="relative isolate flex min-h-[88vh] items-center overflow-hidden">
    {/* Hero backdrop: a real s&box world with the dwell heatmap baked in — the
        game and the analytics in one frame — sitting behind the copy the way
        sbox.game and facepunch.com lead with a scene. Kept at z-0 (not negative,
        which would fall behind the page background); the section is isolated so
        the content layer at z-10 stays on top. */}
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <OptimizedImage
        alt=""
        className="absolute inset-0 size-full scale-110 object-cover object-center opacity-70"
        loading="eager"
        picture={heatmapPicture}
        sizes="100vw"
      />
      {/* Left-weighted scrim keeps the copy legible while the right of the scene
          stays visible; bottom fade blends it into the page. */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/55 to-background/15" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      <HeatField className="opacity-20" />
    </div>

    <div className="container relative z-10 py-24">
      <div className="flex max-w-3xl flex-col items-start">
        <span
          className="rise inline-flex items-center rounded-full border border-border/70 bg-card/60 px-3 py-1 font-medium text-muted-foreground text-xs backdrop-blur"
          style={{ animationDelay: "0ms" }}
        >
          Open source, MIT licensed
        </span>

        <h1
          className="rise mt-6 max-w-2xl text-balance font-bold text-5xl leading-[1.03] tracking-tight md:text-6xl lg:text-7xl"
          style={{ animationDelay: "70ms" }}
        >
          See every death, drop, and detour.
        </h1>

        <p
          className="rise mt-6 max-w-xl text-balance text-lg text-muted-foreground leading-relaxed"
          style={{ animationDelay: "140ms" }}
        >
          Open-source, real-time analytics for s&box games. Track any event,
          then explore it in dashboards and right inside the editor.
        </p>

        <div
          className="rise mt-9 flex w-full flex-col gap-3 sm:flex-row sm:items-center"
          style={{ animationDelay: "210ms" }}
        >
          <Button
            className="w-full sm:w-auto"
            nativeButton={false}
            render={
              <a
                aria-label="Start free"
                href={APP_URL}
                rel="noopener"
                target="_blank"
              />
            }
            size="lg"
          >
            Start free
          </Button>
          <Button
            className="w-full sm:w-auto"
            nativeButton={false}
            render={
              <a
                aria-label="View on GitHub"
                href={GITHUB_URL}
                rel="noopener"
                target="_blank"
              />
            }
            size="lg"
            variant="outline"
          >
            <GitHubIcon className="size-4" />
            View on GitHub
          </Button>
        </div>
      </div>
    </div>
  </section>
);

export { Hero };
