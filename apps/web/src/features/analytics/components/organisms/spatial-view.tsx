import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Box } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { orpc } from "@/utils/orpc";

import { useAnalyticsFilters } from "../../lib/use-analytics-filters";
import { TimeRangeFilter } from "../molecules/time-range-filter";
import type { TrajectoryPath } from "./trajectory-scene";

const SpatialScene = lazy(() => import("./spatial-scene"));
const TrajectoryScene = lazy(() => import("./trajectory-scene"));

type RenderMode = "voxels" | "fog" | "surface";

const DEFAULT_VOXEL_SIZE = 32;
const MIN_VOXEL_SIZE = 8;
const MAX_VOXEL_SIZE = 256;
const VOXEL_SIZE_STEP = 8;
const CANVAS_HEIGHT = 600;

// "events" = raw position voxels (query-time bins); otherwise "<kind>:<cellSize>"
// selects a pre-aggregated rollup heatmap captured at that fixed cell size.
const EVENTS_SOURCE = "events";
// Per-player ordered paths — a distinct render (polylines), not a heatmap.
const TRAJECTORY_SOURCE = "trajectory";
const MAX_TRAJECTORY_POINTS = 100_000;

// Friendly names for the built-in kinds; any game-defined kind is title-cased.
const KIND_LABELS: Record<string, string> = {
  dwell: "Dwell time",
  visits: "Visits",
};

const kindLabel = (kind: string, cellSize: number): string => {
  const label =
    KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
  return `${label} (${cellSize})`;
};

const emptyDescription = (isTrajectory: boolean, isRollup: boolean): string => {
  if (isTrajectory) {
    return "No captured trajectories for this scene and date range.";
  }
  if (isRollup) {
    return "No aggregated cells found for this scene and date range.";
  }
  return "No events with position data found for this scene.";
};

// Trajectory points arrive ordered by (session, time, seq); fold consecutive
// runs of the same session into one polyline.
const groupPaths = (
  points: { sessionId: string; x: number; y: number; z: number }[]
): TrajectoryPath[] => {
  const paths: TrajectoryPath[] = [];
  for (const p of points) {
    const last = paths.at(-1);
    if (last?.sessionId === p.sessionId) {
      last.points.push([p.x, p.y, p.z]);
    } else {
      paths.push({ points: [[p.x, p.y, p.z]], sessionId: p.sessionId });
    }
  }
  return paths;
};

interface ParsedSource {
  isTrajectory: boolean;
  isRollup: boolean;
  cellSize: number;
  kind: string;
}

// Decode the Source select value into render flags. Cells encode "<kind>:<size>".
const parseSource = (source: string): ParsedSource => {
  if (source === TRAJECTORY_SOURCE) {
    return { cellSize: 0, isRollup: false, isTrajectory: true, kind: "" };
  }
  if (source === EVENTS_SOURCE) {
    return { cellSize: 0, isRollup: false, isTrajectory: false, kind: "" };
  }
  const [kind, cell] = source.split(":");
  return {
    cellSize: Number(cell),
    isRollup: true,
    isTrajectory: false,
    kind: kind ?? "",
  };
};

const SpatialHeader = () => (
  <div className="flex items-center justify-between gap-4">
    <h1 className="font-semibold text-2xl">Spatial Events</h1>
    <TimeRangeFilter />
  </div>
);

const computeIsEmpty = (a: {
  isSceneReady: boolean;
  isTrajectory: boolean;
  playersEmpty: boolean;
  pathsEmpty: boolean;
  voxelsEmpty: boolean;
}): boolean => {
  if (!a.isSceneReady) {
    return true;
  }
  if (a.isTrajectory) {
    return a.playersEmpty || a.pathsEmpty;
  }
  return a.voxelsEmpty;
};

type SpatialData = ReturnType<typeof useSpatialData>;

// Aggregates the six spatial queries and all derived render state. Complexity is
// inherent to wiring the query graph; the branchy view logic lives in the pure
// helpers above and the presentational components below.
// oxlint-disable-next-line complexity
const useSpatialData = (projectId: string) => {
  const { from: fromIso, to: toIso } = useAnalyticsFilters();
  const from = fromIso.slice(0, 10);
  const to = toIso.slice(0, 10);

  const [activeScene, setActiveScene] = useState<string | undefined>();
  const [voxelSize, setVoxelSize] = useState(DEFAULT_VOXEL_SIZE);
  const [renderMode, setRenderMode] = useState<RenderMode>("voxels");
  const [source, setSource] = useState<string>(EVENTS_SOURCE);
  const [activePlayer, setActivePlayer] = useState<string | undefined>();

  const scenesQuery = useQuery(
    orpc.insights.spatial.scenes.queryOptions({
      input: { from, projectId, to },
    })
  );
  const scenes = scenesQuery.data?.scenes ?? [];
  const resolvedScene = activeScene ?? scenes[0]?.scene;
  const scene = resolvedScene ?? "";
  const isSceneReady = !!resolvedScene;

  const { isTrajectory, isRollup, cellSize, kind } = parseSource(source);
  const effectiveVoxelSize = isRollup
    ? Math.max(voxelSize, cellSize)
    : voxelSize;

  const kindsQuery = useQuery(
    orpc.insights.spatial.kinds.queryOptions({
      enabled: isSceneReady,
      input: { from, projectId, scene, to },
    })
  );

  const voxelsQuery = useQuery(
    orpc.insights.spatial.voxels.queryOptions({
      enabled: isSceneReady && !isRollup,
      input: { from, projectId, scene, to, voxelSize },
    })
  );

  // cellSize/kind are 0/"" unless isRollup, but the query is disabled then.
  const heatmapQuery = useQuery(
    orpc.insights.spatial.heatmap.queryOptions({
      enabled: isSceneReady && isRollup,
      input: {
        cellSize,
        from,
        kind,
        projectId,
        scene,
        to,
        voxelSize: effectiveVoxelSize,
      },
    })
  );

  const playersQuery = useQuery(
    orpc.insights.spatial.trajectoryPlayers.queryOptions({
      enabled: isSceneReady && isTrajectory,
      input: { from, projectId, scene, to },
    })
  );
  const players = playersQuery.data?.players ?? [];
  const resolvedPlayer = activePlayer ?? players[0]?.playerId;

  const trajectoryQuery = useQuery(
    orpc.insights.spatial.trajectory.queryOptions({
      enabled: isSceneReady && isTrajectory && !!resolvedPlayer,
      input: {
        from,
        limit: MAX_TRAJECTORY_POINTS,
        playerId: resolvedPlayer ?? "",
        projectId,
        scene,
        to,
      },
    })
  );
  const paths = groupPaths(trajectoryQuery.data?.points ?? []);

  // Rollup cells carry their accumulated value; render it as the voxel intensity
  // (count) so the existing voxel/fog/surface renderer is reused as-is.
  const rollupVoxels = (heatmapQuery.data?.cells ?? []).map((c) => ({
    count: c.value,
    value: null,
    x: c.x,
    y: c.y,
    z: c.z,
  }));
  const voxels = isRollup ? rollupVoxels : (voxelsQuery.data?.voxels ?? []);
  const dataQuery = isRollup ? heatmapQuery : voxelsQuery;
  const showTruncated = isTrajectory
    ? (trajectoryQuery.data?.truncated ?? false)
    : (dataQuery.data?.truncated ?? false);

  const isEmpty = computeIsEmpty({
    isSceneReady,
    isTrajectory,
    pathsEmpty: trajectoryQuery.isSuccess && paths.length === 0,
    playersEmpty: playersQuery.isSuccess && players.length === 0,
    voxelsEmpty: dataQuery.isSuccess && voxels.length === 0,
  });

  return {
    effectiveVoxelSize,
    isEmpty,
    isRollup,
    isTrajectory,
    kinds: kindsQuery.data?.kinds ?? [],
    paths,
    players,
    renderMode,
    resolvedPlayer,
    resolvedScene,
    scenes,
    scenesQuery,
    setActivePlayer,
    setActiveScene,
    setRenderMode,
    setSource,
    setVoxelSize,
    showTruncated,
    source,
    voxelSize,
    voxels,
  };
};

const PlayerControl = (d: SpatialData) => (
  <div className="grid gap-1.5">
    <Label htmlFor="player-select">Player</Label>
    <Select
      onValueChange={(value) => {
        if (value) {
          d.setActivePlayer(value);
        }
      }}
      value={d.resolvedPlayer}
    >
      <SelectTrigger className="w-64" id="player-select">
        <SelectValue placeholder="Select a player" />
      </SelectTrigger>
      <SelectContent>
        {d.players.map((p) => (
          <SelectItem key={p.playerId} value={p.playerId}>
            {p.playerId.slice(0, 12)} ({p.points.toLocaleString()} pts)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const VoxelControls = (d: SpatialData) => (
  <>
    <div className="grid gap-1.5">
      <Label htmlFor="voxel-size">Voxel size: {d.effectiveVoxelSize}</Label>
      <input
        aria-label="Voxel size"
        className="h-8 w-48 cursor-pointer accent-primary"
        id="voxel-size"
        max={MAX_VOXEL_SIZE}
        min={MIN_VOXEL_SIZE}
        onChange={(e) => d.setVoxelSize(Number(e.target.value))}
        step={VOXEL_SIZE_STEP}
        type="range"
        value={d.voxelSize}
      />
    </div>

    <div className="grid gap-1.5">
      <Label htmlFor="render-mode">Render</Label>
      <Select
        onValueChange={(value) => d.setRenderMode(value as RenderMode)}
        value={d.renderMode}
      >
        <SelectTrigger className="w-40" id="render-mode">
          <SelectValue placeholder="Render mode" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="voxels">Voxels</SelectItem>
          <SelectItem value="fog">Fog volume</SelectItem>
          <SelectItem value="surface">Isosurface</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </>
);

const SpatialControls = (d: SpatialData) => (
  <div className="flex flex-wrap items-end gap-4">
    <div className="grid gap-1.5">
      <Label htmlFor="scene-select">Scene</Label>
      <Select
        onValueChange={(value) => {
          if (value) {
            d.setActiveScene(value);
            // Available rollups differ per scene — drop back to raw events.
            d.setSource(EVENTS_SOURCE);
          }
        }}
        value={d.resolvedScene}
      >
        <SelectTrigger id="scene-select">
          <SelectValue placeholder="Select a scene" />
        </SelectTrigger>
        <SelectContent>
          {d.scenes.map((s) => (
            <SelectItem key={s.scene} value={s.scene}>
              {s.scene} ({s.eventCount.toLocaleString()})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="grid gap-1.5">
      <Label htmlFor="source-select">Source</Label>
      <Select
        onValueChange={(value) => {
          if (value) {
            d.setSource(value);
          }
        }}
        value={d.source}
      >
        <SelectTrigger className="w-48" id="source-select">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EVENTS_SOURCE}>Events (positions)</SelectItem>
          {d.kinds.map((k) => (
            <SelectItem
              key={`${k.kind}:${k.cellSize}`}
              value={`${k.kind}:${k.cellSize}`}
            >
              {kindLabel(k.kind, k.cellSize)}
            </SelectItem>
          ))}
          <SelectItem value={TRAJECTORY_SOURCE}>
            Trajectories (paths)
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    {d.isTrajectory ? <PlayerControl {...d} /> : <VoxelControls {...d} />}
  </div>
);

const SpatialEmpty = ({
  isTrajectory,
  isRollup,
}: {
  isTrajectory: boolean;
  isRollup: boolean;
}) => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Box />
      </EmptyMedia>
      <EmptyTitle>No spatial data in this date range.</EmptyTitle>
      <EmptyDescription>
        {emptyDescription(isTrajectory, isRollup)}
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
);

const SpatialCanvas = (d: SpatialData) => (
  <div
    className="overflow-hidden rounded-lg border border-border"
    style={{ height: `${CANVAS_HEIGHT}px` }}
  >
    <Suspense
      fallback={
        <Skeleton
          className="w-full rounded-none"
          style={{ height: `${CANVAS_HEIGHT}px` }}
        />
      }
    >
      {d.isTrajectory ? (
        <TrajectoryScene paths={d.paths} />
      ) : (
        <SpatialScene
          renderMode={d.renderMode}
          useMetric={false}
          voxelSize={d.effectiveVoxelSize}
          voxels={d.voxels}
        />
      )}
    </Suspense>
  </div>
);

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col gap-6 p-4 lg:p-6">
    <SpatialHeader />
    {children}
  </div>
);

export const SpatialView = ({ projectId }: { projectId: string }) => {
  const d = useSpatialData(projectId);

  if (d.scenesQuery.isLoading) {
    return (
      <Shell>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="w-full" style={{ height: `${CANVAS_HEIGHT}px` }} />
      </Shell>
    );
  }

  if (d.scenesQuery.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load spatial scenes.
      </div>
    );
  }

  if (d.scenes.length === 0) {
    return (
      <Shell>
        <SpatialEmpty isRollup={false} isTrajectory={false} />
      </Shell>
    );
  }

  return (
    <Shell>
      <SpatialControls {...d} />
      {d.showTruncated && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-700 text-sm dark:text-amber-400">
          {d.isTrajectory
            ? "Path truncated — narrow the date range to see the full trajectory."
            : "Result truncated — increase voxel size or narrow the date range to see all data."}
        </div>
      )}
      {d.isEmpty ? (
        <SpatialEmpty isRollup={d.isRollup} isTrajectory={d.isTrajectory} />
      ) : (
        <SpatialCanvas {...d} />
      )}
    </Shell>
  );
};
