# GridWatch Asset Bible

## Status and asset classes

This document defines the production contract for GridWatch visual assets. New race, replay, menu-scene, and editor-preview content uses the 3D contract below. Existing sprite assets remain supported only through the clearly labeled Legacy 2D contract at the end of this document.

Every runtime asset has a stable manifest ID, content hash, byte size, source revision, load priority, fallback behavior, attribution, and format-specific metadata. Source filenames may change during production; stable manifest IDs and document references do not.

## 3D coordinate, unit, and transform contract

- Runtime world coordinates are right-handed, measured in meters, with `+Y` up, `+X` right, and `+Z` forward relative to an authored vehicle or object. Babylon scenes enable right-handed coordinates before asset or camera creation.
- glTF/GLB is the runtime 3D format. Export with units converted to meters. One glTF unit equals one meter.
- Apply object scale before export. Runtime root nodes have scale `(1, 1, 1)`, zero rotation, and no baked negative scale. Mirrored geometry is applied before export so tangent space and collider winding remain valid.
- Keep asset-local geometry within 10 km of its origin. Circuit placement uses double-precision authoring/compilation inputs and engine-relative scene placement where required; authored scenery does not use arbitrary world offsets.
- Mesh forward direction, sockets, wheel axes, and camera orientation are checked in an automated asset-validation scene. A labeled axes fixture accompanies every DCC export preset.
- glTF cameras look down local `-Z` with local `+Y` up. Authored camera markers store their world pose through the document contract; the renderer adapts that pose once at its engine boundary.

### Export from Blender

- Author in metric units with Unit Scale `1.0`. Model vehicles facing Blender `-Y` and export with `+Y Up`; the approved export preset must produce runtime `+Z` forward.
- Apply rotation and scale on render meshes before export. Preserve transforms only on animated pivots, sockets, and the required root hierarchy.
- Triangulate deterministically during the controlled export step, generate tangents for normal-mapped meshes, and inspect face normals before delivery.
- Deliver the `.blend` source, exported `.glb`, texture sources, generated compressed textures, a preview render, license/attribution record, and validator report under one asset revision.

## Naming

Use lowercase stable IDs with dot-separated namespaces. Use lowercase snake case for glTF node and material names so runtime binding does not depend on a DCC-generated suffix.

```text
vehicle.formula.reference
vehicle.formula.reference.lod0
scenery.parkland.grandstand_a
material.track.asphalt_dry
camera.parkland.turn_04_exit
```

Required file patterns:

```text
<asset-id>.lod0.glb
<asset-id>.lod1.glb
<asset-id>.lod2.glb
<asset-id>.<map>.<colorspace>.ktx2
<asset-id>.collision.glb
```

Allowed map labels are `basecolor`, `normal`, `orm`, `emissive`, `livery_mask`, and `decal`. Do not use names such as `final`, `new`, or DCC duplicate suffixes as stable runtime identity.

## Vehicle rig and physical alignment

### Origin and bounds

- `vehicle_root` is at ground level on the longitudinal centerline, halfway between front and rear axle centers. At rest on a flat road, its local position is `(0, 0, 0)` and its forward direction is `+Z`.
- The visible chassis, physics chassis dimensions, center-of-mass offset, wheelbase, track widths, wheel radii, and rest suspension lengths are recorded in the versioned `VehicleSpec`. The asset validator compares named nodes against that specification.
- Visual bodywork may extend beyond the physics chassis, but no visible wheel, cockpit, or primary wing may sit outside its declared specification bounds without a reviewed exception.

### Required hierarchy and pivots

```text
vehicle_root
├── chassis_visual
├── driver_visual
├── suspension_fl
│   └── steering_fl
│       └── wheel_fl
├── suspension_fr
│   └── steering_fr
│       └── wheel_fr
├── suspension_rl
│   └── wheel_rl
├── suspension_rr
│   └── wheel_rr
├── socket_camera_cockpit
├── socket_camera_chase
├── socket_effect_exhaust
└── socket_effect_floor
```

- Wheel origins sit at axle centers. The local axle and rolling rotation axis is `+X`; zero rotation has the tire upright and pointed along `+Z`.
- Front steering pivots rotate about local `+Y`. Wheel roll remains on the child wheel node so steering and rotation compose without changing axes.
- Each `suspension_*` node begins at the corresponding rest contact assembly position. Runtime suspension visualization translates it along its defined local up axis; movement range must match `VehicleSpec` maximum compression and droop.
- Add chassis anchor empties `anchor_suspension_fl`, `anchor_suspension_fr`, `anchor_suspension_rl`, and `anchor_suspension_rr`. Their coordinates are the ray origins used by the physics setup. Visual wheel centers at rest must be directly below their matching anchors.
- Camera and effect sockets contain no render geometry. Cockpit placement must clear the helmet and steering animation across the full approved field of view.
- Steering wheel, helmet, and exposed suspension parts may be separate animated nodes. Animation clips cannot drive authoritative vehicle translation, yaw, pitch, or roll.

## Materials and liveries

The reference vehicle uses a fixed material-slot contract:

| Slot | Purpose | Runtime variation |
| --- | --- | --- |
| `gw_body_livery` | Main body with the packed livery-mask texture | Team primary, secondary, tertiary, and driver-accent RGB inputs |
| `gw_decal` | Fictional marks, number, fixed line work | Approved per-team texture |
| `gw_carbon` | Wings, floor, suspension, carbon body parts | Shared neutral material |
| `gw_tire` | Tire tread and sidewall | Shared neutral material |
| `gw_wheel` | Rim and hardware | Shared neutral material with optional team accent |
| `gw_glass` | Visor and windscreen | Shared transparent material |
| `gw_emissive` | Approved lights only | State-controlled, off by default |

- Author metallic-roughness PBR materials. Use physically credible base values and judge them in the neutral validation scene plus the brightest and darkest launch circuits.
- Team colors are stored in linear-aware material inputs derived from sRGB source values. Do not bake illumination, shadows, or environment reflections into livery colors.
- `livery_mask` uses red = primary, green = secondary, blue = tertiary, alpha = driver/accent allocation. Channels have hard ownership and no overlapping interpretation.
- Decals contain fictional marks and car numbers. Maintain readable number placement in chase, onboard exterior, trackside, results preview, and editor cameras.
- Transparent materials are limited to glass, fencing where alpha testing is insufficient, and approved effects. Prefer alpha clipping for foliage and fences to control sorting cost.
- A material slot cannot be renamed after content freeze. Additive slots require a manifest/schema revision and fallback mapping.

## Textures and compression

- Runtime color textures are sRGB: `basecolor`, `decal`, and emissive color. Data textures are linear: `normal`, `orm`, and `livery_mask`.
- Pack ambient occlusion in `orm.R`, roughness in `orm.G`, and metallic in `orm.B`. Unused channels have explicit constant values rather than unrelated data.
- Supply KTX2/Basis textures for runtime. Use UASTC for vehicle normals, livery masks, decals, and other sharp authored detail; use ETC1S for broad scenery color with acceptable artifact review. The manifest records compression mode and fallback.
- Preserve mipmaps for every 3D texture. Normal-map mipmaps must be generated with normal-aware filtering. Prevent color bleeding at livery-mask and decal atlas boundaries with padding.
- Standard maximum dimensions are 2048² for a vehicle body set, 1024² for a helmet, 2048² for a unique hero scenery set, and 1024² for repeatable scenery. A 4096² texture requires an asset-budget exception and visible benefit in the reference camera suite.
- Share carbon, tire, glass, track-surface, foliage, and common architecture materials. The eleven liveries vary compact masks/colors/decals instead of duplicating full neutral material sets.
- PNG/WebP sources can serve UI thumbnails and documented fallbacks. Uncompressed PNG/JPEG is not the primary runtime texture path for 3D production assets.

## Geometry, LOD, and collision

| Asset class | LOD0 | LOD1 | LOD2 | Collision |
| --- | ---: | ---: | ---: | --- |
| Formula vehicle | ≤ 70k triangles | ≤ 30k | ≤ 10k | Versioned physics primitives from `VehicleSpec`, not render mesh |
| Helmet/driver combined | ≤ 18k | ≤ 8k | ≤ 2.5k | None |
| Large grandstand/building module | ≤ 60k | ≤ 20k | ≤ 5k | Separate simple hulls/boxes |
| Small trackside prop | ≤ 12k | ≤ 4k | ≤ 1k | Separate primitive or none |
| Tree/shrub | ≤ 8k | ≤ 2.5k | Cross-card/impostor | None |

- LOD files share root orientation, origin, material-slot names, sockets required at that LOD, and a conservative bounding volume. Switching LOD must not shift the visible asset.
- Select vehicle LOD primarily by projected length: LOD0 at 240 px and above, LOD1 at 96–239 px, and LOD2 below 96 px. Add hysteresis of 15% to prevent oscillation. Circuit props use equivalent projected-size bands established by their validation captures.
- Use the approved geometry compression path recorded in the manifest. Meshopt is the default for static and vehicle mesh data; a different codec requires loading and both-deployment validation.
- Road driving surfaces and barriers are compiler products from `TrackDocumentV3`, not artist-authored render-mesh collisions. Scenery collision is included only where the track document marks the instance as collidable.
- Collision meshes use closed, simple convex pieces where possible, contain no thin decorative detail, and follow the same transform contract as their visual asset.
- Geometry budgets are maximums, not targets. Alpha approval also considers draw calls, material count, bone count, memory, shader complexity, and measured frame time with twenty-two cars.

## Scenery kits and instancing

- Build each venue from reusable kit pieces with grid-compatible pivots, predictable bounds, shared materials, and color variants. Unique landmarks are reserved for orientation and circuit identity.
- Instance repeated barriers, fence segments, lights, trees, shrubs, seats, signs, and service props. Instance candidates share mesh, material, shadow mode, and LOD policy; per-instance variation is limited to transform and approved compact parameters.
- Place the pivot at the logical ground contact: center-bottom for props, beginning-centerline for linear modules, and documented hinge/contact point for moving elements.
- Do not bake instance placement into a unique circuit-wide mesh when the editor must select, move, hide, or validate those objects individually.
- Merge only static background groups that share material and never need independent selection, LOD, collision, or visibility. Preserve source grouping so exports remain reproducible.
- Vegetation variation uses approved scale/color ranges and deterministic instance seeds. Random generation cannot move scenery into runoff, sightline, camera, or barrier clearance zones.
- Shadows are enabled by importance tier. Vehicles and track-edge structures receive the highest priority; distant foliage and interior seating default to baked or disabled shadows.

## Circuit surfaces and environment

- The track compiler owns road ribbon, elevation, banking, curbs, runoff, barriers, timing gates, and physical surface assignment. Art layers add materials and nonauthoritative detail without changing the driveable shape.
- Asphalt, curb, concrete, grass, gravel, and barrier materials remain distinguishable by luminance, texture, edge, and silhouette as well as hue.
- Repeated materials use world-scale UVs or documented trim sheets so texture density remains stable across all six circuits. Target visible texel density is 512 px/m for near vehicle hero surfaces and 256 px/m for normal trackside observation; lower densities are acceptable beyond broadcast reach.
- Use decals for braking marks, patches, grid labels, seams, and controlled wear. Decals must have bounded lifetime/count when created by race events.
- Lighting probes, reflection data, sky/environment maps, and baked light data include their circuit revision. Missing optional lighting assets fall back to the neutral circuit lighting rig; missing road or collision products block race loading.
- Track crossings and bridges over the racing surface are outside launch scope. Compiler validation rejects overlapping driveable ribbons.

## Camera and broadcast readability

- Camera placements include stable ID, position, orientation or target rule, field-of-view range, near/far planes, framing purpose, and safe-zone classification.
- Trackside cameras show an approach, decision point, and exit wherever possible. Avoid foliage/fence occlusion, poles through the racing line, horizon roll, and cuts that reverse screen direction without an establishing view.
- Chase camera sockets preserve the whole vehicle silhouette at default field of view and avoid clipping at maximum suspension travel. Onboard cameras retain a useful horizon and car reference.
- Validate every production circuit with automatic broadcast, overview, selected-driver chase, onboard, and each trackside camera using a full twenty-two-car grid.
- At reference 16:9 view, reserve the top 72 px, left/right 336 px when the timing rail occupies that side, and bottom 96 px for interface safe zones. At compact desktop width and 130% UI scale, the camera director obtains current safe-zone rectangles from presentation code rather than assuming fixed pixels.
- Critical action cannot depend on texture detail smaller than 4 px at its expected camera distance. Team identification remains possible from primary color block plus number/code in the accompanying UI.
- Test brightest/darkest lighting, Dark/Light UI, color-vision simulations, particle-heavy incidents, and low graphics quality. Effects, bloom, exposure, foliage, and shadows cannot hide timing gates, the selected vehicle, or a car-to-car contact.

## Asset packaging and validation

- Manifest entries for 3D assets declare class, source revision, content hash, bytes, GLB bounds, unit scale, forward/up axes, LODs, materials, texture dependencies, compression, preload priority, fallback, and attribution.
- Race-critical content includes the circuit compiler output, vehicle collision/specification, visible vehicle LOD, and required materials. Missing or invalid critical content produces a recoverable loading error; it does not silently substitute different physical content.
- Visual-only fallbacks preserve stable dimensions and identity. A missing team decal may fall back to its palette-only livery; a missing circuit thumbnail may fall back to a generated contour.
- Validate glTF structure, finite transforms, bounds, unit scale, node/material names, pivots, sockets, texture color space, compression, triangle/material counts, duplicate IDs, hashes, attribution, and identical Sites/IIS asset bytes.
- Review assets in the neutral validation scene, relevant editor preview, representative live race, replay, and results. Vehicles additionally pass all wheel/suspension extremes; scenery additionally passes instance/LOD transitions; cameras pass full-grid occlusion review.
- Retain source and exporter version information so assets can be rebuilt. Generated output is never hand-edited after export.

## Legacy 2D asset contract

This section applies only to the existing sprite runtime, legacy archive previews, and temporary fallback UI during migration. It does not define new 3D production content.

### Camera and scale

- Race sprites use a true top-down camera; Live Timing cars use a consistent left-facing lateral view.
- Author raster sources at 4× runtime size and export transparent SVG, WebP, or PNG variants.
- Preserve recognizable silhouettes at the minimum rendered sizes: 18 px wide in Live Timing and 10–16 px long on the circuit.

### Lighting and materials

- Light comes from the upper-left at a shallow angle. Shadows fall down-right, use neutral black, and remain soft enough not to read as track geometry.
- Asphalt uses low-contrast aggregate and directional wear. Curbs use clean alternating paint with subtle edge wear.
- Grass, gravel, concrete, barriers, and pit surfaces remain distinguishable without relying only on hue.

### Sprite palette masks

- Blue (`#0066ff`) maps to the team primary color.
- Green (`#00cc44`) maps to the team secondary color.
- White (`#ffffff`) maps to the team third color.
- Red (`#ff0000`) maps to the driver helmet color.
- Yellow mask pixels are removed and become transparent.
- Tires, carbon, outlines, shadows, and highlights use neutral values outside these masks.

### Readability and runtime requirements

- Team palettes maintain visible luminance separation between primary, secondary, and third colors.
- Critical status does not rely on team color alone; pair color with text, icons, patterns, or shape.
- Avoid details thinner than one runtime pixel and test against Dark and Light UI themes.
- Legacy assets require stable manifest IDs and a fallback entry.
- Imported sprites remain limited to 10 MB and 4096×4096 decoded pixels.
- Race-critical legacy sprites preload and decode through the shared sprite service.
- Existing synchronized primary and IIS public copies remain covered by artifact validation for as long as the legacy path is shipped.
