import type { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { ComponentRef } from "react";
import * as THREE from "three";

type OrbitControlsRef = ComponentRef<typeof OrbitControls>;

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

export const VoxelInstances = ({
  voxels,
  voxelSize,
  useMetric,
}: VoxelCanvasProps) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);

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
      // Reset to a pure scale matrix each iteration, else .scale() compounds
      matrix.makeScale(voxelSize, voxelSize, voxelSize);
      // Engine Z maps to Three Y so heatmap stands upright
      matrix.setPosition(
        v.x + voxelSize / 2,
        v.z + voxelSize / 2,
        v.y + voxelSize / 2
      );
      mesh.setMatrixAt(i, matrix);

      const t = intensities[i] / maxIntensity;
      color.copy(lerp(BLUE, RED, t));
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    // frameloop="demand": force a render after buffers change
    invalidate();
  }, [voxels, voxelSize, useMetric, invalidate]);

  if (voxels.length === 0) {
    return null;
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial depthWrite={false} opacity={0.55} transparent />
    </instancedMesh>
  );
};

export const SceneCamera = ({
  voxels,
  voxelSize,
  controlsRef,
}: VoxelCanvasProps & {
  controlsRef: React.RefObject<OrbitControlsRef | null>;
}) => {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (voxels.length === 0) {
      return;
    }

    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const v of voxels) {
      // Match VoxelInstances coord mapping (engine Z -> Three Y)
      point.set(v.x + voxelSize / 2, v.z + voxelSize / 2, v.y + voxelSize / 2);
      box.expandByPoint(point);
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, voxelSize);
    const dist = radius * 1.5 + voxelSize * 4;

    camera.position.set(center.x + dist, center.y + dist, center.z + dist);
    camera.near = Math.max(0.1, dist / 1000);
    camera.far = dist * 20 + 1000;
    camera.updateProjectionMatrix();

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
    invalidate();
  }, [voxels, voxelSize, camera, invalidate, controlsRef]);

  return null;
};
