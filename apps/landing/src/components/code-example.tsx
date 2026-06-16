import { useEffect, useState } from "react";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const CODE = `using Noot.Analytics;
using Sandbox;

public sealed class Player : Component
{
    protected override void OnStart()
    {
        // One call, once — every event flows through one sender.
        Analytics.Init( "pk_live_xxxxxxxx" );
    }

    // Tag a hook you already have — it fires on every call,
    // capturing the method arguments as event properties.
    [Track( "level_complete", Params = true )]
    public void CompleteLevel( string map, int seconds ) { }

    // ...or fire one by hand, with a position for heatmaps.
    void OnKilled( DamageInfo hit ) =>
        Analytics.Track( "player_death",
            new { weapon = hit.Weapon },
            position: Transform.Position );
}`;

const THEME = "github-dark-default";

// Highlight once, lazily — the grammar and theme load as async chunks the
// first time this section mounts, off the page's critical path.
let highlightPromise: Promise<string> | null = null;

const createHighlightedHtml = async (): Promise<string> => {
  const highlighter = await createHighlighterCore({
    engine: createJavaScriptRegexEngine({ forgiving: true }),
    langs: [import("@shikijs/langs/csharp")],
    themes: [import("@shikijs/themes/github-dark-default")],
  });

  return highlighter.codeToHtml(CODE, { lang: "csharp", theme: THEME });
};

const highlight = (): Promise<string> => {
  highlightPromise ??= createHighlightedHtml();
  return highlightPromise;
};

const CodeExample = () => {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const html = await highlight();
      if (active) {
        setHighlighted(html);
      }
    };
    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="py-32">
      <div className="container">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <h2 className="mb-6 text-4xl font-semibold tracking-tight text-balance lg:text-5xl">
              Plug it into the hooks you already have
            </h2>
            <p className="mb-8 max-w-xl text-muted-foreground lg:text-lg">
              One{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
                Analytics.Init
              </code>{" "}
              wires up the buffered, batched sender. After that, drop a{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
                [Track]
              </code>{" "}
              attribute on a method you already call, or fire{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
                Analytics.Track
              </code>{" "}
              by hand. Events queue and ship on their own.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="size-3 rounded-full bg-destructive/70" />
              <span className="size-3 rounded-full bg-muted-foreground/40" />
              <span className="size-3 rounded-full bg-muted-foreground/30" />
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                Player.cs
              </span>
            </div>
            {highlighted ? (
              <div
                className="text-sm leading-relaxed [&_code]:font-mono [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:bg-transparent! [&_pre]:p-4"
                // Shiki returns ready-to-render highlighted markup; this is the
                // standard way to mount it.
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            ) : (
              <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
                <code className="font-mono text-muted-foreground">{CODE}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export { CodeExample };
