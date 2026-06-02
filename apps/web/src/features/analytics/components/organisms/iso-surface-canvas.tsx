import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";

import { buildDensityGrid } from "./fog-volume-canvas";
import type { Voxel } from "./fog-volume-canvas";

const UINT8_MAX = 255;
// Cubic field resolution fed to marching cubes. The density grid is resampled
// to this on every axis; higher = smoother surface but cubic polygonize cost.
const RESOLUTION = 48;
// Upper bound on triangles per shell. Surfaces above this are clipped, so keep
// generous headroom over the densest expected isosurface.
const MAX_POLY_COUNT = 120_000;
// Isolevel used to calibrate the marching-cubes local domain (see calibrate).
const CALIBRATION_ISO = 0.5;

// Nested isosurface shells, low → high density. The outer shells are large and
// translucent (overall envelope); inner shells are small, bright, and opaque
// (dense cores). Colors track the same inferno ramp as the fog volume so the
// two render modes read consistently.
const SHELLS = [
  { color: "#3b0f70", iso: 0.1, opacity: 0.1 },
  { color: "#cf4446", iso: 0.28, opacity: 0.2 },
  { color: "#fb9a06", iso: 0.52, opacity: 0.38 },
  { color: "#fcffa4", iso: 0.78, opacity: 0.65 },
] as const;

interface IsoSurfaceProps {
  useMetric: boolean;
  voxels: Voxel[];
  voxelSize: number;
}

// Resample the (possibly anisotropic) density grid into a cubic field of side
// RESOLUTION, normalized to 0..1. Marching cubes requires a cubic grid.
const resampleCubic = (
  data: Uint8Array,
  dims: [number, number, number]
): Float32Array => {
  const [nx, ny, nz] = dims;
  const field = new Float32Array(RESOLUTION * RESOLUTION * RESOLUTION);
  const span = RESOLUTION - 1;
  for (let z = 0; z < RESOLUTION; z += 1) {
    const sz = Math.min(nz - 1, Math.round((z / span) * (nz - 1)));
    for (let y = 0; y < RESOLUTION; y += 1) {
      const sy = Math.min(ny - 1, Math.round((y / span) * (ny - 1)));
      for (let x = 0; x < RESOLUTION; x += 1) {
        const sx = Math.min(nx - 1, Math.round((x / span) * (nx - 1)));
        const src = sx + nx * (sy + ny * sz);
        const dst = x + RESOLUTION * (y + RESOLUTION * z);
        field[dst] = data[src] / UINT8_MAX;
      }
    }
  }
  return field;
};

// Marching cubes emits vertices in an internal local space whose exact range
// depends on its implementation. Rather than hard-code that convention, build a
// throwaway box surface (interior = 1, one-cell border = 0) and read back its
// bounding box: that IS the local-space domain. Every real shell uses the same
// mapping, so they stay mutually aligned regardless of the convention.
const calibrateDomain = (material: THREE.Material): THREE.Box3 => {
  const calField = new Float32Array(RESOLUTION * RESOLUTION * RESOLUTION);
  for (let z = 1; z < RESOLUTION - 1; z += 1) {
    for (let y = 1; y < RESOLUTION - 1; y += 1) {
      for (let x = 1; x < RESOLUTION - 1; x += 1) {
        calField[x + RESOLUTION * (y + RESOLUTION * z)] = 1;
      }
    }
  }
  const probe = new MarchingCubes(
    RESOLUTION,
    material,
    false,
    false,
    MAX_POLY_COUNT
  );
  probe.isolation = CALIBRATION_ISO;
  probe.field.set(calField);
  probe.update();
  probe.geometry.computeBoundingBox();
  const box = probe.geometry.boundingBox?.clone() ?? new THREE.Box3();
  probe.geometry.dispose();
  return box;
};

const buildShells = (
  field: Float32Array,
  center: THREE.Vector3,
  size: THREE.Vector3
): THREE.Group => {
  const group = new THREE.Group();

  const calMaterial = new THREE.MeshBasicMaterial();
  const domain = calibrateDomain(calMaterial);
  calMaterial.dispose();

  const domainSize = new THREE.Vector3();
  domain.getSize(domainSize);
  const domainCenter = new THREE.Vector3();
  domain.getCenter(domainCenter);

  // Map the marching-cubes local domain box onto the world-space density box.
  const scale = new THREE.Vector3(
    domainSize.x > 0 ? size.x / domainSize.x : 1,
    domainSize.y > 0 ? size.y / domainSize.y : 1,
    domainSize.z > 0 ? size.z / domainSize.z : 1
  );
  group.scale.copy(scale);
  group.position.set(
    center.x - domainCenter.x * scale.x,
    center.y - domainCenter.y * scale.y,
    center.z - domainCenter.z * scale.z
  );

  for (const shell of SHELLS) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(shell.color),
      depthWrite: false,
      opacity: shell.opacity,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const mesh = new MarchingCubes(
      RESOLUTION,
      material,
      false,
      false,
      MAX_POLY_COUNT
    );
    mesh.isolation = shell.iso;
    mesh.field.set(field);
    mesh.update();
    // Freeze it: without an animation loop MarchingCubes would otherwise rebuild
    // (and clear) its geometry on the next render via its update hook.
    mesh.enableUvs = false;
    mesh.enableColors = false;
    group.add(mesh);
  }

  return group;
};

const disposeGroup = (group: THREE.Group): void => {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const { material } = child;
      if (Array.isArray(material)) {
        for (const m of material) {
          m.dispose();
        }
      } else {
        material.dispose();
      }
    }
  });
};

export const IsoSurface = ({
  useMetric,
  voxels,
  voxelSize,
}: IsoSurfaceProps) => {
  const invalidate = useThree((state) => state.invalidate);

  const group = useMemo(() => {
    const grid = buildDensityGrid(voxels, voxelSize, useMetric);
    if (!grid) {
      return null;
    }
    const field = resampleCubic(grid.data, grid.dims);
    return buildShells(field, grid.center, grid.size);
  }, [voxels, voxelSize, useMetric]);

  useEffect(() => {
    if (!group) {
      return;
    }
    invalidate();
    return () => {
      disposeGroup(group);
    };
  }, [group, invalidate]);

  if (!group) {
    return null;
  }

  return <primitive object={group} />;
};

export default IsoSurface;
