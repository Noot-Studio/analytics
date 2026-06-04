import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@sbox-analytics/ui/components/avatar";

const DICEBEAR_BASE_URL = "https://api.dicebear.com/10.x/identicon/svg";

/**
 * Deterministic DiceBear avatar seeded by player_id. Anonymous activity
 * (empty player_id) falls back to a placeholder glyph.
 */
export const PlayerAvatar = ({
  playerId,
  size = "sm",
}: {
  playerId: string;
  size?: "sm" | "default" | "lg";
}) => (
  <Avatar size={size}>
    {playerId ? (
      <AvatarImage
        alt={`Avatar for player ${playerId}`}
        src={`${DICEBEAR_BASE_URL}?seed=${encodeURIComponent(playerId)}`}
      />
    ) : null}
    <AvatarFallback>?</AvatarFallback>
  </Avatar>
);
