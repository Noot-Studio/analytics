const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export const formatRelativeTime = (date: Date | string | null): string => {
  if (!date) {
    return "—";
  }
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < SECONDS_PER_MINUTE) {
    return "just now";
  }
  if (seconds < SECONDS_PER_HOUR) {
    return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ago`;
  }
  if (seconds < SECONDS_PER_DAY) {
    return `${Math.floor(seconds / SECONDS_PER_HOUR)}h ago`;
  }
  return `${Math.floor(seconds / SECONDS_PER_DAY)}d ago`;
};

export const RelativeTime = ({ date }: { date: Date | string | null }) => (
  <span>{formatRelativeTime(date)}</span>
);
