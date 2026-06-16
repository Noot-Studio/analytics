import { Logo } from "@/components/logo";
import { DISCORD_URL, DOCS_URL, GITHUB_URL } from "@/lib/site";

const SiteFooter = () => (
  <footer className="border-t border-border/60 py-12">
    <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
      <div className="flex items-center gap-2">
        <Logo className="size-6" />
        <span className="font-medium text-foreground">Noot Analytics</span>
        <span className="hidden sm:inline">
          — open-source analytics for s&box games.
        </span>
      </div>
      <nav className="flex items-center gap-6">
        {DISCORD_URL && (
          <a
            className="transition-colors hover:text-foreground"
            href={DISCORD_URL}
            rel="noopener"
            target="_blank"
          >
            Discord
          </a>
        )}
        <a
          className="transition-colors hover:text-foreground"
          href={GITHUB_URL}
          rel="noopener"
          target="_blank"
        >
          GitHub
        </a>
        <a
          className="transition-colors hover:text-foreground"
          href={DOCS_URL}
          rel="noopener"
          target="_blank"
        >
          Docs
        </a>
      </nav>
    </div>
  </footer>
);

export { SiteFooter };
