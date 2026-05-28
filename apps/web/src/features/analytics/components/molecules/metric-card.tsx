import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sbox-analytics/ui/components/card";

export const MetricCard = ({
  label,
  value,
  comingSoon = false,
}: {
  label: string;
  value?: string | number;
  comingSoon?: boolean;
}) => (
  <Card>
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className="text-2xl tabular-nums">
        {comingSoon ? "Coming soon" : value}
      </CardTitle>
    </CardHeader>
    {comingSoon ? (
      <CardContent className="text-xs text-muted-foreground">
        Not enough data yet to compute this.
      </CardContent>
    ) : null}
  </Card>
);
