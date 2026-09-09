# GridWatch Transformation Architecture

## Purpose

This document freezes the ownership boundaries for the 3D transformation. It describes the target architecture, not an instruction to incrementally add more behavior to `GameShell`.

The authoritative race path is:

```text
React route and controls
        |
        v
application session reducer -----> persistence repositories
        |
        | versioned RaceCommand
        v
simulation worker (120 Hz) ------> RaceSnapshot + RaceEvent
        |                                  |
        +----------------------------------+
                                           v
                           renderer, audio, replay, HUD
```

Commands flow into the worker. Snapshots and events flow out. Presentation systems cannot call physics or mutate classification.

## Current ownership

`app/game/GameShell.tsx` is currently a 2,137-line integration component. It owns all of the following responsibilities:

| Current responsibility | Current evidence | Target owner |
| --- | --- | --- |
| Screen routing and menu state | `MenuScreen`, `screen`, and conditional screen rendering | Application router and shell |
| Race and championship lifecycle | status refs/state, mode refs/state, presentation flags, start/restart/next callbacks | Session reducer and controller |
| Simulation clock | animation-frame loop, accumulator, race time, speed, and countdown | Simulation worker for race ticks; session controller for presentation deadlines |
| Race model and random setup | local `CarState`, `initialCars`, `seeded`, and mutable refs | Simulation worker and deterministic random service |
| Physics and AI integration | `WorldRaceEngine` creation, stepping, recovery, and fallback calculations | Simulation worker behind `RaceCommand` |
| Timing and classification | car distance/lap fields, finish scoring, result snapshots | Simulation worker, emitted as snapshots/events |
| 2D rendering and effects | geometry construction and Canvas drawing functions | Babylon renderer and effects adapters |
| Audio | Web Audio graph creation and race-event sounds | Audio presentation service |
| Championship sequencing | schedule, points, round state, autoplay deadlines, recovery writes | Championship domain service coordinated by the session reducer |
| Content selection and persistence | tracks, categories, settings, saved championship loading | Versioned content and persistence repositories |
| Resource disposal | timers, RAF, audio, sprites, and Rapier world cleanup | Each adapter owns and disposes its own resources; session composition disposes adapters |

The tested `app/game/game-reducer.ts` and `app/game/session-controller.ts` exist but are not used by `GameShell`. Sprint 2 connects them to the live path before a new renderer or simulation is introduced. The existing `WorldRaceEngine` and `TrackDocumentV2` are migration inputs rather than target contracts.

## Target boundaries and authority

| Subsystem | Owns | Must not own |
| --- | --- | --- |
| Application session | Valid navigation and lifecycle transitions, active session identity, presentation deadlines, adapter creation/disposal | Physics time, lap counting, classification |
| Simulation worker | Fixed-step clock, Rapier world, AI, seeded randomness, timing gates, laps, retirement, finish order | DOM, React state, cameras, audio, persistence |
| Track compiler | Deterministic derivation of render, collision, AI, timing, grid, and diagnostics data from one document revision | Mutable race state or editor UI state |
| Renderer | Scene resources, cameras, visual interpolation, effects, renderer recovery | Race outcomes or authoritative tick advancement |
| Replay recorder/player | Immutable capture of tick-addressed poses, timing, and events; camera-independent playback | Live-world advancement or camera decisions |
| Audio | Event and camera-relative sound presentation | Lifecycle or simulation decisions |
| Persistence | Versioned documents, integrity checks, quotas, import/export, legacy archive | Silent document conversion or live race authority |
| Editors | Immutable editing commands, drafts, previews, validation, publish intent | A separate compiler or runtime-only geometry interpretation |

The worker is the only authority for `authoritativeTick`, car dynamics, AI decisions, timing, and classification. The application session reducer is the only authority for lifecycle transitions between application screens and race phases. The renderer, replay UI, broadcast director, audio, and React components are consumers.

## Race protocol

`app/domain/race-protocol.ts` is the executable boundary. Every command and worker response carries `protocolVersion`, `sessionId`, `engineVersion`, and `contentRevision`. Commands carry a unique `commandId` and the last `expectedTick` observed by the sender.

The worker follows these rules:

1. `initialize` is valid only for an uninitialized worker. It creates the world at tick zero and emits `ready` for the initializing command.
2. `start` moves `ready` to `countdown`. Countdown consumes authoritative ticks and produces `countdown-started`, then `race-started`.
3. `pause` stops scheduling new fixed steps after the current step and acknowledges `paused` at the exact final tick.
4. `resume` continues from that tick without inserting elapsed wall time.
5. `restart` disposes the current world, resets all simulation-owned state and randomness from the supplied seed, returns to `ready` at tick zero, and acknowledges the original command ID.
6. `abort` stops the active race, releases its worker-owned resources, acknowledges `disposed`, and emits nothing else for the session. It gives session control an explicit user-intent command for leaving a race.
7. `dispose` is idempotent. It provides the same terminal cleanup acknowledgement for normal adapter teardown and makes every later command invalid.
8. Every accepted command emits exactly one `ack`, except `initialize`, which emits exactly one `ready`. Rejected commands emit one `fault` referencing the command ID.
9. A protocol, session, engine, or content-revision mismatch is rejected before mutation. A stale `expectedTick` is rejected unless the command is the idempotent repeat of an already acknowledged command.
10. The worker caches command outcomes by `commandId`; duplicate delivery returns the original result and never applies the command twice.
11. An unrecoverable physics fault pauses advancement and emits `fault`. It never switches to another simulation model.

Lifecycle acknowledgements are the observable pause, resume, restart, abort, and dispose completion. UI state changes only after the corresponding acknowledgement, so it cannot report a transition the worker did not make.

Snapshots contain authoritative car pose, wheel, timing, and classification data. Events identify discrete facts needed by race presentation, scoring, diagnostics, and replay. Consumers reject unsupported versions and messages whose nested identity or revision differs from the envelope.

## Snapshot transport

The semantic `RaceSnapshot` contract remains independent of transport encoding. Before Sprint 6 connects production traffic, a codec will encode its numeric car and wheel fields into fixed-layout typed-array views backed by pooled `ArrayBuffer` instances. The worker transfers ownership with `postMessage(..., [buffer])`; the main thread returns released buffers to the worker pool after decoding. Metadata and classification remain small structured-clone headers.

`SharedArrayBuffer` is not permitted. This avoids cross-origin-isolation requirements in Sites and IIS deployments. The pool is bounded; if every buffer is in flight, the worker drops an intermediate presentation snapshot while retaining all simulation ticks and race events. It never allocates without a limit, waits for rendering, or skips simulation steps.

The transport codec must preserve the public semantic contract, protocol identity, tick, and revisions. Codec fixtures will prove encode/decode equivalence before worker integration. This leaves a deliberate implementation seam without allowing the renderer to depend on a binary layout.

## Replay independence

`app/domain/replay-document.ts` defines `ReplayDocumentV1`. A replay records car transforms, wheel state, timing state, ordered race events, final classification, roster identity, seed, and exact engine/content revisions. It records no active or preferred camera. Playback chooses any compatible camera after loading.

A replay is immutable once finalized. Later edits or deletion of Workshop content cannot alter it: the durable replay repository must embed required immutable content or retain content-addressed revisions. The replay validator rejects version mismatches, revision mismatches, invalid transforms, unknown or duplicate drivers, non-monotonic ticks/events, and incomplete classification before playback begins.

## Migration sequence

1. Sprint 2 connects the existing reducer/controller and extracts session composition without changing the active engine.
2. Sprints 3–6 add renderer, worker, compiler, vehicle, AI, and timing adapters behind the frozen boundaries.
3. Sprint 7 changes the new race route to consume worker snapshots/events and record replay data.
4. Later sprints replace content, persistence, editors, and presentation through their respective adapters.
5. Sprint 22 removes legacy runtime execution after all new routes pass their gates. The read-only legacy archive remains separate.

During migration, an implementation flag may select the complete legacy path or the complete new path. A single race session cannot combine clocks, physics, timing, or classification from both.

## Failure and cleanup policy

- Physics initialization failure keeps the race out of `ready` and provides retry or return navigation.
- Renderer loss asks the session to pause the worker, rebuilds presentation resources, and resumes only after the pause acknowledgement and successful renderer recovery.
- Invalid or stale messages are ignored after diagnostic capture; they never mutate live state.
- Every adapter exposes idempotent disposal. Session identity prevents late work from an old worker, loader, timer, or renderer from entering a replacement session.
- Storage or replay-recording failure is visible but cannot stop or alter the authoritative live race.
