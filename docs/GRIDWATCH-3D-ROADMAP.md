# GridWatch 3D Transformation Roadmap

This registry is the durable sprint sequence for the twelve-month, 26-sprint transformation. `SPRINT-EXECUTION.md` governs how every sprint is branched, tested, committed, pushed, and handed off.

The launch target is a desktop-browser AI racing spectator game using React, TypeScript, Babylon.js, and Rapier 3D. It includes six curated 3D circuits, eleven fictional teams, twenty-two drivers, full navigation and presentation, replay, championships, and rebuilt circuit and competition editors.

Manual driving, multiplayer, qualifying, pit strategy, tire wear, dynamic weather, safety cars, bridges, and crossing road surfaces are outside the launch scope. Existing player content remains available through a read-only legacy archive and export; it is not silently converted.

## Phase 1 — Foundation and technical risk

| Sprint | Integration branch | Required outcome and exit gate |
| --- | --- | --- |
| 01 | `codex/sprint-01-foundation-contracts` | Freeze architecture, UX/art direction, versioned worker/replay contracts, integer seeded randomness, baseline metrics, and mandatory browser CI. Existing behavior and both builds pass; browser tests no longer silently skip. |
| 02 | `codex/sprint-02-authoritative-lifecycle` | Connect the tested reducer and timer controller to the live application; establish the new shell, tokens, and hash navigation. One lifecycle authority controls every phase and stale/duplicate transitions are covered. |
| 03 | `codex/sprint-03-3d-engine-prototype` | Prove Babylon WebGPU/WebGL2 initialization, Rapier 3D worker loading, disposal, and a disposable four-wheel car on a banked elevated road. Both deployment artifacts and real hardware evidence pass. |
| 04 | `codex/sprint-04-track-v3-compiler` | Implement `TrackDocumentV3` and one deterministic compiler for render meshes, physics, AI, grids, timing, and editor diagnostics. Serialization, seams, invalid geometry, and twenty-two-car grids pass. |
| 05 | `codex/sprint-05-vehicle-dynamics` | Replace the prototype with `VehicleSpecV2`, production chassis/suspension/tire forces, a rigged vehicle, and physics diagnostics. Inclines, banking, curbs, airborne contact, collisions, and stability pass. |
| 06 | `codex/sprint-06-worker-race-engine` | Run AI, seeded state, timing, classification, and twenty-two cars at an authoritative 120 Hz in the worker. Results remain stable across frame rates and playback scheduling. |
| 07 | `codex/sprint-07-complete-race-flow` | Connect setup through results, foundational cameras, event audio, and a camera-independent 120-second replay buffer. A full gray-box race, restart, abort, replay, and disposal pass. |
| 08 | `codex/sprint-08-production-vertical-slice` | Deliver one reference-quality parkland race with production navigation, art, effects, audio, presentation, presets, and twenty-two cars. Product, art, WebGPU/WebGL2, and performance gates pass. |

## Phase 2 — Product and content expansion

| Sprint | Integration branch | Required outcome and exit gate |
| --- | --- | --- |
| 09 | `codex/sprint-09-navigation-and-setup` | Finish Home, Quick Race, Championship, Replays, Workshop, Settings, accessible setup, and the technical circuit gray-box. First-time navigation and a full-grid circuit run pass. |
| 10 | `codex/sprint-10-vehicle-art-and-liveries` | Complete vehicle LODs, eleven liveries, twenty-two helmets, manifests, and the technical circuit. Identity and assets remain correct through race, replay, results, and both builds. |
| 11 | `codex/sprint-11-racecraft` | Add closing, slipstream, attack, defense, side-by-side, recovery, retirement, and a high-speed circuit gray-box. Fixed scenarios and dense fields progress without exploit or deadlock. |
| 12 | `codex/sprint-12-broadcast-and-audio` | Complete the broadcast director, production audio, camera overrides, reduced motion, and the high-speed circuit. Seeded battles are covered coherently and three circuits reach production quality. |
| 13 | `codex/sprint-13-durable-replays` | Add chunked full-race replay, IndexedDB library, integrity/import/export/quota handling, and the urban circuit gray-box. Replays remain independent of later Workshop edits. |
| 14 | `codex/sprint-14-championship` | Complete manual/automatic championships, scoring, round-boundary recovery, immutable content references, and the urban circuit. No duplicate scoring or invalid recovery states remain. |
| 15 | `codex/sprint-15-competition-editor` | Rebuild category/team/driver editing and live 3D previews while gray-boxing the desert circuit. Draft recovery, validation, save, reload, and import/export pass. |
| 16 | `codex/sprint-16-circuit-editor-geometry` | Rebuild circuit geometry, elevation, banking, surfaces, timing, grid, synchronized previews, and finish the desert circuit. Undo/redo and runtime/editor compiler equivalence pass. |
| 17 | `codex/sprint-17-circuit-editor-scenery` | Add curated scenery, cameras, publishing, LOD/instance behavior, and the elevation circuit gray-box. A published circuit works in Quick Race and Championship. |
| 18 | `codex/sprint-18-content-lock` | Finish circuit six, audit all launch content, and add read-only legacy export. All six circuits and every identity/asset pass full-grid races and both artifacts. |

## Phase 3 — Alpha quality and feature freeze

| Sprint | Integration branch | Required outcome and exit gate |
| --- | --- | --- |
| 19 | `codex/sprint-19-race-balance` | Tune complete-race behavior and expand measured regression coverage. All circuits produce plausible progression with no repeatable grid deadlock or race-ending collapse. |
| 20 | `codex/sprint-20-ux-accessibility` | Audit navigation, editors, replay, HUD, audio, reduced motion, focus, contrast, UI scaling, and 200% text. Automated and first-time-user acceptance targets pass. |
| 21 | `codex/sprint-21-durability` | Exercise workers, renderer loss, hidden tabs, storage failures, repeated races, and two-hour soaks. No unbounded resource growth, silent data loss, or scoring corruption remains. |
| 22 | `codex/sprint-22-alpha-freeze` | Remove new-path dependencies on the legacy runtime, finalize splitting/packaging, preserve legacy export and rollback, and freeze public contracts. Complete alpha gates pass. |

## Phase 4 — Beta, optimization, and launch

| Sprint | Integration branch | Required outcome and exit gate |
| --- | --- | --- |
| 23 | `codex/sprint-23-closed-beta` | Run a structured closed beta, reproduce diagnostics, resolve critical/high defects, and cover each correction. At least 200 race-hours and the crash-free target pass. |
| 24 | `codex/sprint-24-performance-compatibility` | Optimize graphics, simulation, replay, and asset streaming; certify supported browsers and minimum/recommended hardware. Frame-time, load-time, and full-race targets pass. |
| 25 | `codex/sprint-25-release-candidate` | Freeze versions/content, run every release suite, verify clean installs, rehearse rollback, and accept product/art/QA/performance evidence. No critical/high defects remain. |
| 26 | `codex/sprint-26-controlled-launch` | Deploy the accepted release, run production smoke tests, verify the exact commit/assets, retain rollback, and triage launch issues. The production URL passes the release checklist. |

## Continuous gates

- Every pull request: type checking, linting, asset validation, unit and affected behavioral tests, mandatory Chromium flow, and both builds.
- Every sprint: complete repository verification, representative twenty-two-car race, deployment-artifact checks, sprint report, conventional commit, push, and remote verification.
- From Sprint 6: nightly complete-race simulation and worker/resource checks.
- From Sprint 14: weekly complete manual and Auto Broadcast championships.
- From Sprint 18: nightly matrix of at least 180 complete races across all circuits and supported grid sizes.
- Sprints 8, 18, and 25: human art, UX, audio, and real-hardware review using reproducible evidence prepared by agents.
- Release: no known critical or high-severity crash, data-loss, scoring, navigation, replay, editor, or deployment defect.
