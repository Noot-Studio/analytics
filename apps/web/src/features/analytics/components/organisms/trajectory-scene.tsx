import { Grid, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ComponentRef } from "react";
import { useRef } from "react";

export interface TrajectoryPath {
  sessionId: string;
  points: [number, number, number][];
}

// Per-session colors so overlapping paths stay distinguishable.
const PATH_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
] as const;

/**
 * Ordered per-player path replay. Same canvas chrome as SpatialScene (grid,
 * axes, orbit camera) but renders one polyline per session instead of voxels —
 * the data shapes are incompatible, so it's a sibling rather than a shared prop.
 */
const TrajectoryScene = ({ paths }: { paths: TrajectoryPath[] }) => {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  return (
    <Canvas
      camera={{ far: 10_000, fov: 60, near: 0.1, position: [200, 200, 200] }}
      frameloop="demand"
    >
      <OrbitControls makeDefault ref={controlsRef} />
      <Grid
        args={[1000, 1000]}
        cellColor="#6b7280"
        fadeDistance={1000}
        fadeStrength={2}
        sectionColor="#374151"
      />
      <axesHelper args={[100]} />
      {paths.map((path, i) =>
        path.points.length >= 2 ? (
          <Line
            color={PATH_COLORS[i % PATH_COLORS.length]}
            key={path.sessionId}
            lineWidth={2}
            points={path.points}
          />
        ) : null
      )}
    </Canvas>
  );
};

export default TrajectoryScene;
