import { GitHubIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "@/lib/site";

const POINTS = [
  {
    body: "Every line is open, from event ingestion to dashboards.",
    title: "MIT licensed",
  },
  {
    body: "Postgres, ClickHouse, and Redpanda, running on your own servers.",
    title: "Your infrastructure",
  },
  {
    body: "Unlimited events, projects, and data retention. No usage meter.",
    title: "No limits",
  },
];

const OpenSourceBand = () => (
  <section className="bg-card/30">
    <div className="container py-20">
      <Reveal className="flex flex-col gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-20">
        <div className="max-w-md">
          <h2 className="font-semibold text-2xl tracking-tight md:text-3xl">
            Run the whole thing yourself.
          </h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Deploy the full stack with one Docker Compose file, run it on
            hardware you control, and keep every event.
          </p>
          <Button
            className="mt-6"
            nativeButton={false}
            render={
              <a
                aria-label="View on GitHub"
                href={GITHUB_URL}
                rel="noopener"
                target="_blank"
              />
            }
            variant="outline"
          >
            <GitHubIcon className="size-4" />
            View on GitHub
          </Button>
        </div>

        <dl className="grid flex-1 gap-x-8 gap-y-8 sm:grid-cols-3 lg:max-w-2xl">
          {POINTS.map((point) => (
            <div key={point.title}>
              <dt className="font-semibold text-sm">{point.title}</dt>
              <dd className="mt-2 text-muted-foreground text-sm leading-relaxed">
                {point.body}
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </div>
  </section>
);

export { OpenSourceBand };
