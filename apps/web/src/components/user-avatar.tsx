import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@sbox-analytics/ui/components/avatar";

// "glyphs" style keeps platform users visually distinct from the
// identicon player avatars in analytics views.
const DICEBEAR_BASE_URL = "https://api.dicebear.com/10.x/glyphs/svg";

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

interface UserAvatarProps {
  name: string;
  /** Deterministic DiceBear seed — use the user's email or id. */
  seed: string;
  /** Uploaded/OAuth avatar; falls back to DiceBear when absent. */
  image?: string | null;
  className?: string;
  size?: "sm" | "default" | "lg";
}

export const UserAvatar = ({
  className,
  image,
  name,
  seed,
  size,
}: UserAvatarProps) => (
  <Avatar className={className} size={size}>
    <AvatarImage
      alt={`Avatar for ${name}`}
      src={image ?? `${DICEBEAR_BASE_URL}?seed=${encodeURIComponent(seed)}`}
    />
    <AvatarFallback>{initialsOf(name)}</AvatarFallback>
  </Avatar>
);
