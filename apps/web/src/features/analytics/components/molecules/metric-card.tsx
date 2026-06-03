import { CountUpNumber } from "@sbox-analytics/ui/components/count-up-number";
import {
  Stat,
  StatDescription,
  StatLabel,
  StatValue,
} from "@sbox-analytics/ui/components/stat";

interface MetricCardProps {
  label: string;
  value?: number | string;
  format?: (value: number) => string;
  comingSoon?: boolean;
}

const MetricValue = ({
  value,
  format,
  comingSoon,
}: Pick<MetricCardProps, "value" | "format" | "comingSoon">) => {
  if (comingSoon) {
    return "Coming soon";
  }
  if (typeof value === "number") {
    return <CountUpNumber format={format} value={value} />;
  }
  return value;
};

export const MetricCard = ({
  label,
  value,
  format,
  comingSoon = false,
}: MetricCardProps) => (
  <Stat>
    <StatLabel>{label}</StatLabel>
    <StatValue>
      <MetricValue comingSoon={comingSoon} format={format} value={value} />
    </StatValue>
    {comingSoon ? (
      <StatDescription>Not enough data yet to compute this.</StatDescription>
    ) : null}
  </Stat>
);
