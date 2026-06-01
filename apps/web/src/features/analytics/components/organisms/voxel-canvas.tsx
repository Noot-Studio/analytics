import { OrbitControls, Grid } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Voxel {
  x: number;
  y: number;
  z: number;
  count: number;
  value: number | null;
}

interface VoxelCanvasProps {
  voxels: Voxel[];
  voxelSize: number;
  useMetric: boolean;
}

const BLUE = new THREE.Color(0x3b_82_f6);
const RED = new THREE.Color(0xef_44_44);

const lerp = (a: THREE.Color, b: THREE.Color, t: number): THREE.Color =>
  new THREE.Color().lerpColors(a, b, t);

const VoxelInstances = ({ voxels, voxelSize, useMetric }: VoxelCanvasProps) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || voxels.length === 0) {
      return;
    }

    const intensities = voxels.map((v) =>
      useMetric ? (v.value ?? 0) : v.count
    );
    const maxIntensity = Math.max(...intensities, 1);

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let i = 0; i < voxels.length; i += 1) {
      const v = voxels[i];
      // Engine Z maps to Three Y so heatmap stands upright
      matrix.setPosition(
        v.x + voxelSize / 2,
        v.z + voxelSize / 2,
        v.y + voxelSize / 2
      );
      matrix.scale(new THREE.Vector3(voxelSize, voxelSize, voxelSize));
      mesh.setMatrixAt(i, matrix);

      const t = intensities[i] / maxIntensity;
      color.copy(lerp(BLUE, RED, t));
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [voxels, voxelSize, useMetric]);

  if (voxels.length === 0) {
    return null;
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors />
    </instancedMesh>
  );
};

const VoxelCanvas = ({ voxels, voxelSize, useMetric }: VoxelCanvasProps) => (
  <Canvas
    camera={{ far: 10_000, fov: 60, near: 0.1, position: [200, 200, 200] }}
    frameloop="demand"
  >
    <ambientLight intensity={0.6} />
    <directionalLight intensity={1} position={[100, 200, 100]} />
    <OrbitControls makeDefault />
    <Grid
      args={[1000, 1000]}
      cellColor="#6b7280"
      sectionColor="#374151"
      fadeDistance={2000}
      infiniteGrid
    />
    <axesHelper args={[100]} />
    <VoxelInstances
      voxels={voxels}
      voxelSize={voxelSize}
      useMetric={useMetric}
    />
  </Canvas>
);

export default VoxelCanvas;
