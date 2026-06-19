import { DiscordIcon, GitHubIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { APP_URL, DISCORD_URL, DOCS_URL, GITHUB_URL } from "@/lib/site";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
];

const SiteHeader = () => (
  <header className="sticky top-0 z-50 border-border/60 border-b bg-background/70 backdrop-blur-xl">
    <div className="container flex h-16 items-center justify-between gap-6">
      <a className="flex shrink-0 items-center gap-2 font-semibold" href="/">
        <Logo className="size-7" />
        Noot Analytics
      </a>

      <nav className="hidden items-center gap-7 text-muted-foreground text-sm md:flex">
        {NAV_LINKS.map((link) => (
          <a
            className="transition-colors hover:text-foreground"
            href={link.href}
            key={link.href}
          >
            {link.label}
          </a>
        ))}
        <a
          className="transition-colors hover:text-foreground"
          href={DOCS_URL}
          rel="noopener"
          target="_blank"
        >
          Docs
        </a>
      </nav>

      <div className="flex items-center gap-1.5">
        <Button
          nativeButton={false}
          render={
            <a
              aria-label="Star Noot Analytics on GitHub"
              href={GITHUB_URL}
              rel="noopener"
              target="_blank"
            />
          }
          size="icon"
          variant="ghost"
        >
          <GitHubIcon className="size-4" />
        </Button>
        {DISCORD_URL && (
          <Button
            className="hidden sm:inline-flex"
            nativeButton={false}
            render={
              <a
                aria-label="Join our Discord"
                href={DISCORD_URL}
                rel="noopener"
                target="_blank"
              />
            }
            size="icon"
            variant="ghost"
          >
            <DiscordIcon className="size-4" />
          </Button>
        )}
        <Button
          className="hidden text-muted-foreground sm:inline-flex"
          nativeButton={false}
          render={
            <a
              aria-label="Sign in"
              href={APP_URL}
              rel="noopener"
              target="_blank"
            />
          }
          size="sm"
          variant="ghost"
        >
          Sign in
        </Button>
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
          size="sm"
        >
          Start free
        </Button>
      </div>
    </div>
  </header>
);

export { SiteHeader };
