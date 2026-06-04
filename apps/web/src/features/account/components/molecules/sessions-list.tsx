import { Badge } from "@sbox-analytics/ui/components/badge";
import { Button } from "@sbox-analytics/ui/components/button";

import { formatDate } from "@/lib/format";

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/edg(?:e|a|ios)?\//iu, "Edge"],
  [/opr\/|opera/iu, "Opera"],
  [/firefox|fxios/iu, "Firefox"],
  [/chrome|crios/iu, "Chrome"],
  [/safari/iu, "Safari"],
];

const OS_PATTERNS: [RegExp, string][] = [
  [/windows/iu, "Windows"],
  [/iphone|ipad|ios/iu, "iOS"],
  [/android/iu, "Android"],
  [/mac os|macintosh/iu, "macOS"],
  [/linux/iu, "Linux"],
];

const describeUserAgent = (userAgent: string | null | undefined) => {
  if (!userAgent) {
    return "Unknown device";
  }
  const browser = BROWSER_PATTERNS.find(([pattern]) =>
    pattern.test(userAgent)
  )?.[1];
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && os) {
    return `${browser} on ${os}`;
  }
  return browser ?? os ?? "Unknown device";
};

export interface UserSession {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
}

interface SessionsListProps {
  sessions: UserSession[];
  currentToken: string;
  onRevoke: (token: string) => void;
  revokePending: boolean;
}

export const SessionsList = ({
  sessions,
  currentToken,
  onRevoke,
  revokePending,
}: SessionsListProps) => (
  <ul className="flex max-w-lg flex-col divide-y divide-border rounded-lg border border-border">
    {sessions.map((session) => {
      const isCurrent = session.token === currentToken;
      return (
        <li
          className="flex items-center justify-between gap-4 p-4"
          key={session.id}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {describeUserAgent(session.userAgent)}
              </span>
              {isCurrent && <Badge variant="secondary">This device</Badge>}
            </div>
            <span className="text-muted-foreground text-xs">
              {session.ipAddress ? `${session.ipAddress} · ` : ""}
              Signed in {formatDate(session.createdAt)}
            </span>
          </div>
          {!isCurrent && (
            <Button
              disabled={revokePending}
              onClick={() => onRevoke(session.token)}
              size="sm"
              variant="outline"
            >
              Revoke
            </Button>
          )}
        </li>
      );
    })}
  </ul>
);
