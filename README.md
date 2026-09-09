# GridWatch

GridWatch is a browser-based Formula-style racing simulator built around spectatorship rather than driving. Every car is controlled by deterministic racing logic while the player watches the complete event from a fixed top-down view, manages the presentation, and creates custom racing content.

The project is currently a working alpha/technical vertical slice. Its race, championship, physics, broadcast, editor, asset, and deployment paths are functional and tested, but several advanced domain models and editor controls still need to be connected fully to the playable runtime.

## Product purpose

GridWatch is intended to provide the tension and progression of a motorsport broadcast without requiring the player to drive. The player acts more like a spectator or race director: choosing the event, controlling playback, following timing and battles, and reviewing results.

The artificial intelligence is a deterministic rules-and-state-machine system. It is not machine learning or generative AI.

## Current game features

### Race formats

- **Single Race** with a selected or randomly chosen circuit.
- **Championship** with 2–50 unique rounds and no repeated circuit in one season.
- Manual championship progression or unattended **Auto Broadcast** playback.
- Formula-style championship scoring: 25–18–15–12–10–8–6–4–2–1.
- Championship standings ordered by points, wins, and best finishing results.
- Round-boundary championship recovery through browser storage.

### Event configuration

- A clean circuit catalog: circuits are created and saved by the player in the Circuit Editor.
- Selectable official or custom competition categories.
- 3, 6, 9, or 12 race laps.
- Configurable grid size based on the selected category.
- A shipped 22-driver fictional **Mini Formula** category.
- 1×, 2×, and 4× simulation speeds.

### Racing simulation

- Deterministic 2D rigid-body physics using Rapier and WebAssembly.
- A 120 Hz physical simulation stepped through a fixed-timestep browser loop.
- Physical vehicle values for mass, dimensions, steering, engine force, braking, grip, downforce, drag, and rolling resistance.
- Arc-length track compilation shared by physical placement, AI targets, boundaries, and grid slots.
- Racing-line calculation, corner-speed planning, braking, steering, and recovery.
- Following, closing, attacking, side-by-side racing, and overtaking behavior.
- Per-race performance variation, driver mistakes, line errors, mechanical issues, and retirements.
- A simpler deterministic driving model used as a fallback when the physical engine cannot initialize.

### Spectator and broadcast presentation

- Responsive full-circuit Canvas rendering with a fixed top-down camera.
- Live timing with position, driver, team color, gap, championship points, and race status.
- Race clock, lap counter, leader, and best-lap telemetry.
- Closest-battle, overtake, fastest-lap, mechanical-issue, and final-lap callouts.
- Countdown lights, winner presentation, final classification, championship standings, and champion screen.
- Pause, resume, restart, next-event, and menu controls.
- Optional F3 simulation diagnostics overlay.
- Procedural Web Audio for engines, ambience, countdown, tire, impact, and finish effects.
- Dark and light interface themes.

## Creation tools

### Circuit editor

The Circuit Editor is chunk-based rather than point-based. It currently supports:

- Dragging predefined straights, curves, chicanes, pit-lane, escape, and terminal chunks onto a world-coordinate canvas.
- Connecting `Input`, `Output`, `Secondary Input`, and `Secondary Output` ports with tangent-aware snapping.
- Closed-loop validation: every ordinary chunk must have a connected input and output, and the main route must return to its start/finish anchor.
- Generated racing lines that the player can edit and confirm before saving.
- Starting-grid and pit-box placement, including shared pit-box route metadata.
- Per-chunk curb modes: none, left only, right only, or both sides.
- Versioned SVG chunk imports with script, external-reference, and event-handler safeguards.
- Zoom and grid snapping without changing persisted circuit aspect, size, or layout.
- Browser-local IndexedDB persistence for circuits and imported chunks.

### Competition editor

The competition editor currently supports:

- Custom categories, teams, and drivers.
- Driver identity, number, team, helmet color, and grid ordering.
- Skill, aggression, consistency, cornering, overtaking, defense, and risk attributes.
- Selected vehicle physics values.
- Team livery palettes and top/lateral sprite previews.
- JSON category import/export.
- SVG, PNG, and WebP sprite import/export with size and basic safety validation.
- Local draft autosave, recovery, validation, and protected official content.

## Circuit catalog

The shipped circuit catalog is intentionally empty. This clean-slate flow makes the Circuit Editor the source of truth: a race becomes available after the player saves a valid closed circuit with a confirmed racing line, starting grid, and pit-box definition.

The built-in chunk kit is backed by the versioned `/public/assets/track-chunks.svg` atlas. Imported SVG chunks are stored separately in IndexedDB and remain reusable across circuits.

## Engine and technology

GridWatch does not use Unity, Unreal Engine, or Godot. It is a custom web game built from the following components:

| Area | Technology |
| --- | --- |
| UI | React 19 and TypeScript |
| Application framework | Next.js 16 App Router APIs |
| Build/runtime adapter | Vinext and Vite 8 |
| Rendering | HTML Canvas 2D, CSS, and SVG |
| Physics | `@dimforge/rapier2d-deterministic` via WebAssembly |
| Audio | Web Audio API |
| Styling | Tailwind CSS processing plus a custom CSS design system |
| Testing | Node test runner and Playwright/Chromium |
| Optional data layer | Drizzle ORM with a Cloudflare D1 scaffold |
| Hosted runtime | Cloudflare-compatible ESM Worker |
| Static runtime | Standalone Vite build for IIS |

The main implementation languages and formats are TypeScript/TSX, CSS, JavaScript ESM, SVG, JSON, HTML, PowerShell, shell scripts, batch, and IIS XML configuration.

## Architecture

The application currently runs as a single-route, client-driven game shell:

1. React owns menus, settings, editors, race presentation, and event progression.
2. Track documents are compiled into physical samples, boundaries, grid positions, and speed targets.
3. The world race engine converts driver attributes and traffic context into vehicle controls.
4. Rapier advances the physical world deterministically at 120 Hz.
5. The Canvas renderer draws the full circuit and the current physical car positions.
6. React updates timing and broadcast UI at a lower frequency than the simulation loop.
7. Versioned browser repositories store custom content, theme selection, drafts, and championship recovery.

The Cloudflare Worker in `worker/` is the application hosting entry point. It is not currently a separate race-simulation worker.

## Persistence and online services

The playable product is currently local-first:

- Circuits and imported SVG chunks are stored in IndexedDB; the old localStorage circuit catalog is cleared by a one-time migration marker.
- Competition drafts and championship recovery are stored locally.
- The selected theme is stored locally.
- No account is required to play.
- No gameplay data is currently written to a server.

ChatGPT authentication helpers, Drizzle/D1 integration, a versioned race-worker protocol, and replay document validation exist as architectural foundations. They are not connected to a player-facing account, database, simulation worker, or replay library yet.

## Explicit scope boundaries

The current product does not include:

- Manual driving or vehicle control.
- Online multiplayer.
- Career progression.
- VR support.
- Qualifying sessions.
- Online pit strategy, tire wear, or fuel strategy authoring outside the category rules editor.
- Dynamic weather or safety-car behavior.
- Elevation and banking.
- A usable replay recording or playback interface.

## Current assessment

### Strengths

- A distinctive, coherent spectator-first game concept.
- A genuinely integrated deterministic physics path rather than purely cosmetic car animation.
- Stable simulations across seeds, circuit styles, and 12-, 16-, and 22-car test grids.
- Useful race broadcast information and unattended championship playback.
- Substantial circuit and competition creation workflows.
- Versioned local data and runtime asset manifests.
- Cloudflare/Sites and IIS deployment targets sharing the same game implementation.
- Strong type checking, linting, simulation tests, artifact tests, and a real browser smoke flow.

### Known gaps and risks

- Imported SVG scenery is authored and persisted as chunk art; full decorative scenery rendering remains outside the race canvas.
- The runtime compiles the authored chunk document into the existing physical-track adapter while the route graph is kept alongside it for pit/escape state transitions.
- Timing-sector and surface-zone authoring remain outside the current chunk editor.
- Competition sprite-scale controls affect editor previews but not live race rendering.
- Vehicle `reliability` and `brakeBias` are modeled but do not currently affect race behavior.
- Race defaults and the general audio preference do not persist across a normal page reload; championship recovery stores an audio flag but does not restore it.
- Race orchestration is concentrated in a large `GameShell.tsx`, while the tested reducer and session controller are not yet the live lifecycle authority.
- Replay, worker-protocol, authentication, and database modules are currently disconnected from gameplay.
- Several quality tests validate source patterns rather than end-user behavior.
- The browser suite is a broad smoke test, not a complete race/championship acceptance suite.
- Some dense interface typography is below the desired readability target and needs a dedicated accessibility and 200% text audit.
- The primary IIS JavaScript bundle is close to the repository's current 400 KB budget.
- A root project license and consolidated third-party notice are still required before public distribution.

## Development status

GridWatch should currently be treated as a working alpha. The highest-priority development work is:

1. Promote the authored route graph to the sole live-race geometry source instead of using the compatibility adapter.
2. Make every exposed editor and settings control have a persistent, observable runtime effect.
3. Split lifecycle, simulation, rendering, audio, persistence, and championship orchestration into clearer boundaries.
4. Replace source-pattern contracts with behavioral, persistence, accessibility, and complete-event tests.
5. Decide whether replay, worker, authentication, and database foundations belong in the near-term product and either integrate or defer them explicitly.
6. Complete documentation, licensing, accessibility, performance, and release-readiness work.

## Development documentation

The `docs/` directory is the authoritative location for development directives, requirements, architecture decisions, design guidelines, quality standards, roadmaps, and sprint plans. This README describes the product and its current implementation; detailed rules for future development should live under `docs/` and be linked here as they are established.

## Getting started

### Requirements

- Node.js 22.13.0 or newer.
- npm.
- Playwright Chromium when running the complete browser verification suite.

### Common commands

```bash
npm ci
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Vinext/Vite development environment. |
| `npm run build` | Build and validate the Cloudflare/Sites Worker artifact. |
| `npm run build:iis` | Build the standalone IIS artifact into `iis-dist/`. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm run lint` | Run ESLint. |
| `npm run test:unit` | Run the focused domain and simulation unit suites. |
| `npm run test:browser` | Build the IIS target and run the Playwright smoke flow. |
| `npm run verify` | Run the complete type, lint, asset, build, contract, and browser gate. |

## Verification baseline

During the project assessment on 2026-09-08, `npm run verify` completed successfully:

- TypeScript and ESLint passed.
- 12 versioned runtime assets were validated.
- The Cloudflare/Sites and IIS production builds passed.
- 52 Node tests passed, including chunk-document, route-controller, and strategy coverage.
- 1 Playwright Chromium test passed.

This baseline confirms that the checked-in implementation builds and that its core deterministic simulation contracts are healthy. It does not replace complete gameplay, accessibility, compatibility, security, or release acceptance testing.

## Repository map

| Path | Responsibility |
| --- | --- |
| `app/game/` | Main game shell and session-state foundations. |
| `app/simulation/` | Track compilation, speed profiles, Rapier vehicle physics, and race AI. |
| `app/race/` | HUD, live timing, race actions, broadcast callouts, and results. |
| `app/championship/` | Championship presentation and Auto Broadcast timing. |
| `app/domain/` | Versioned vehicle, track, race protocol, replay, and championship contracts. |
| `app/editor/` | Editor commands and focused editing components. |
| `public/assets/` | Versioned sprites, materials, effects, and scenery assets. |
| `tests/` | Domain, simulation, artifact, quality-contract, and browser tests. |
| `worker/` | Cloudflare/Vinext hosting entry point. |
| `iis/` | Static IIS application entry point and server configuration. |
| `db/` | Optional Drizzle/D1 scaffold; currently no application schema. |
| `docs/` | Development directives, requirements, architecture, design, and planning documents. |
