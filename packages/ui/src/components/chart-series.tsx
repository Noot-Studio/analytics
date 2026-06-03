import type { ComponentProps } from "react";
import {
  Area as RechartsArea,
  Bar as RechartsBar,
  Line as RechartsLine,
} from "recharts";

interface Animated {
  /** Opt in to the recharts draw animation. Off by default. */
  animated?: boolean;
}

/**
 * Recharts series wrappers that default `isAnimationActive` to false. Pass
 * `animated` to opt a single series back into the draw animation.
 */
export const Area = ({
  animated = false,
  ...props
}: ComponentProps<typeof RechartsArea> & Animated) => (
  <RechartsArea {...props} isAnimationActive={animated} />
);

export const Bar = ({
  animated = false,
  ...props
}: ComponentProps<typeof RechartsBar> & Animated) => (
  <RechartsBar {...props} isAnimationActive={animated} />
);

export const Line = ({
  animated = false,
  ...props
}: ComponentProps<typeof RechartsLine> & Animated) => (
  <RechartsLine {...props} isAnimationActive={animated} />
);
