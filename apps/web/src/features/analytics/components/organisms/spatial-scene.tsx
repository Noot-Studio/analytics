import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ComponentProps, ComponentRef } from "react";
import { lazy, Suspense, useRef } from "react";

import { SceneCamera, VoxelInstances } from "./voxel-canvas";

// Heavy raymarch shader + 3D density texture — only load it when fog is picked.
const FogVolume = lazy(async () => {
  const module = await import("./fog-volume-canvas");
  return { default: module.FogVolume };
});

const IsoSurface = lazy(async () => {
  const module = await import("./iso-surface-canvas");
  return { default: module.IsoSurface };
});

type RenderMode = "fog" | "surface" | "voxels";

type SpatialSceneProps = ComponentProps<typeof VoxelInstances> & {
  renderMode: RenderMode;
};

/**
 * Single persistent WebGL context for the spatial heatmap. Render modes swap
 * only the inner volume so the canvas/context is never torn down — toggling
 * modes no longer loses the context (voxels) or starves frames (fog).
 */
const SpatialScene = ({
  renderMode,
  useMetric,
  voxelSize,
  voxels,
}: SpatialSceneProps) => {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  return (
    <Canvas
      camera={{ far: 10_000, fov: 60, near: 0.1, position: [200, 200, 200] }}
      frameloop="always"
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
      <SceneCamera
        controlsRef={controlsRef}
        useMetric={useMetric}
        voxelSize={voxelSize}
        voxels={voxels}
      />
      {renderMode === "fog" && (
        <Suspense fallback={null}>
          <FogVolume
            useMetric={useMetric}
            voxelSize={voxelSize}
            voxels={voxels}
          />
        </Suspense>
      )}
      {renderMode === "surface" && (
        <Suspense fallback={null}>
          <IsoSurface
            useMetric={useMetric}
            voxelSize={voxelSize}
            voxels={voxels}
          />
        </Suspense>
      )}
      {renderMode === "voxels" && (
        <VoxelInstances
          useMetric={useMetric}
          voxelSize={voxelSize}
          voxels={voxels}
        />
      )}
    </Canvas>
  );
};

export default SpatialScene;
