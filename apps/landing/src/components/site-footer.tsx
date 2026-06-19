import { DiscordIcon, GitHubIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { DISCORD_URL, DOCS_URL, GITHUB_URL } from "@/lib/site";

const PRODUCT_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
];

const SiteFooter = () => (
  <footer className="bg-card/30">
    <div className="container py-20">
      <div className="flex flex-col justify-between gap-10 md:flex-row">
        <div className="max-w-xs">
          <a className="flex items-center gap-2 font-semibold" href="/">
            <Logo className="size-6" />
            Noot Analytics
          </a>
          <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
            Open-source, real-time analytics built for s&box developers, not
            marketers.
          </p>
        </div>

        <nav className="flex gap-16">
          <div className="flex flex-col gap-3 text-sm">
            <span className="font-medium text-foreground">Product</span>
            {PRODUCT_LINKS.map((link) => (
              <a
                className="text-muted-foreground transition-colors hover:text-foreground"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <span className="font-medium text-foreground">Resources</span>
            <a
              className="text-muted-foreground transition-colors hover:text-foreground"
              href={DOCS_URL}
              rel="noopener"
              target="_blank"
            >
              Docs
            </a>
            <a
              className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
              href={GITHUB_URL}
              rel="noopener"
              target="_blank"
            >
              <GitHubIcon className="size-3.5" />
              GitHub
            </a>
            {DISCORD_URL && (
              <a
                className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                href={DISCORD_URL}
                rel="noopener"
                target="_blank"
              >
                <DiscordIcon className="size-3.5" />
                Discord
              </a>
            )}
          </div>
        </nav>
      </div>

      <div className="mt-12 flex flex-col items-center justify-between gap-3 text-muted-foreground text-sm sm:flex-row">
        <span>Noot Analytics. MIT licensed.</span>
        <span>Built for s&box.</span>
      </div>
    </div>
  </footer>
);

export { SiteFooter };
