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
import { Suspense, lazy, useState } from "react";

import { orpc } from "@/utils/orpc";

import { isoDaysAgo } from "../../lib/date-window";

const VoxelCanvas = lazy(() => import("./voxel-canvas"));

const SPATIAL_WINDOW_DAYS = 30;
const DEFAULT_VOXEL_SIZE = 32;
const MIN_VOXEL_SIZE = 8;
const MAX_VOXEL_SIZE = 256;
const VOXEL_SIZE_STEP = 8;
const CANVAS_HEIGHT = 600;

export const SpatialView = ({ projectId }: { projectId: string }) => {
  const from = isoDaysAgo(SPATIAL_WINDOW_DAYS);
  const to = isoDaysAgo(0);

  const [activeScene, setActiveScene] = useState<string | undefined>();
  const [voxelSize, setVoxelSize] = useState(DEFAULT_VOXEL_SIZE);

  const scenesQuery = useQuery(
    orpc.insights.spatial.scenes.queryOptions({
      input: { from, projectId, to },
    })
  );

  const scenes = scenesQuery.data?.scenes ?? [];

  const resolvedScene = activeScene ?? scenes[0]?.scene;

  const voxelsQuery = useQuery(
    orpc.insights.spatial.voxels.queryOptions({
      input: {
        from,
        projectId,
        scene: resolvedScene ?? "",
        to,
        voxelSize,
      },
    })
  );

  const isVoxelsEnabled = !!resolvedScene;

  if (scenesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton style={{ height: `${CANVAS_HEIGHT}px` }} className="w-full" />
      </div>
    );
  }

  if (scenesQuery.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load spatial scenes.
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <div>
          <h1 className="font-semibold text-2xl">Spatial Events</h1>
          <p className="text-muted-foreground">
            Last {SPATIAL_WINDOW_DAYS} days.
          </p>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Box />
            </EmptyMedia>
            <EmptyTitle>No spatial data in this date range.</EmptyTitle>
            <EmptyDescription>
              Send events with <code>x</code>, <code>y</code>, and{" "}
              <code>z</code> properties to populate the spatial heatmap.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const voxels = voxelsQuery.data?.voxels ?? [];
  const truncated = voxelsQuery.data?.truncated ?? false;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="font-semibold text-2xl">Spatial Events</h1>
        <p className="text-muted-foreground">
          Last {SPATIAL_WINDOW_DAYS} days.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="scene-select">Scene</Label>
          <Select
            value={resolvedScene}
            onValueChange={(value) => {
              if (value) {
                setActiveScene(value);
              }
            }}
          >
            <SelectTrigger id="scene-select">
              <SelectValue placeholder="Select a scene" />
            </SelectTrigger>
            <SelectContent>
              {scenes.map((s) => (
                <SelectItem key={s.scene} value={s.scene}>
                  {s.scene} ({s.eventCount.toLocaleString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="voxel-size">Voxel size: {voxelSize}</Label>
          <input
            id="voxel-size"
            type="range"
            min={MIN_VOXEL_SIZE}
            max={MAX_VOXEL_SIZE}
            step={VOXEL_SIZE_STEP}
            value={voxelSize}
            onChange={(e) => setVoxelSize(Number(e.target.value))}
            className="h-8 w-48 cursor-pointer accent-primary"
            aria-label="Voxel size"
          />
        </div>
      </div>

      {truncated && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-700 text-sm dark:text-amber-400">
          Result truncated — increase voxel size or narrow the date range to see
          all data.
        </div>
      )}

      {!isVoxelsEnabled || (voxelsQuery.isSuccess && voxels.length === 0) ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Box />
            </EmptyMedia>
            <EmptyTitle>No spatial data in this date range.</EmptyTitle>
            <EmptyDescription>
              No events with position data found for this scene.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-border"
          style={{ height: `${CANVAS_HEIGHT}px` }}
        >
          <Suspense
            fallback={
              <Skeleton
                style={{ height: `${CANVAS_HEIGHT}px` }}
                className="w-full rounded-none"
              />
            }
          >
            <VoxelCanvas
              voxels={voxels}
              voxelSize={voxelSize}
              useMetric={false}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
};
