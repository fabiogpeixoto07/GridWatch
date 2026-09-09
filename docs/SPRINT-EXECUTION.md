# GridWatch Sprint Execution Rules

This document defines the mandatory workflow for the 26-sprint GridWatch 3D transformation. The goal is to keep every increment independently reviewable, reproducible, and recoverable.

## 1. Sprint branch lifecycle

Each sprint receives one permanent integration branch:

```text
codex/sprint-XX-kebab-summary
```

Examples:

```text
codex/sprint-01-foundation-contracts
codex/sprint-08-production-vertical-slice
codex/sprint-26-controlled-launch
```

The integration owner must:

1. Confirm the preceding sprint branch is pushed and its exit gate is recorded as passing.
2. Fetch `origin` and create the new sprint branch from the exact accepted commit of the preceding sprint. Sprint 1 uses the accepted pre-transformation baseline.
3. Record the base branch and full base commit in `docs/sprints/sprint-XX.md` before implementation begins.
4. Check `git status --short` and record any pre-existing changes. Those changes must not be discarded, staged, overwritten, or included without attribution.
5. Keep the remote sprint branch after completion. Never rewrite or force-push a completed sprint.

The next sprint is based on the accepted head of the preceding sprint, so the transformation remains cumulative even before it is merged to `main`. Merging into `main`, publishing a shared/public Site, and deleting remote branches are separate release actions.

## 2. Parallel-agent isolation

One agent is the sprint integration owner. Up to three specialist agents may execute independent work packages in parallel.

- The integration owner creates a separate Git worktree and `codex/sprint-XX-<specialty>` branch for each specialist.
- Every work package states its owned files or subsystem, prerequisites, expected behavior, tests, and handoff deliverables.
- Shared contracts, dependencies, lockfiles, route composition, generated manifests, and Sites configuration remain owned by the integration owner unless explicitly reassigned.
- Specialists must not edit overlapping files. If a dependency changes, they stop that portion and notify the integration owner rather than resolving it by competing edits.
- Specialist commits remain local until reviewed. The integration owner may cherry-pick or squash them into the official sprint result.
- Only the integration owner pushes the official sprint branch. Only the Site-owning integration owner may modify `.openai/hosting.json`, use Sites tools, or deploy.

## 3. Quality workflow

Agents run the smallest relevant tests while implementing. Before the official sprint commit, the integration owner runs the complete repository gate from a clean integration worktree:

```bash
npm run verify
```

`npm run verify` is authoritative because it includes type checking, linting, asset validation, both production builds, and the repository test suite. A sprint may add further required commands to its report, such as Playwright, full-race simulation, visual regression, performance, memory, or real-GPU checks.

The following evidence is required:

- The exact command, exit code, and completion time for every required check.
- Targeted coverage for new or changed behavior.
- Successful Sites and IIS artifacts when the sprint affects runtime code, packaging, workers, WASM, or assets.
- A real browser execution for affected user flows. From Sprint 1 onward, browser checks must not silently skip because a browser is unavailable.
- Real-hardware evidence when an exit gate names WebGPU, WebGL2, audio, memory, or performance. Software rendering cannot be reported as a real-GPU pass.
- `git diff --check` with no whitespace errors.

A required failure keeps the sprint open. Fix the cause and rerun the failed command plus any broader checks invalidated by the fix. Do not disable the check, loosen an assertion, replace a meaningful test with a source-text assertion, or hide a failure behind a fallback.

## 4. Sprint report

Every sprint adds `docs/sprints/sprint-XX.md` using this structure:

```markdown
# Sprint XX — Title

- Branch: codex/sprint-XX-kebab-summary
- Base branch: <branch>
- Base commit: <full SHA>
- Final commit: <full SHA added after commit, or recorded in the next sprint handoff>
- Status: passed | failed | blocked

## Committed scope
## Delivered behavior
## Public contracts and migrations
## Tests and quality evidence
## Performance or visual evidence
## Known limitations and deferred work
## Dependencies for Sprint XX+1
```

The report contains observed results rather than planned claims. A sprint is not marked `passed` while its implementation, required assets, test evidence, or roadmap exit gate is incomplete.

## 5. Commit standard

The official sprint commit uses Conventional Commits:

```text
<type>(sprint-XX): <imperative summary>
```

Allowed types:

- `feat`: new player-facing or platform behavior.
- `fix`: bug correction. Use `fix`, rather than `bug`, to match the repository's existing convention.
- `refactor`: restructuring without an intended behavior change.
- `perf`: measured performance improvement.
- `test`: test-only work.
- `docs`: documentation-only work.
- `build`: build or packaging changes.
- `ci`: continuous-integration changes.
- `chore`: maintenance that fits none of the above.

Rules:

- Use lowercase type and scope.
- Use an imperative subject without a trailing period.
- Keep the subject concise; explain significant details in the body.
- Use `!` and a `BREAKING CHANGE:` footer when a public contract deliberately breaks.
- Include a body with the sprint goal, principal changes, quality commands, and material limitations.
- Do not mix unrelated pre-existing work into the sprint commit.

Example:

```text
feat(sprint-06): run authoritative races in the simulation worker

Move AI, timing, classification, and seeded state into the 120 Hz worker.
Publish versioned snapshots for interpolated presentation.

Quality:
- npm run verify
- npm run test:simulation:full-race
```

## 6. Push and remote verification

After all required checks pass and the official commit exists:

```bash
git push -u origin codex/sprint-XX-kebab-summary
```

The integration owner then verifies:

1. The local branch has no unpushed commits.
2. The remote branch resolves to the local `HEAD`.
3. `git status --short` contains no sprint-owned uncommitted files.
4. The commit subject and sprint report use the correct sprint number.
5. The next sprint's base commit is the verified remote head.

Force pushes are prohibited. If a completed sprint later needs correction, create a new `fix` commit on the active successor sprint or a separately authorized fix branch; do not rewrite the closed sprint's published history.

## 7. Stop conditions

The integration owner must keep the sprint open when:

- A required check fails, skips unexpectedly, or lacks credible evidence.
- A public contract or migration remains ambiguous.
- The implementation uses stubbed acceptance behavior or a second fallback simulation.
- An asset, browser, worker, WASM, persistence, or deployment path required by the sprint is unverified.
- Integration would overwrite uncommitted work or another agent's ownership.
- The roadmap exit gate is not satisfied.

When blocked, preserve the branch and report the exact failing evidence and next action. Do not commit and push an official passing sprint result.
