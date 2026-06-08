const DEFAULT_BADGE_SRC = "https://hoppscotch.suiram.dev/badge.svg";
/** Sentinel used in docs to mark a button that still needs a real share link. */
const PLACEHOLDER = "REPLACE_WITH_HOPPSCOTCH_SHARE_URL";

interface HoppscotchProps {
  /**
   * The Hoppscotch share link for the request, produced by "Share request →
   * copy link" (looks like `https://hoppscotch.suiram.dev/r/<shortcode>`).
   * Opens the request in Hoppscotch in a new tab.
   */
  runUrl: string;
  /** Accessible label for the button. */
  title: string;
  /** Source of the "Run in Hoppscotch" badge image. */
  badgeSrc?: string;
}

/**
 * Renders a "Run in Hoppscotch" badge button that opens a shared request in
 * Hoppscotch. Create the share link in Hoppscotch (Share → copy link), then
 * pass it as `runUrl`.
 */
export const Hoppscotch = ({
  runUrl,
  title,
  badgeSrc = DEFAULT_BADGE_SRC,
}: HoppscotchProps) => {
  if (!runUrl || runUrl === PLACEHOLDER) {
    return (
      <div className="rounded-lg border border-dashed border-fd-border bg-fd-muted/40 p-4 text-fd-muted-foreground text-sm">
        Interactive request unavailable — set <code>runUrl</code> on the{" "}
        <code>&lt;Hoppscotch /&gt;</code> component.
      </div>
    );
  }

  return (
    <a
      className="inline-flex"
      href={runUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      {/* biome-ignore lint/performance/noImgElement: external badge served by Hoppscotch, not a local asset */}
      <img alt={title} className="my-0 h-8 w-auto" src={badgeSrc} />
    </a>
  );
};
