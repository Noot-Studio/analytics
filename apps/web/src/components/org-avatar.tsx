import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@sbox-analytics/ui/components/avatar";

// Abstract "shape-grid" style marks organizations apart from user (lorelei)
// and player (identicon) avatars.
const DICEBEAR_BASE_URL = "https://api.dicebear.com/10.x/shape-grid/svg";

interface OrgAvatarProps {
  name: string;
  /** Deterministic DiceBear seed — use the organization's slug or id. */
  seed: string;
  /** Uploaded logo; falls back to DiceBear when absent. */
  logo?: string | null;
  className?: string;
}

export const OrgAvatar = ({ className, logo, name, seed }: OrgAvatarProps) => (
  <Avatar className={className}>
    <AvatarImage
      alt={`Logo for ${name}`}
      src={logo ?? `${DICEBEAR_BASE_URL}?seed=${encodeURIComponent(seed)}`}
    />
    <AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback>
  </Avatar>
);
