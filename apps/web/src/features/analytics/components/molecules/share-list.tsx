const PERCENT = 100;

export interface ShareListItem {
  /** Stable key for the row. */
  key: string;
  label: string;
  /** Drives the proportion bar; rows are shown as given (pre-sorted). */
  value: number;
  /** Right-aligned value text, e.g. "1,204" or "3 sessions". */
  valueLabel: string;
  /** Optional secondary text under the label, e.g. total playtime. */
  detail?: string;
}

/**
 * Label + proportion-bar rows scaled to the largest value. Shared by the
 * profile's event breakdown and map distribution panels.
 */
export const ShareList = ({ items }: { items: ShareListItem[] }) => {
  const max = Math.max(0, ...items.map((item) => item.value));

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li className="flex flex-col gap-1" key={item.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {item.valueLabel}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${max > 0 ? (item.value / max) * PERCENT : 0}%`,
              }}
            />
          </div>
          {item.detail ? (
            <span className="text-muted-foreground text-xs">{item.detail}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
};
