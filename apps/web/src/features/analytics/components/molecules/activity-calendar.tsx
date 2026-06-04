const WEEKS = 12;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;
const MIN_OPACITY = 0.15;
const OPACITY_RANGE = 0.85;
// Rows for Mon/Wed/Fri labels (GitHub-calendar convention).
const LABELED_ROWS: Record<number, string> = { 0: "Mon", 2: "Wed", 4: "Fri" };
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface ActivityDay {
  day: string;
  events: number;
  sessions: number;
}

interface CalendarCell {
  day: string;
  events: number;
  sessions: number;
  inWindow: boolean;
}

interface CalendarWeek {
  cells: CalendarCell[];
  monthLabel: string | null;
  start: string;
}

const toIsoDay = (ms: number) =>
  new Date(ms).toISOString().slice(0, ISO_DATE_LENGTH);

// Monday-aligned grid of the last 12 weeks, ending with the week containing
// `today`. Days after `today` are rendered as out-of-window placeholders.
const buildWeeks = (activity: ActivityDay[], today: Date): CalendarWeek[] => {
  const byDay = new Map(activity.map((entry) => [entry.day, entry]));
  const todayMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  // getUTCDay(): 0=Sun..6=Sat → days since Monday.
  const daysSinceMonday = (new Date(todayMs).getUTCDay() + 6) % DAYS_PER_WEEK;
  const gridStartMs =
    todayMs -
    daysSinceMonday * MS_PER_DAY -
    (WEEKS - 1) * DAYS_PER_WEEK * MS_PER_DAY;

  const weeks: CalendarWeek[] = [];
  let previousMonth = -1;
  for (let w = 0; w < WEEKS; w += 1) {
    const weekStartMs = gridStartMs + w * DAYS_PER_WEEK * MS_PER_DAY;
    const month = new Date(weekStartMs).getUTCMonth();
    const monthLabel = month === previousMonth ? null : MONTH_LABELS[month];
    previousMonth = month;

    const cells: CalendarCell[] = [];
    for (let d = 0; d < DAYS_PER_WEEK; d += 1) {
      const cellMs = weekStartMs + d * MS_PER_DAY;
      const day = toIsoDay(cellMs);
      const entry = byDay.get(day);
      cells.push({
        day,
        events: entry?.events ?? 0,
        inWindow: cellMs <= todayMs,
        sessions: entry?.sessions ?? 0,
      });
    }
    weeks.push({ cells, monthLabel, start: toIsoDay(weekStartMs) });
  }
  return weeks;
};

const cellTitle = (cell: CalendarCell) =>
  cell.events > 0
    ? `${cell.day} — ${cell.events.toLocaleString()} events, ${cell.sessions.toLocaleString()} sessions`
    : `${cell.day} — no activity`;

/**
 * GitHub-style daily activity calendar: one column per week, Monday-first
 * rows, cell intensity scaled to the player's busiest day.
 */
export const ActivityCalendar = ({ activity }: { activity: ActivityDay[] }) => {
  const weeks = buildWeeks(activity, new Date());
  const max = Math.max(0, ...activity.map((entry) => entry.events));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1 pl-9">
        {weeks.map((week) => (
          <span
            className="w-3 text-muted-foreground text-xs"
            key={`label-${week.start}`}
          >
            {week.monthLabel}
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <div className="flex w-8 flex-col gap-1">
          {Array.from({ length: DAYS_PER_WEEK }, (_, row) => (
            <span
              className="h-3 text-muted-foreground text-xs leading-3"
              key={`weekday-${row}`}
            >
              {LABELED_ROWS[row] ?? ""}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div className="flex flex-col gap-1" key={week.start}>
            {week.cells.map((cell) => {
              if (!cell.inWindow) {
                return <div className="h-3 w-3" key={cell.day} />;
              }
              if (cell.events === 0) {
                return (
                  <div
                    className="h-3 w-3 rounded-[2px] bg-muted"
                    key={cell.day}
                    title={cellTitle(cell)}
                  />
                );
              }
              return (
                <div
                  className="h-3 w-3 rounded-[2px]"
                  key={cell.day}
                  style={{
                    backgroundColor: "var(--primary)",
                    opacity:
                      max > 0
                        ? MIN_OPACITY + (cell.events / max) * OPACITY_RANGE
                        : MIN_OPACITY,
                  }}
                  title={cellTitle(cell)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
