import { CountUpNumber } from "@sbox-analytics/ui/components/count-up-number";
import {
  Stat,
  StatLabel,
  StatTrend,
  StatValue,
} from "@sbox-analytics/ui/components/stat";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

type TrendDirection = "up" | "down" | "neutral";

export interface MetricTrend {
  direction: TrendDirection;
  label: string;
}

interface MetricCardProps {
  label: string;
  value?: number | string;
  format?: (value: number) => string;
  trend?: MetricTrend;
  className?: string;
}

const TREND_ICON: Record<TrendDirection, typeof ArrowUp> = {
  down: ArrowDown,
  neutral: Minus,
  up: ArrowUp,
};

const EMPTY_VALUE = "—";

const MetricValue = ({
  value,
  format,
}: Pick<MetricCardProps, "value" | "format">) => {
  if (typeof value === "number") {
    return <CountUpNumber format={format} value={value} />;
  }
  return value ?? EMPTY_VALUE;
};

export const MetricCard = ({
  label,
  value,
  format,
  trend,
  className,
}: MetricCardProps) => {
  const TrendIcon = trend ? TREND_ICON[trend.direction] : null;

  return (
    <Stat className={className}>
      <StatLabel>{label}</StatLabel>
      <StatValue>
        <MetricValue format={format} value={value} />
      </StatValue>
      {trend && TrendIcon ? (
        <StatTrend trend={trend.direction}>
          <TrendIcon />
          {trend.label}
        </StatTrend>
      ) : null}
    </Stat>
  );
};
