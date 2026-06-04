import { RelativeTime } from "../atoms/relative-time";

export interface PlayerSpecs {
  captured_at: string;
  cpu: string;
  gpu: string;
  os: string;
  platform: string;
  ram_gb: number;
  resolution: string;
  version: string;
}

const specEntries = (specs: PlayerSpecs): { label: string; value: string }[] =>
  [
    { label: "OS", value: specs.os },
    { label: "GPU", value: specs.gpu },
    { label: "CPU", value: specs.cpu },
    { label: "RAM", value: specs.ram_gb > 0 ? `${specs.ram_gb} GB` : "" },
    { label: "Resolution", value: specs.resolution },
    { label: "Platform", value: specs.platform },
    { label: "Game version", value: specs.version },
  ].filter((entry) => entry.value !== "");

/**
 * Hardware/client specs from the player's most recent session_start event.
 */
export const PlayerSpecsCard = ({ specs }: { specs: PlayerSpecs }) => (
  <div className="flex flex-col gap-3">
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {specEntries(specs).map((entry) => (
        <div className="col-span-2 grid grid-cols-subgrid" key={entry.label}>
          <dt className="text-muted-foreground">{entry.label}</dt>
          <dd className="font-medium">{entry.value}</dd>
        </div>
      ))}
    </dl>
    <p className="text-muted-foreground text-xs">
      Reported <RelativeTime date={specs.captured_at} />
    </p>
  </div>
);
