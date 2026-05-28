import { Badge } from "@sbox-analytics/ui/components/badge";

export type SdkStatus = "no-key" | "awaiting" | "connected";

const STATUS_CONFIG: Record<
  SdkStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  awaiting: { label: "Awaiting data", variant: "outline" },
  connected: { label: "Connected", variant: "default" },
  "no-key": { label: "No API key", variant: "secondary" },
};

export const SdkStatusBadge = ({ status }: { status: SdkStatus }) => {
  const { label, variant } = STATUS_CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
};
