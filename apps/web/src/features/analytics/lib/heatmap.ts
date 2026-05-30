export interface HeatmapCell {
  weekday: number;
  hour: number;
  sessions: number;
}

export interface HeatmapGrid {
  rows: { weekday: number; cells: number[] }[];
  max: number;
}

const DAYS = 7;
const HOURS = 24;

// weekday is 1=Mon..7=Sun (ClickHouse toDayOfWeek); row index = weekday - 1.
export const buildHeatmapGrid = (cells: HeatmapCell[]): HeatmapGrid => {
  const rows = Array.from({ length: DAYS }, (_, dayIndex) => ({
    cells: Array.from({ length: HOURS }, () => 0),
    weekday: dayIndex + 1,
  }));

  let max = 0;
  for (const cell of cells) {
    const dayIndex = cell.weekday - 1;
    const isValid =
      dayIndex >= 0 && dayIndex < DAYS && cell.hour >= 0 && cell.hour < HOURS;
    if (!isValid) {
      continue;
    }
    rows[dayIndex].cells[cell.hour] = cell.sessions;
    if (cell.sessions > max) {
      max = cell.sessions;
    }
  }

  return { max, rows };
};
