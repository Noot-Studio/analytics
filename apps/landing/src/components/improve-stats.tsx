import { OptimizedImage } from "@/components/optimized-image";

import dwellHeatmapPicture from "../assets/dwell-heatmap.png?format=avif;webp&w=640;960;1280;1536&as=picture";

const ImproveStats = () => (
  <section className="py-32">
    <div className="container">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <OptimizedImage
          picture={dwellHeatmapPicture}
          alt="In-editor dwell-time heatmap showing where players linger longest on a map"
          sizes="(min-width: 1024px) 580px, 100vw"
          className="aspect-video w-full rounded-md border border-border object-cover object-top"
        />
        <div className="max-w-xl">
          <h2 className="text-4xl font-semibold tracking-tight text-balance lg:text-5xl">
            Improve your games through statistics.
          </h2>
          <p className="mt-6 text-muted-foreground lg:text-lg">
            See player behaviour rendered straight into the s&amp;box editor.
            Dwell-time heatmaps light up where attention pools and where players
            rush straight past, so you tune your maps from your own data, not
            guesswork.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export { ImproveStats };
