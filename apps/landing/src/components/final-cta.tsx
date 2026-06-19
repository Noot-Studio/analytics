import { HeatField } from "@/components/heat-field";
import { DiscordIcon, GitHubIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { APP_URL, DISCORD_URL, GITHUB_URL } from "@/lib/site";

const FinalCta = () => (
  <section className="relative overflow-hidden">
    <HeatField className="opacity-40" />
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background/60 to-background" />

    <div className="container relative py-32 text-center lg:py-44">
      <Reveal className="mx-auto flex max-w-2xl flex-col items-center">
        <h2 className="text-balance font-bold text-4xl tracking-tight md:text-6xl">
          Start measuring your s&box game.
        </h2>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
          Self-host it, run it free in our cloud, or talk to us about tailored
          hosting. Either way, you keep your data.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button
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
          {DISCORD_URL && (
            <Button
              nativeButton={false}
              render={
                <a
                  aria-label="Join Discord"
                  href={DISCORD_URL}
                  rel="noopener"
                  target="_blank"
                />
              }
              size="lg"
              variant="ghost"
            >
              <DiscordIcon className="size-4" />
              Join Discord
            </Button>
          )}
        </div>
      </Reveal>
    </div>
  </section>
);

export { FinalCta };
