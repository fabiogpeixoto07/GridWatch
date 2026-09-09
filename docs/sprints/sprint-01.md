# Sprint 01 — Foundation and Contracts

- Branch: `codex/sprint-01-foundation-contracts`
- Base branch: `feat_Refactoring_001`
- Base commit: `bebc5317d3c8eb43f7e6992387f12e3ea2ac4691`
- Final commit: recorded in the Sprint 02 handoff after the official commit is created
- Status: passed

## Committed scope

Sprint 01 establishes executable race and replay contracts, deterministic seeded randomness, the transformation architecture and experience direction, mandatory browser CI, test classification, and reproducible baseline measurements. It does not change the shipped player experience or introduce the Babylon.js and Rapier 3D runtime dependencies scheduled for Sprint 03.

## Delivered behavior

- Defines validated, versioned commands and worker messages for initialize, start, pause, resume, playback rate, restart, abort, and disposal. Worker acknowledgements carry the authoritative tick and lifecycle state.
- Defines validated snapshots and events for car and wheel poses, timing, classification, collisions, overtakes, retirements, and race completion.
- Defines a camera-independent `ReplayDocumentV1` with immutable roster, frame, event, revision, and final-classification data.
- Adds a platform-stable seeded random generator with serializable state for deterministic worker and replay behavior.
- Freezes subsystem ownership, coordinate/time conventions, UI navigation, visual direction, design tokens, and the 3D asset contract before live migration begins.
- Replaces the optional browser smoke runner with mandatory Playwright Chromium coverage and makes it part of `npm test`, `npm run verify`, and CI.
- Adds a repeatable source, artifact, simulation, memory, and 22-car fixture baseline command.
- Makes hash-governed runtime asset bytes reproducible across Windows checkouts with narrow LF rules.

## Public contracts and migrations

- `RaceCommand`, `RaceSnapshot`, `RaceEvent`, and worker envelope contracts begin at protocol version 1. Every message includes session, engine, and content-revision identity.
- `ReplayDocumentV1` begins at replay version 1 and intentionally excludes camera selection.
- Authoritative simulation time is a 120 Hz non-negative integer tick. World space is right-handed, Y-up, meters, radians, kilograms, seconds, and Newton-derived units.
- No persisted document migration or player-facing route changes occur in this sprint. Binary snapshot encoding is deferred to Sprint 6 behind the semantic contract.

## Tests and quality evidence

- `npm ci` completed from the lockfile.
- `npm run verify` passed on Windows with Node 24.18.1: typecheck, lint, asset validation, Sites build, IIS build, 48 Node tests, and one Playwright Chromium flow.
- The browser flow covered menus, championship Auto Broadcast, appearance settings, both editors, race setup/start, timing, controls, Rapier status, and canvas output. Result: 1 passed in 9.4 seconds with no skip.
- Five new behavioral contract tests cover commands, worker messages, corrupt snapshot/event rejection, replay validation, and seeded-random restoration.
- `git diff --check` passed. Source-text tests remain inventoried with explicit behavioral replacement targets.

## Performance or visual evidence

- Baseline source: `GameShell.tsx` is 96,035 bytes and 2,138 lines; `app/` contains 45 files totaling 458,906 bytes.
- Baseline IIS artifact: 1,833,110 raw bytes and 612,644 gzip bytes. Its largest JavaScript bundle is 398,750 raw bytes and 124,005 gzip bytes; Rapier WASM is 1,209,625 raw bytes and 447,032 gzip bytes.
- Baseline 22-car fixture: 1,200 fixed steps at 120 Hz (10 simulated seconds), 76.083 m average progress, 272.308 m leader progress, 10.463 m/s average speed, and zero off-track cars.
- The Sprint 1 visual deliverable is the approved experience system: broadcast-led stylized 3D, black/warm-white/red brand identity, responsive 1024×720 through 2560×1440 layouts, accessibility scaling, and explicit GLB/KTX2/Meshopt/LOD/instancing requirements.

## Known limitations and deferred work

- Five pre-existing stability-preset files remain in the original `feat_Refactoring_001` worktree. They are not part of this sprint branch and were not modified or staged by Sprint 01.
- The shipped game still runs through the legacy 2D `GameShell`; Sprint 2 connects the existing reducer/controller and extracts the live application shell.
- Babylon.js and Rapier 3D dependencies, real 3D rendering, and GPU performance gates begin in Sprint 3.
- The typed-array transport codec is deferred to Sprint 6. Runtime asset production and visual screenshot baselines follow the design and asset milestones in later sprints.

## Dependencies for Sprint 02

- Use the hash-route map and responsive navigation states in `docs/design/INFORMATION-ARCHITECTURE.md` as the shell contract.
- Connect `app/game/game-reducer.ts` and `app/game/session-controller.ts` to the live route, with the application session as the only navigation/lifecycle authority.
- Extract session composition and adapter disposal from `GameShell` without changing simulation results or introducing the Sprint 3 renderer.
- Preserve the protocol/replay version fields, 120 Hz tick convention, session identity checks, and terminal abort/dispose behavior.
- Keep all 49 authoritative tests green and replace source-text checks only after equivalent behavioral or artifact evidence is running.
