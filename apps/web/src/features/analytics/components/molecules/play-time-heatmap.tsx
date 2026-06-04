import { buildHeatmapGrid } from "../../lib/heatmap";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// One tick every 6 hours keeps the axis readable at 24 columns.
const HOUR_TICK_INTERVAL = 6;
const HOURS = 24;
const MIN_OPACITY = 0.1;
const OPACITY_RANGE = 0.9;

export interface HourGridCell {
  events: number;
  hour: number;
  weekday: number;
}

/**
 * Weekday × hour event-density grid: when this player actually plays. Mirrors
 * the project-wide heatmap on the Sessions page, scoped to one player.
 */
export const PlayTimeHeatmap = ({ cells }: { cells: HourGridCell[] }) => {
  const grid = buildHeatmapGrid(
    cells.map((cell) => ({
      hour: cell.hour,
      sessions: cell.events,
      weekday: cell.weekday,
    }))
  );

  return (
    <div className="flex flex-col gap-1">
      {grid.rows.map((row, rowIndex) => (
        <div className="flex items-center gap-1" key={row.weekday}>
          <span className="w-8 text-muted-foreground text-xs">
            {WEEKDAY_LABELS[rowIndex]}
          </span>
          <div className="flex gap-0.5">
            {row.cells.map((count, hour) => (
              <div
                className="h-3 w-3 rounded-[2px]"
                key={`${row.weekday}-${hour}`}
                style={{
                  backgroundColor: "var(--primary)",
                  opacity:
                    grid.max > 0
                      ? MIN_OPACITY + (count / grid.max) * OPACITY_RANGE
                      : MIN_OPACITY,
                }}
                title={`${WEEKDAY_LABELS[rowIndex]} ${hour}:00 — ${count} events`}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <span className="w-8" />
        <div className="flex gap-0.5">
          {Array.from({ length: HOURS }, (_, hour) => (
            <span
              className="w-3 text-muted-foreground text-xs"
              key={`tick-${hour}`}
            >
              {hour % HOUR_TICK_INTERVAL === 0 ? hour : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
