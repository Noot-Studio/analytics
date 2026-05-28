import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";
import { useState } from "react";

export interface EventRow {
  event_type: string;
  event_count: number;
  unique_players: number;
}

type SortKey = "event_type" | "event_count" | "unique_players";

export const EventsTable = ({ rows }: { rows: EventRow[] }) => {
  const [sortKey, setSortKey] = useState<SortKey>("event_count");
  const [descending, setDescending] = useState(true);

  const sorted = [...rows].toSorted((a, b) => {
    const result =
      sortKey === "event_type"
        ? a.event_type.localeCompare(b.event_type)
        : a[sortKey] - b[sortKey];
    return descending ? -result : result;
  });

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDescending((value) => !value);
    } else {
      setSortKey(key);
      setDescending(true);
    }
  };

  const headerLabel = (key: SortKey, label: string) =>
    key === sortKey ? `${label} ${descending ? "↓" : "↑"}` : label;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <button
              type="button"
              className="inline-flex cursor-pointer select-none items-center gap-1 hover:text-foreground"
              onClick={() => toggleSort("event_type")}
            >
              {headerLabel("event_type", "Event")}
            </button>
          </TableHead>
          <TableHead className="text-right">
            <button
              type="button"
              className="inline-flex cursor-pointer select-none items-center gap-1 hover:text-foreground"
              onClick={() => toggleSort("event_count")}
            >
              {headerLabel("event_count", "Count")}
            </button>
          </TableHead>
          <TableHead className="text-right">
            <button
              type="button"
              className="inline-flex cursor-pointer select-none items-center gap-1 hover:text-foreground"
              onClick={() => toggleSort("unique_players")}
            >
              {headerLabel("unique_players", "Unique players")}
            </button>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.event_type}>
            <TableCell className="font-medium">{row.event_type}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row.event_count.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.unique_players.toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
