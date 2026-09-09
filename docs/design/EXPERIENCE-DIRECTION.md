# GridWatch Experience Direction

## Status and purpose

This document fixes the visual and interaction direction for the 3D transformation. It is normative for product UI, race presentation, circuit art, vehicle art, effects, and editor previews. The intended experience is a clear motorsport broadcast that happens to be interactive: the simulation supplies the facts, cameras reveal the action, and the interface explains the race without competing with it.

The direction evolves the current GridWatch identity. Keep the compact wordmark, near-black and warm-white surfaces, red accent, condensed uppercase timing labels, precise numeric hierarchy, circuit-grid motif, and team-color identity. Replace flat full-circuit illustration and large menu cards with dimensional circuit scenes, restrained broadcast panels, meaningful depth, and stronger transitions between preparation, live racing, and review.

## Experience principles

1. **The race remains readable.** Position, lap, gap, selected driver, race status, and active camera are always understandable. Effects and scenery never conceal a car or timing event.
2. **The simulation remains credible.** Suspension, banking, elevation, speed, contact, and recovery have visible causes. Camera movement and sound reinforce the physical state instead of inventing it.
3. **The interface behaves like one system.** Menus, live timing, results, replays, and editors share typography, spacing, controls, status language, focus treatment, and error behavior.
4. **Motion has information value.** Movement introduces hierarchy, follows race action, or confirms state. Decorative looping motion is limited to low-amplitude ambient scenes and is removed by Reduced Motion.
5. **Team identity survives every view.** A car, helmet, timing row, result row, and replay bookmark use the same team and driver identifiers. Color is reinforced with code, name, number, or shape.
6. **Creation tools show the runtime truth.** Editor previews use the same materials, camera rules, lighting baseline, and compiled geometry as racing.

## Visual language

### Form and composition

- Use broad full-bleed 3D circuit imagery behind a stable interface frame. Reserve dense panels for timing, setup, and editing data.
- Base compositions on an asymmetric broadcast grid: a dominant scene, one primary information rail, and small anchored status surfaces. Avoid equally weighted card mosaics.
- Use one-pixel rules, narrow red markers, clipped image crops, and tabular alignment to preserve the current telemetry character.
- Use corner radii from the token system. Race graphics favor smaller radii; menus and dialogs may use medium radii. Avoid pill shapes except for short statuses, filters, and compact segmented choices.
- Keep decoration quiet: low-contrast grids, track-map contours, timing ticks, and subtle surface grain. Do not use faux carbon fiber, neon glows, lens dirt, or persistent chromatic distortion.

### Color and light

- Dark theme is the reference art direction. Near-black green-neutral surfaces frame warm white type and GridWatch red. Light theme retains the same hierarchy with paper-like cool neutral surfaces.
- GridWatch red identifies primary actions, current selection, live state, and brand moments. It does not fill large backgrounds or represent every warning.
- Race-status colors are semantic and remain independent of team liveries. Every status includes a label or icon.
- Circuit lighting uses a late-afternoon neutral sun for the reference vertical slice: long readable shadows, controlled highlights, and enough ambient fill to retain car silhouettes. Each circuit may vary atmosphere while maintaining neutral material evaluation.
- Post-processing remains restrained. Tone mapping, ambient occlusion, anti-aliasing, and subtle bloom on lamps are acceptable. Depth of field is limited to noninteractive introductions and replays; motion blur must not obscure vehicle identity.

### Typography and data

- Display type carries event names, navigation destinations, and major results. Interface type carries controls and prose. Tabular numerals carry timing, laps, positions, and telemetry.
- Uppercase is limited to labels, short statuses, driver codes, and compact actions. Sentences, validation, instructions, and recovery messages use sentence case.
- Live timing aligns changing figures and reserves their maximum expected width so updates do not reflow the panel.
- Use `—` only when a value is unavailable, `+0.000` for intervals, `1:23.456` for lap time, and `P01` through `P22` where a compact position prefix is needed.

## Scene and circuit identity

All six launch circuits belong to one stylized-realistic world. Geometry, materials, and lighting are physically plausible; shapes and colors are simplified enough to read at broadcast distance. Surface wear is selective, large forms lead detail, and each venue has a distinct silhouette.

| Venue | Dominant identity | Palette and landmarks |
| --- | --- | --- |
| Parkland reference | Flowing, established racing estate | Deep foliage, pale stone, red-white curbs, lake and pedestrian bridges outside the racing surface |
| Technical club | Compact and mechanical | Concrete paddock, close fencing, service buildings, blue-gray barriers |
| High-speed | Open and aerodynamic | Long sightlines, low grandstands, dry grass, large braking boards |
| Urban waterfront | Dense and reflective | Water edge, civic facades, hard barriers, controlled lamp reflections |
| Desert | Sparse and heat-shaped | Sandstone, pale runoff, fabric shade structures, distant terrain haze |
| Elevation | Vertical and exposed | Rock cuts, forest bands, retaining walls, clear crest and valley silhouettes |

Track crossings and bridges over racing surfaces remain outside launch scope. Decorative pedestrian bridges must never be compiled as a second driveable road.

## Vehicle and effects direction

- Use one recognizable Formula-style vehicle silhouette with exposed wheels, a compact cockpit, clear front/rear wing masses, and visibly working suspension. Team identity comes from liveries, helmet design, number, and small material accents rather than different performance silhouettes.
- Favor clean color blocks at distance. Sponsor-like marks are fictional, sparse, and subordinate to number and team identity.
- Tire smoke communicates locked or sliding contact; dust and gravel communicate surface departure; sparks communicate floor or barrier contact; debris is limited and nonpersistent. Effects scale with the simulation event and have firm lifetime limits.
- Damage presentation at launch is status-led and cosmetic. Do not depict detached safety-critical components unless the simulation has the corresponding physical and retirement behavior.
- Wheel rotation, steering angle, suspension travel, pitch, roll, and contact shadows must agree with simulation snapshots.

## Broadcast presentation

- Automatic broadcast is the default authored view. Its shot sequence favors the selected battle, leader, incidents, final lap, and finish, with enough hold time to understand relative motion.
- Trackside cameras use stable horizons and frame approach, apex, and exit. Chase and onboard cameras expose elevation and suspension without excessive vibration. Full-circuit overview is functional and geographically clear.
- Manual camera selection is always visible and reversible. The user can follow a driver without losing live timing context.
- Race graphics occupy stable safe zones: event/lap across the top, live timing at a side, focused-driver or battle data near the lower corners, and transient events away from the car pack.
- Introductions and results may use stronger crops and slower camera motion. Live race cameras prioritize continuity over spectacle.

## Navigation and editor expression

- Home uses a live or recorded circuit scene with one dominant continuation or Quick Race action and a compact destination rail.
- Setup screens pair a readable configuration column with an immediate circuit/grid preview. Advanced controls disclose in place and do not create extra pages.
- Replays use poster frames derived from their recorded circuit and camera data. Missing imagery falls back to a branded track contour, never a blank rectangle.
- Workshop separates Circuits and Competitions at its first level. Both editors use the same frame: library, viewport, inspector, validation, and persistent save state.
- Editors are work surfaces rather than broadcast scenes. Reduce atmosphere, preserve material truth, and use neutral environment light so geometry and liveries can be judged accurately.

## Motion and transition grammar

Use the durations and curves in `DESIGN-TOKENS.md`.

- Route entry: content fades and translates 8 px; the shared background remains stable.
- Panel disclosure: opacity plus 4 px translation or height reveal; no spring overshoot.
- Selection: border/color change within the fast duration; no layout movement.
- Broadcast cut: direct cut for incidents and close action; short dissolve for introductions, calm establishing views, replay entry, and results.
- Race event callout: enter once, hold long enough to read, exit without blocking controls. Repeated snapshots must not restart it.
- Reduced Motion: use direct state changes or opacity-only transitions no longer than 100 ms. Disable ambient pans, parallax, animated grids, camera shake, and automatic focus pulls.

## Quality bar

A screen or scene is ready for product review only when:

- hierarchy is understandable at 1280×720, 1920×1080, and 2560×1440;
- live race data stays legible over the brightest and darkest approved circuits;
- team and status identity survives color-vision simulation and grayscale review;
- keyboard focus, 200% browser zoom, every UI scale, and Reduced Motion have been reviewed;
- loading, empty, error, and recovery states use finished layouts and plain corrective language;
- production assets meet `ASSET-BIBLE.md`, with no placeholder geometry or unregistered texture in acceptance captures;
- camera cuts, effects, and audio cues trace to recorded race state; and
- the same content reads correctly through WebGPU and WebGL2 within the approved visual tolerance.

The direction excludes manual driving controls, multiplayer lobbies, qualifying, pit strategy, tire wear, dynamic weather, safety cars, and unrestricted asset import.
