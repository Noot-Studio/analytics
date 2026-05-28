import { Button } from "@sbox-analytics/ui/components/button";
import type { ComponentProps, ReactElement } from "react";
import { cloneElement, isValidElement, useEffect, useState } from "react";

type ButtonProps = ComponentProps<typeof Button>;

interface ConfirmButtonProps extends Omit<ButtonProps, "children" | "onClick"> {
  /** Resting label, e.g. "Delete". */
  label: string;
  /** Label shown once armed, before the confirming click. */
  confirmLabel?: string;
  /** Fired on the second (confirming) click. */
  onConfirm: () => void;
  /** Variant used while armed (default Button only). Defaults to "destructive". */
  confirmVariant?: ButtonProps["variant"];
  /** How long the armed state lasts before reverting, in ms. */
  resetAfterMs?: number;
  /**
   * Element to render instead of the default Button — e.g. a
   * `<DropdownMenuItem closeOnClick={false} />` so the control inherits native
   * menu styling. It receives `onClick` and the current label as children.
   */
  render?: ReactElement<{ onClick?: () => void }>;
}

const DEFAULT_RESET_MS = 3000;

/**
 * iOS-inspired two-click button: the first click arms the action and swaps the
 * label to a confirmation prompt; the second click confirms. The armed state
 * auto-reverts after `resetAfterMs` if the user doesn't follow through.
 */
export const ConfirmButton = ({
  label,
  confirmLabel = "Are you sure?",
  onConfirm,
  confirmVariant = "destructive",
  resetAfterMs = DEFAULT_RESET_MS,
  variant = "ghost",
  render,
  ...buttonProps
}: ConfirmButtonProps) => {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) {
      return;
    }

    const timer = setTimeout(() => setArmed(false), resetAfterMs);
    return () => clearTimeout(timer);
  }, [armed, resetAfterMs]);

  const handleClick = () => {
    if (armed) {
      setArmed(false);
      onConfirm();
      return;
    }

    setArmed(true);
  };

  const content = armed ? confirmLabel : label;

  if (render && isValidElement(render)) {
    return cloneElement(render, { onClick: handleClick }, content);
  }

  return (
    <Button
      onClick={handleClick}
      type="button"
      variant={armed ? confirmVariant : variant}
      {...buttonProps}
    >
      {content}
    </Button>
  );
};
