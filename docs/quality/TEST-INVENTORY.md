# Sprint 01 Test Inventory

This inventory describes the suite at the Sprint 01 baseline. Classifications reflect what each test proves today, not what its title implies.

## Suite inventory

| Suite | Tests | Primary classification | Evidence provided |
| --- | ---: | --- | --- |
| `tests/racing.test.mjs` | 3 | Behavioral | Executes compiled racing and result modules for racing-line analysis, deterministic driving, passing, and immutable classification. |
| `tests/domain.test.mjs` | 8 | Behavioral | Executes sprite, storage, editor command, lifecycle, session, timer, and championship recovery APIs. |
| `tests/simulation.test.mjs` | 10 | Simulation | Executes Rapier-backed vehicle, track, racecraft, determinism, soak, fixture, and seed-matrix scenarios. |
| `tests/rendered-html.test.mjs` | 1 | Artifact | Imports the built Sites worker and verifies its rendered response metadata. |
| `tests/static-smoke.test.mjs` | 1 | Artifact | Serves the IIS artifact and verifies its shell, runtime assets, MIME types, and traversal handling. |
| `tests/browser-smoke.spec.ts` | 1 | Browser | Runs Chromium against the IIS artifact through Playwright and covers menus, championship Auto Broadcast, theme, both editors, race setup, race start, timing layout, controls, Rapier status, and canvas output. |
| `tests/performance-contracts.test.mjs` | 2 | Source contract / artifact | Checks source-size and built-chunk limits; its accessibility test searches source text and is queued for replacement. |
| `tests/quality-contracts.test.mjs` | 18 | Source contract / artifact | Checks static source patterns, public asset metadata, and packaged assets. It is useful as migration scaffolding, but most source-text checks do not prove runtime behavior. |

Total: **44 tests**: 11 behavioral, 10 simulation, 3 artifact-focused, 1 browser flow, and 19 primarily source-contract checks. Some tests span classifications; the count assigns each test to its strongest current evidence category.

Sprint 01 adds `tests/sprint-01-architecture-contracts.test.mjs` to both authoritative contract scripts. Its five behavioral tests exercise command and worker-message guards, snapshot/event validation, replay validation, and seeded-random restoration. The integrated gate therefore runs **49 tests**: 48 Node tests and one browser flow.

## Source-text replacement queue

The following tests read implementation files and match strings or regular expressions. Sprint 2 and later must replace these checks as the corresponding subsystem changes. A replacement should exercise a public function, rendered DOM, persisted document, worker protocol, or built artifact. Keep a source contract only where the source itself is the intended deliverable, such as a script entry point or a token declaration.

| Current test | Current limitation | Required replacement evidence |
| --- | --- | --- |
| `browser-only libraries restore after hydration` | Matches hook and loader names in source. | Browser reload with persisted custom circuits/categories and recovered drafts. |
| `custom documents use guarded, versioned storage` | Matches guard implementation text. | Repository tests for current, legacy, malformed, and storage-failure inputs. |
| `editors expose destructive-action and asset safeguards` | Matches labels and private symbols. | Browser interaction tests for confirmation, protected content, validation, ordering, duplication, and file limits. |
| `team livery colors map all sprite template channels` | Matches types and helper names. | Pixel/material output assertions for all livery channels through the public renderer/service API. |
| `competition documents migrate to stable driver identities without destructive team cascades` | Infers migration behavior from source patterns. | Migration and editor-operation tests that assert stable IDs and explicit reassignment. |
| `reliability foundation exposes repositories, cached assets, and editor safeguards` | Matches a collection of implementation tokens. | Repository failure tests, abort/cache behavior tests, and editor command/browser flows. |
| `creation tools are presented as available workflows` | Searches JSX for copy references. | Browser navigation assertions for both Workshop/editor entry points. |
| `shipped UI copy is English-only and centralized` | Searches selected source files and can miss runtime/generated copy. | Rendered screen crawl plus an explicit locale/catalog validation tool. |
| `the visual system exposes semantic interaction and accessibility tokens` | Confirms declarations exist, not that controls use them. | Computed-style, focus, contrast, and reduced-motion browser checks. |
| `appearance settings persist the selected color theme` | Matches state and storage strings. | Browser test across reload and a storage-denied failure scenario. |
| `race driving uses fixed simulation, analyzed geometry, and stateful traffic control` | Matches private field/function names. | Simulation assertions for fixed-step scheduling and observable racecraft outcomes. |
| `studio simulation foundation provides physical documents, shared geometry, and deterministic contacts` | Matches type and implementation vocabulary. | Contract serialization plus physics, compiler, worker, HUD, and timing integration tests. |
| `championship setup exposes unattended Auto Broadcast playback` | Matches variables, constants, and copy. | End-to-end Auto Broadcast timing, visibility, persistence, cancellation, and resume scenarios. |
| `fullscreen race UI provides an action menu and dense 22-car timing layout` | Searches JSX/CSS declarations. | Browser assertions at supported viewports using rendered dimensions, roles, and keyboard behavior. |
| `finish classification and post-race summaries use immutable result data` | Mixes useful absence checks with private implementation names. | Full lifecycle test from finish events through immutable results, standings, and next-round progression. |
| `accessibility fallbacks cover motion, focus, and live race status` | Searches CSS/JSX strings. | Automated accessibility plus browser focus, live-region, and reduced-motion behavior. |

## Contracts that may remain static

- `documented developer commands are cross-platform Node entrypoints` validates repository-owned command declarations.
- `runtime asset manifest contains versioned, deployment-ready asset families` validates a shipped data contract and its referenced source assets; add runtime loading tests as the manifest evolves.
- `production artifacts package the runtime asset library` and the size portion of `source and deployment artifacts stay within interaction budgets` inspect the artifacts they are intended to constrain.

No source-text test should be deleted until its behavioral or artifact replacement is running in the authoritative gate.

## Windows artifact portability finding

The baseline checkout exposed a pre-existing portability defect: with `core.autocrlf=true`, Git checked runtime SVG files out as CRLF while their manifest byte counts and hashes were generated from LF content. `npm run assets:validate` therefore failed before either production build could complete. Sprint 01 adds narrow `.gitattributes` rules for the source manifest and the public/IIS runtime SVG and asset-manifest paths. This keeps their working-tree bytes stable across platforms and makes manifest validation reproducible without weakening the validator.
