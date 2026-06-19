import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { DOCS_URL } from "@/lib/site";

const DocsCta = () => (
  <section className="py-16 lg:py-20">
    <div className="container">
      <Reveal>
        <div className="flex flex-col gap-6 rounded-2xl border border-border/70 bg-card/40 p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="max-w-xl">
            <h2 className="font-semibold text-2xl tracking-tight md:text-3xl">
              Track your own custom events.
            </h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              The drop-in components cover the common cases. For everything
              else, Analytics.Track sends any event you define. The docs walk
              through custom events, the full SDK reference, and self-hosting.
            </p>
          </div>
          <Button
            className="shrink-0"
            nativeButton={false}
            render={
              <a
                aria-label="Read the docs"
                href={DOCS_URL}
                rel="noopener"
                target="_blank"
              />
            }
            size="lg"
            variant="outline"
          >
            Read the docs
          </Button>
        </div>
      </Reveal>
    </div>
  </section>
);

export { DocsCta };
