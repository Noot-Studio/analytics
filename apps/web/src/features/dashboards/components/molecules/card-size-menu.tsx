import type { CardSizeValue } from "@sbox-analytics/api/dashboard-cards";
import { Button } from "@sbox-analytics/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@sbox-analytics/ui/components/dropdown-menu";
import { Scaling } from "lucide-react";

const SIZE_LABELS: Record<CardSizeValue, string> = {
  Full: "Full width",
  Half: "1/2 width",
  Third: "1/3 width",
  TwoThirds: "2/3 width",
};

const SIZE_ORDER: CardSizeValue[] = ["Third", "Half", "TwoThirds", "Full"];

interface CardSizeMenuProps {
  onSizeChange: (size: CardSizeValue) => void;
  size: CardSizeValue;
}

export const CardSizeMenu = ({ onSizeChange, size }: CardSizeMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<Button aria-label="Card size" size="icon" variant="ghost" />}
    >
      <Scaling />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuRadioGroup
        onValueChange={(value) => onSizeChange(value as CardSizeValue)}
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
