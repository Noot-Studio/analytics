import {
  Banner,
  BannerContent,
  BannerDescription,
  BannerIcon,
  BannerTitle,
} from "@sbox-analytics/ui/components/banner";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";

import { orpc } from "@/utils/orpc";

// Past this share of the monthly quota the banner escalates to a warning.
const WARNING_THRESHOLD = 0.8;

const SELF_HOST_HINT =
  "Self-host for unlimited events, or contact us for a custom plan with higher limits.";

// Cloud free-plan usage banner: shows this month's ingested-event usage
// against the org's quota and points at the two ways out of it (self-hosting
// or a custom plan). Renders nothing on self-hosted deployments (billing
// disabled) and for custom-plan orgs, who already have negotiated limits
// (docs/adr/0002).
export const UsageBanner = () => {
  const usageQuery = useQuery(orpc.usage.current.queryOptions());

  const usage = usageQuery.data;
  if (
    !usage?.billingEnabled ||
    usage.plan === "Custom" ||
    usage.limit === null
  ) {
    return null;
  }

  const { used, limit } = usage;
  const usageText = `${used.toLocaleString()} of ${limit.toLocaleString()} events used this month.`;

  if (used >= limit) {
    return (
      <Banner dismissible={false} variant="destructive">
        <BannerIcon>
          <CircleAlert />
        </BannerIcon>
        <BannerContent>
          <BannerTitle>Monthly event limit reached</BannerTitle>
          <BannerDescription>
            {usageText} New events are being dropped until next month.{" "}
            {SELF_HOST_HINT}
          </BannerDescription>
        </BannerContent>
      </Banner>
    );
  }

  if (used >= limit * WARNING_THRESHOLD) {
    return (
      <Banner variant="warning">
        <BannerIcon>
          <TriangleAlert />
        </BannerIcon>
        <BannerContent>
          <BannerTitle>Approaching your monthly event limit</BannerTitle>
          <BannerDescription>
            {usageText} Events past the limit are dropped. {SELF_HOST_HINT}
          </BannerDescription>
        </BannerContent>
      </Banner>
    );
  }

  return (
    <Banner variant="info">
      <BannerIcon>
        <Info />
      </BannerIcon>
      <BannerContent>
        <BannerDescription>
          Free plan — {usageText} {SELF_HOST_HINT}
        </BannerDescription>
      </BannerContent>
    </Banner>
  );
};
