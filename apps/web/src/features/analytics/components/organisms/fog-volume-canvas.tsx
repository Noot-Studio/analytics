import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export interface Voxel {
  x: number;
  y: number;
  z: number;
  count: number;
  value: number | null;
}

interface FogVolumeCanvasProps {
  voxels: Voxel[];
  voxelSize: number;
  useMetric: boolean;
}

// Raymarch quality / look. Steps trade fidelity for fill-rate; density
// scales accumulated opacity so a peak path reads as solid-ish fog.
const RAYMARCH_STEPS = 120;
const FOG_DENSITY = 3.5;
// Exponent applied to normalized density before alpha. >1 suppresses the long
// low-density tail so peaks read as distinct hotspots instead of uniform haze.
const FOG_FALLOFF = 1.8;
// Percentile the density field normalizes against (see buildDensityGrid).
const NORMALIZE_PERCENTILE = 0.95;
// Cap total grid cells so a tiny voxelSize over a large scene can't
// allocate a multi-hundred-MB texture or stall the blur passes.
const MAX_GRID_CELLS = 2_000_000;
const BLUR_PASSES = 2;
const UINT8_MAX = 255;

export interface DensityGrid {
  data: Uint8Array;
  dims: [number, number, number];
  // World-space (three coords) box that the texture maps onto.
  center: THREE.Vector3;
  size: THREE.Vector3;
}

// Separable 3×1 gaussian ([1,2,1]) along one texture axis. Run per axis
// to diffuse discrete voxel splats into a continuous fog field.
const blurAxis = (
  src: Float32Array,
  dst: Float32Array,
  dims: [number, number, number],
  axis: 0 | 1 | 2
): void => {
  const [nx, ny, nz] = dims;
  const idx = (x: number, y: number, z: number): number =>
    x + nx * (y + ny * z);

  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const here = idx(x, y, z);
        let prev = here;
        let next = here;
        if (axis === 0) {
          prev = idx(Math.max(x - 1, 0), y, z);
          next = idx(Math.min(x + 1, nx - 1), y, z);
        } else if (axis === 1) {
          prev = idx(x, Math.max(y - 1, 0), z);
          next = idx(x, Math.min(y + 1, ny - 1), z);
        } else {
          prev = idx(x, y, Math.max(z - 1, 0));
          next = idx(x, y, Math.min(z + 1, nz - 1));
        }
        dst[here] = (src[prev] + 2 * src[here] + src[next]) / 4;
      }
    }
  }
};

// Build a normalized R8 3D density texture from aggregated voxels.
// Engine Z is up, so texture axes map x→x, z→y(height), y→z(depth) to
// match the upright orientation used by voxel-canvas.
export const buildDensityGrid = (
  voxels: Voxel[],
  voxelSize: number,
  useMetric: boolean
): DensityGrid | null => {
  if (voxels.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const v of voxels) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    minZ = Math.min(minZ, v.z);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
    maxZ = Math.max(maxZ, v.z);
  }

  const cells = (min: number, max: number): number =>
    Math.max(1, Math.round((max - min) / voxelSize) + 1);
  const nx = cells(minX, maxX);
  const nyUp = cells(minZ, maxZ);
  const nzDepth = cells(minY, maxY);

  if (nx * nyUp * nzDepth > MAX_GRID_CELLS) {
    return null;
  }

  const idx = (x: number, y: number, z: number): number =>
    x + nx * (y + nyUp * z);

  let field = new Float32Array(nx * nyUp * nzDepth);
  let maxIntensity = 0;
  for (const v of voxels) {
    const ix = Math.round((v.x - minX) / voxelSize);
    const iy = Math.round((v.z - minZ) / voxelSize);
    const iz = Math.round((v.y - minY) / voxelSize);
    const intensity = useMetric ? (v.value ?? 0) : v.count;
    const at = idx(ix, iy, iz);
    field[at] += intensity;
    maxIntensity = Math.max(maxIntensity, field[at]);
  }

  const dims: [number, number, number] = [nx, nyUp, nzDepth];
  let scratch = new Float32Array(field.length);
  for (let pass = 0; pass < BLUR_PASSES; pass += 1) {
    blurAxis(field, scratch, dims, 0);
    blurAxis(scratch, field, dims, 1);
    blurAxis(field, scratch, dims, 2);
    [field, scratch] = [scratch, field];
  }

  // Normalize against the 95th percentile of occupied cells, not the single
  // peak. One outlier voxel otherwise rescales the whole field and washes it
  // flat; cells above the percentile clamp to UINT8_MAX in the write loop.
  const occupied: number[] = [];
  for (const value of field) {
    if (value > 0) {
      occupied.push(value);
    }
  }
  occupied.sort((a, b) => a - b);
  const percentileValue =
    occupied.length > 0
      ? (occupied[Math.floor(occupied.length * NORMALIZE_PERCENTILE)] ??
        maxIntensity)
      : maxIntensity;
  const scale = percentileValue > 0 ? percentileValue : maxIntensity;
  const norm = scale > 0 ? UINT8_MAX / scale : 0;
  const data = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i += 1) {
    data[i] = Math.min(UINT8_MAX, Math.round(field[i] * norm));
  }

  // Box spans cell centers padded by half a voxel on every side, so the
  // fog fills the same footprint the voxel cubes would occupy.
  const half = voxelSize / 2;
  const size = new THREE.Vector3(
    maxX - minX + voxelSize,
    maxZ - minZ + voxelSize,
    maxY - minY + voxelSize
  );
  const center = new THREE.Vector3(
    minX + (maxX - minX) / 2 + half,
    minZ + (maxZ - minZ) / 2 + half,
    minY + (maxY - minY) / 2 + half
  );

  return { center, data, dims, size };
};

const VERTEX_SHADER = /* glsl */ `
out vec3 vOrigin;
out vec3 vDirection;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  // Camera position in this box's local space ([-0.5, 0.5] cube).
  vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vDirection = position - vOrigin;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
precision highp sampler3D;

in vec3 vOrigin;
in vec3 vDirection;
out vec4 fragColor;

uniform sampler3D uData;
uniform float uSteps;
uniform float uDensity;
uniform float uFalloff;

// Inferno colormap polynomial fit (Matt DesLauriers / Google Turbo-style fit).
// Maps density 0..1 → black → purple → orange → yellow. The dark, near-black
// low end is what makes weak voxels vanish instead of fogging the scene one
// flat color; only hot paths climb into the bright oranges/yellows.
vec3 inferno(float t) {
  const vec3 c0 = vec3(0.00021894037, 0.0016510046, -0.019480898);
  const vec3 c1 = vec3(0.10651342, 0.56395643, 3.9327124);
  const vec3 c2 = vec3(11.602493, -3.9728540, -15.942394);
  const vec3 c3 = vec3(-41.703996, 17.436399, 44.354145);
  const vec3 c4 = vec3(77.162936, -33.402359, -81.807309);
  const vec3 c5 = vec3(-71.319428, 32.626064, 73.209520);
  const vec3 c6 = vec3(25.131126, -12.242669, -23.070325);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

// Slab test against the local-space unit cube [-0.5, 0.5].
vec2 hitBox(vec3 orig, vec3 dir) {
  const vec3 boxMin = vec3(-0.5);
  const vec3 boxMax = vec3(0.5);
  vec3 invDir = 1.0 / dir;
  vec3 tA = (boxMin - orig) * invDir;
  vec3 tB = (boxMax - orig) * invDir;
  vec3 tMin = min(tA, tB);
  vec3 tMax = max(tA, tB);
  float t0 = max(tMin.x, max(tMin.y, tMin.z));
  float t1 = min(tMax.x, min(tMax.y, tMax.z));
  return vec2(t0, t1);
}

void main() {
  vec3 rayDir = normalize(vDirection);
  vec2 bounds = hitBox(vOrigin, rayDir);
  if (bounds.x > bounds.y) {
    discard;
  }
  bounds.x = max(bounds.x, 0.0);

  float span = bounds.y - bounds.x;
  if (!(span > 0.0)) {
    // Rejects span <= 0 AND NaN spans (NaN fails every comparison), which
    // a degenerate axis-aligned ray (1.0/dir = inf) can produce.
    discard;
  }
  float delta = span / uSteps;
  // Jitter the entry point by up to one step. The fixed sample planes otherwise
  // alias into concentric banding; a per-pixel hash offset trades that for
  // unstructured noise the eye averages away.
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 p = vOrigin + (bounds.x + jitter * delta) * rayDir;
  vec3 stepVec = rayDir * delta;
  vec4 acc = vec4(0.0);

  // Front-to-back emission/absorption compositing. A constant loop bound is
  // mandatory: a tangent ray can drive delta -> 0, and a t += delta loop
  // would then spin forever on the GPU -> watchdog reset / lost context
  // (which is what nukes VRAM). uSteps only trims the fixed bound at runtime.
  const int MAX_STEPS = 256;
  for (int i = 0; i < MAX_STEPS; i += 1) {
    if (float(i) >= uSteps) {
      break;
    }
    float d = texture(uData, p + 0.5).r;
    if (d > 0.001) {
      // clamp() guards the polynomial: it can dip slightly negative near the
      // ends, and the pow() encoding below NaNs on a negative base.
      vec3 c = clamp(inferno(d), 0.0, 1.0);
      float a = clamp(pow(d, uFalloff) * uDensity * delta, 0.0, 1.0);
      acc.rgb += (1.0 - acc.a) * c * a;
      acc.a += (1.0 - acc.a) * a;
      if (acc.a >= 0.95) {
        break;
      }
    }
    p += stepVec;
  }

  if (acc.a <= 0.001) {
    discard;
  }
  // acc.rgb is premultiplied (front-to-back "over"). Three's default
  // NormalBlending multiplies rgb by alpha again -> double-darkening that
  // crushes the heat ramp to near-black. Divide back to straight alpha so the
  // blend re-applies it exactly once.
  vec3 straight = acc.rgb / acc.a;
  // Uniform colors arrive linear (Color manages the hex as sRGB->linear) and a
  // raw ShaderMaterial gets no auto output encoding, so encode here. Without
  // this the blue->red ramp renders far too dark to read.
  fragColor = vec4(pow(straight, vec3(1.0 / 2.2)), acc.a);
}
`;

export const FogVolume = ({
  voxels,
  voxelSize,
  useMetric,
}: FogVolumeCanvasProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        fragmentShader: FRAGMENT_SHADER,
        glslVersion: THREE.GLSL3,
        side: THREE.BackSide,
        transparent: true,
        uniforms: {
          uData: { value: null },
          uDensity: { value: FOG_DENSITY },
          uFalloff: { value: FOG_FALLOFF },
          uSteps: { value: RAYMARCH_STEPS },
        },
        vertexShader: VERTEX_SHADER,
      }),
    []
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const grid = buildDensityGrid(voxels, voxelSize, useMetric);
    if (!grid) {
      return;
    }

    const [nx, ny, nz] = grid.dims;
    const texture = new THREE.Data3DTexture(grid.data, nx, ny, nz);
    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    material.uniforms.uData.value = texture;
    mesh.position.copy(grid.center);
    mesh.scale.copy(grid.size);

    invalidate();

    return () => {
      texture.dispose();
    };
  }, [voxels, voxelSize, useMetric, material, invalidate]);

  useEffect(() => () => material.dispose(), [material]);

  if (voxels.length === 0) {
    return null;
  }

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <primitive attach="material" object={material} />
    </mesh>
  );
};
