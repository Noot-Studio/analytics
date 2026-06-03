import { Link, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";

const EMPTY_VALUE = "—";

/**
 * Renders a session_id as a link to its detail page. Reads projectId from the
 * active route so callers (table cells, session histories) don't thread it.
 */
export const SessionLink = ({
  sessionId,
  children,
}: {
  sessionId: string;
  children?: ReactNode;
}) => {
  const { projectId } = useParams({ strict: false });

  if (!(sessionId && projectId)) {
    return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
  }

  return (
    <Link
      className="break-all underline underline-offset-4 hover:text-foreground"
      params={{ projectId, sessionId }}
      to="/dashboard/projects/$projectId/sessions/$sessionId"
    >
      {children ?? sessionId}
    </Link>
  );
};
