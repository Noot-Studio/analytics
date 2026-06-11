# SDK Volumetric Heatmap — Design

**Date:** 2026-06-11
**Status:** Approved (pending spec review)

## Goal

Let game developers visualize spatial analytics events as a volumetric heatmap directly inside the s&box editor scene, fed by their project's confidential API key. Editor-only tooling — the key never ships in game builds or scene files. Two render modes: a raymarched fog volume (visual parity with the web dashboard's `fog-volume-canvas.tsx`) and a simpler instanced-cube fallback, toggled in the tool.

## Decisions

- **Target:** Editor-only tool (no runtime component). Key confidentiality is the driver.
- **Data access:** New API-key-authenticated read endpoints on `apps/ingest` (it already owns key validation + Redis caching). No changes to dashboard oRPC auth.
- **Editor UX:** Dockable editor window in the `analytics.editor` assembly.
- **Key storage:** `EditorCookie` (per-project, lives in user-local editor data, outside the repo). Password-style field.
- **Rendering:** HLSL raymarch shader port (mode A) plus instanced voxel cubes (mode B), selectable in the dock.

## 1. Backend — read endpoints on ingest

### `GET /v1/spatial/voxels`

- Auth: `x-api-key` header, existing ingest validation path (Redis-cached). The key resolves the project ID — no `projectId` query param.
- Query params:
  - `scene` (string, required)
  - `voxelSize` (positive number, required)
  - `from`, `to` (dates, required)
  - `eventType` (string, optional)
  - `metricKey` (string, optional) + `metricAgg` (`avg|max|min|sum`, required with `metricKey`)
  - `limit` (optional; same default and cap as the oRPC `spatial.voxels` route)
- Implementation: reuse `buildVoxelsQuery` / `voxelCenter` from `packages/api/src/spatial-query.ts` (pure query builders, no auth coupling) and the existing ClickHouse execution seam.
- Response (mirrors oRPC output): `{ voxels: [{ x, y, z, count, value }], voxelSize, truncated }`.
- Errors: 401 invalid/missing key, 400 invalid params (zod-validated).

### `GET /v1/spatial/scenes`

Same auth. Params: `from`, `to`. Returns the scene list for the dock's scene dropdown (same shape as oRPC `spatial.scenes`).

## 2. SDK editor tool (`apps/sdk/Editor`)

### HeatmapDock (dockable window)

Fields and controls:

- API key (password field, persisted via `EditorCookie`), ingest URL (default `https://ingest.sbox-analytics.com`)
- Scene dropdown (populated from `/v1/spatial/scenes`), event type, date range, voxel size
- Metric key + aggregation (optional; absent → density = event count)
- Render mode toggle: **Fog** | **Cubes**
- Fog look controls: density, falloff, raymarch steps (sliders)
- **Refresh** (re-fetch + rebuild) and **Show/Hide** buttons
- Inline status line for errors / "no data" / truncation warnings

Look-only changes (density/falloff/steps/render mode) reuse the last fetched voxel set; query-affecting changes require Refresh.

### SpatialApiClient

Thin async wrapper over `Http.RequestAsync` GETs with the `x-api-key` header; deserializes voxels/scenes responses. Surfaces HTTP status for dock error display.

### DensityGridBuilder

C# port of `buildDensityGrid` from `fog-volume-canvas.tsx`:

- Compute bounds, splat voxel intensities (count or metric value) into a float grid
- 2 passes of separable 3-tap [1,2,1] blur per axis
- Normalize against the 95th percentile of occupied cells, clamp to byte range
- `MAX_GRID_CELLS = 2_000_000` cap — refuse and report instead of allocating
- Axis mapping: s&box is Z-up natively, so **no axis swizzle** (the web version's x/z swap exists only because Three.js is Y-up). Grid axes map directly x→x, y→y, z→z.
- Pure static class: input voxel list + voxel size + useMetric, output `(byte[] data, int3 dims, Vector3 center, Vector3 size)`. Unit-testable.

### HeatmapOverlay

Owns the editor-scene visualization; created on Show, destroyed on Hide or scene change.

- **Fog mode:** one unit-cube `SceneObject` with the custom heatmap material. Uploads the density grid via `Texture.CreateVolume(nx, ny, nz, ImageFormat.R8)`, sets object position/scale to the grid's world box, pushes density/falloff/steps as attributes.
- **Cubes mode:** instanced cubes (or a single built mesh) at occupied voxel centers, colored by the inferno ramp with alpha from normalized density.

## 3. Shader (`apps/sdk/Assets/shaders/heatmap_fog.shader`)

HLSL port of the web GLSL shader, preserving its correctness guards:

- Vertex: output local-space ray origin (camera transformed into the unit-cube local space) and direction.
- Pixel: slab test against [-0.5, 0.5] cube; reject `span <= 0` and NaN spans; per-pixel hash jitter on the entry point to break banding; front-to-back emission/absorption compositing with a **fixed 256-iteration loop bound** (runtime `Steps` only trims it — prevents GPU watchdog hangs on tangent rays); inferno polynomial colormap with `clamp` before `pow` (negative-base NaN guard); early-out at alpha ≥ 0.95; divide accumulated premultiplied color back to straight alpha before output.
- Material setup: translucent, no depth write, render backfaces (camera may be inside the volume).
- Uniforms: volume texture, `Steps`, `Density`, `Falloff` via material/render attributes.
- Output color space: match whatever s&box's translucent pipeline expects; verify visually against the web render rather than assuming the web's manual gamma encode is needed.

## 4. Data flow

```
Dock Refresh
  → SpatialApiClient GET /v1/spatial/voxels (x-api-key)
  → DensityGridBuilder.Build(voxels, voxelSize, useMetric)
  → Texture.CreateVolume upload
  → HeatmapOverlay spawn/update SceneObject (position/scale = grid box)
Toggle Show/Hide → create/destroy SceneObject
Look sliders → update attributes only (no re-fetch)
```

## 5. Error handling

- 401 / invalid key → inline dock error ("Invalid API key"), no exception escape.
- Network failure → inline error with retry via Refresh.
- Empty voxel set → "No data for this query" label, overlay hidden.
- Grid exceeds cell cap → warning suggesting a larger voxel size; nothing allocated.
- `truncated: true` in response → non-blocking warning (result limit hit).

## 6. Testing

- **Ingest endpoint:** auth rejection, param validation, query-builder wiring, response shape — following existing `apps/ingest` test patterns.
- **DensityGridBuilder:** unit tests in `apps/sdk/UnitTests` mirroring the web logic — single-voxel splat, blur diffusion, percentile normalization with an outlier, cell-cap refusal.
- **Shader/overlay:** manual verification in the editor (no automated GPU tests); compare visually against the web fog volume for the same dataset.

## Out of scope

- Runtime (in-game) heatmap component.
- Dashboard/web changes.
- Live/streaming updates — fetch is manual via Refresh.
