import { cn } from "@/lib/utils";

interface HeatFieldProps {
  className?: string;
}

// The product's dwell-heatmap colormap (violet → magenta → orange → brand red)
// rendered as three soft, slowly drifting blobs. Purely decorative and
// non-interactive; the drift stops under prefers-reduced-motion (see index.css).
const HeatField = ({ className }: HeatFieldProps) => (
  <div
    aria-hidden="true"
    className={cn(
      "pointer-events-none absolute inset-0 overflow-hidden",
      className
    )}
  >
    <div className="heat-blob heat-blob--violet absolute -top-32 left-[6%] size-[34rem] opacity-40" />
    <div className="heat-blob heat-blob--magenta absolute -top-40 left-[32%] size-[32rem] opacity-35" />
    <div className="heat-blob heat-blob--orange absolute -top-24 right-[4%] size-[36rem] opacity-30" />
  </div>
);

export { HeatField };
