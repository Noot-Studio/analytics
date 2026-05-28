import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";

export interface LiveEventRow {
  event_type: string;
  timestamp: string;
  session_id: string;
  player_id: string;
  properties: string;
}

export const LiveEventsTable = ({ rows }: { rows: LiveEventRow[] }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Time</TableHead>
        <TableHead>Event</TableHead>
        <TableHead>Player</TableHead>
        <TableHead>Session</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row, index) => (
        <TableRow
          key={`${row.timestamp}-${row.session_id}-${row.event_type}-${index}`}
        >
          <TableCell className="whitespace-nowrap tabular-nums">
            {row.timestamp}
          </TableCell>
          <TableCell className="font-medium">{row.event_type}</TableCell>
          <TableCell className="text-muted-foreground">
            {row.player_id}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {row.session_id}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
