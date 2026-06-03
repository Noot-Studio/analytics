import { animate } from "motion/react";
import { useEffect, useRef, useState } from "react";

const COUNT_UP_DURATION_S = 1;

const defaultFormat = (value: number): string =>
  Math.round(value).toLocaleString();

type FormatFn = (value: number) => string;

const AnimatedNumber = ({
  value,
  format,
}: {
  value: number;
  format: FormatFn;
}) => {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const controls = animate(fromRef.current, value, {
      duration: COUNT_UP_DURATION_S,
      ease: "easeOut",
      onUpdate: setDisplay,
    });
    fromRef.current = value;
    return () => controls.stop();
  }, [value]);

  return <span className="tabular-nums">{format(display)}</span>;
};

interface CountUpNumberProps {
  value: number;
  format?: FormatFn;
  /** Opt in to the count-up animation. Renders statically when false (default). */
  animated?: boolean;
}

/**
 * Renders a formatted number. Pass `animated` to count it up from its previous
 * value (0 on mount) to the target, formatting on every frame so locale
 * separators, percent signs, and fixed precision tick along with the value.
 */
export const CountUpNumber = ({
  value,
  format = defaultFormat,
  animated = false,
}: CountUpNumberProps) => {
  if (animated) {
    return <AnimatedNumber format={format} value={value} />;
  }
  return <span className="tabular-nums">{format(value)}</span>;
};
