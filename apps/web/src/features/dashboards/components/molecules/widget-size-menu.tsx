import type { WidgetSizeValue } from "@sbox-analytics/api/dashboard-widgets";
import { Button } from "@sbox-analytics/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@sbox-analytics/ui/components/dropdown-menu";
import { Scaling } from "lucide-react";

const SIZE_LABELS: Record<WidgetSizeValue, string> = {
  Full: "Full width",
  Half: "1/2 width",
  Third: "1/3 width",
  TwoThirds: "2/3 width",
};

const SIZE_ORDER: WidgetSizeValue[] = ["Third", "Half", "TwoThirds", "Full"];

interface WidgetSizeMenuProps {
  onSizeChange: (size: WidgetSizeValue) => void;
  size: WidgetSizeValue;
}

export const WidgetSizeMenu = ({ onSizeChange, size }: WidgetSizeMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<Button aria-label="Widget size" size="icon" variant="ghost" />}
    >
      <Scaling />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuRadioGroup
        onValueChange={(value) => onSizeChange(value as WidgetSizeValue)}
        value={size}
      >
        {SIZE_ORDER.map((option) => (
          // Radio items keep the menu open by default; close on pick so the
          // (invisible) menu backdrop doesn't swallow the next click.
          <DropdownMenuRadioItem closeOnClick key={option} value={option}>
            {SIZE_LABELS[option]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);
