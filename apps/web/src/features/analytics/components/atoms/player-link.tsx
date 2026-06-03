import { Link, useParams } from "@tanstack/react-router";

const EMPTY_VALUE = "—";

/**
 * Renders a player_id as a link to its detail page. Reads projectId from the
 * active route so callers (table cells, timelines) don't have to thread it.
 * Anonymous activity (empty player_id) renders as muted, non-clickable text.
 */
export const PlayerLink = ({ playerId }: { playerId: string }) => {
  const { projectId } = useParams({ strict: false });

  if (!(playerId && projectId)) {
    return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
  }

  return (
    <Link
      className="break-all underline underline-offset-4 hover:text-foreground"
      params={{ playerId, projectId }}
      to="/dashboard/projects/$projectId/players/$playerId"
    >
      {playerId}
    </Link>
  );
};
