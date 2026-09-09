# GridWatch Information Architecture

## Navigation model

GridWatch uses browser-history-aware hash routes so the same navigation works on both deployment targets. The stable top-level destinations are Home, Quick Race, Championship, Replays, Workshop, and Settings.

| Destination | Route | Primary content |
| --- | --- | --- |
| Home | `#/home` | Continue current championship when available, Quick Race, and top-level navigation |
| Quick Race | `#/quick-race` | Circuit, competition, laps, grid, preview, and start action |
| Championship | `#/championship` | New championship setup or saved championship summary and resume |
| Replays | `#/replays` | Search/sort controls when useful, replay library, import, and storage state |
| Replay viewer | `#/replays/:replayId` | Playback, scrubber, event bookmarks, driver and camera selection |
| Workshop | `#/workshop` | Circuits and Competitions collections |
| Circuit library | `#/workshop/circuits` | Official references, player circuits, legacy archive, New, and Import |
| Competition library | `#/workshop/competitions` | Official references, player competitions, legacy archive, New, and Import |
| Circuit editor | `#/workshop/circuits/:documentId` | Library, 2D construction, synchronized 3D preview, inspector, validation, save/export |
| Competition editor | `#/workshop/competitions/:documentId` | Library, team/driver structure, 3D preview, inspector, validation, save/export |
| Settings | `#/settings/:section` | Race defaults, Graphics, Audio, Interface, and Accessibility sections |
| Race | `#/race/:sessionId` | 3D race, live timing, camera controls, selected-driver data, race actions |
| Results | `#/race/:sessionId/results` | Classification and championship continuation when applicable |

Unknown or unavailable routes resolve to Home with a nonblocking message. IDs are stable document/session IDs, not names or array positions. Automatic phases such as countdown, winner presentation, and championship standings are application state within their parent route; they do not add history entries.

## Global navigation behavior

### Back and browser history

- A user-initiated move between stable routes pushes one history entry. Replacing an unavailable route, restoring a saved canonical route, or advancing an automatic race phase replaces the current entry.
- The visible Back action has the same destination as browser Back. If no GridWatch entry exists, it uses the defined parent: viewer → Replays, editor → Workshop, Settings section → Home, setup → Home, results → Home or Championship, and other top-level destinations → Home.
- Browser Forward restores the route and its nontransient view state, including selected library item, settings section, and replay timestamp. It never resumes a previously running simulation automatically.
- Leaving an active race first pauses it and opens an exit confirmation. Cancel restores the race route and focus; confirm disposes the race and goes to its origin destination.
- Leaving an editor with unsaved changes opens a three-action dialog: Save and leave, Leave without saving, or Cancel. Browser Back waits on this decision and must not create duplicate history entries.
- Destructive actions such as deleting a replay, discarding a championship, or replacing an editor document require their own confirmation and never occur as a side effect of Back.

### Escape priority

One press performs only the highest applicable action:

1. Close the top modal and restore focus to its opener.
2. Close an open menu, popover, select list, tooltip with focus, or transient detail drawer.
3. In an editor, cancel the active placement/manipulation and restore Select; if Select is already active, clear the current selection.
4. During a live race or replay, pause and open Race Actions or Playback Actions.
5. On a stable nonediting page, perform the visible Back action.

Escape never confirms, deletes, discards, starts, or resumes. During countdown, Escape pauses before opening actions when the lifecycle permits; otherwise it queues the actions menu for the first safe paused state.

### Focus and announcements

- On route change, move programmatic focus to the page `h1` or editor title. Do not focus the first primary button automatically.
- Modal focus is trapped; closing returns focus to the exact opener. If it no longer exists, use the nearest stable heading.
- After deleting a list item, focus the next item, otherwise the previous item, otherwise the collection heading.
- Validation summary receives focus only after a failed explicit Save/Publish attempt. Inline errors are connected to their controls and the first invalid field is focused.
- Polite live regions announce saves, imports, race events, and nonblocking failures. Countdown and critical renderer/session failures use assertive announcements. High-frequency timing changes are not live-region content.
- Canvas has an accessible name and a text alternative supplied by live timing and selected-driver status; it is not a keyboard focus stop unless it supports an explicit keyboard interaction.

## Flows

### Home

1. Restore settings and inspect saved championship metadata.
2. Show one primary action: Resume Championship when a valid saved session exists, otherwise Quick Race.
3. Show Quick Race, Championship, Replays, Workshop, and Settings as stable destinations.
4. Resume enters the championship summary first, allowing the schedule and standings to be reviewed before the next race starts.
5. Discard Championship is available in the saved-session detail, requires confirmation, and leaves the user on Home.

Home does not autoplay 3D audio. If the background scene cannot load, the same controls remain available over a static branded surface.

### Quick Race

1. Enter with saved race defaults and the first valid official competition/circuit selected.
2. Select circuit from a visual catalog; Random is an explicit option whose actual circuit is revealed before loading begins.
3. Select competition, laps, and grid size. Clamp the grid to available drivers and circuit grid capacity, then explain any adjustment beside the field.
4. Show a grid preview and concise validation in the summary region.
5. Start Race creates a new session ID and navigates to its Race route. A second activation while loading is ignored and announced.
6. Back returns Home and retains the current draft for the session.

When no valid circuits or competitions exist, disable Start, identify the missing catalog, and link to the relevant Workshop collection. Official launch content prevents this state in a healthy installation.

### Championship

**New:** choose competition, circuit pool, schedule order, 2–50 rounds, laps per round, grid size, and Manual or Auto Broadcast presentation. Ordered schedules cycle through the chosen pool; randomized schedules use seeded shuffled cycles and prevent the same circuit from ending one cycle and starting the next. The user can reorder the generated schedule before Start Championship.

**Saved:** show completed rounds, next circuit, current standings leader, presentation mode, and Resume/Discard actions. Resume never starts a race until activated from this summary.

After each race, Results advances to championship standings. Manual mode waits for Next Round. Auto Broadcast observes its configured presentation durations and continues unless paused; it never inserts instant replay automatically. Completion moves to final championship results, where New Championship and Home are available.

Persistence is guaranteed at round boundaries. A browser close during a race returns to the last completed-round boundary rather than reconstructing a partial physics world.

### Replays

1. Library rows show circuit, competition, date, duration, winner, engine/content version, and integrity status. Default order is newest first; search matches circuit, competition, and winner, while sort choices are Newest, Oldest, and Duration.
2. Open a compatible replay in the viewer; start paused at the beginning or at a selected bookmark.
3. Viewer provides play/pause, timeline scrub, elapsed/total time, event bookmarks, driver follow, camera mode, playback rate, and Back.
4. Changing camera or selected driver does not alter replay data or the current timestamp.
5. Delete requires confirmation. Export downloads the immutable replay document. Import validates before adding it and reports version or integrity failure without creating a partial entry.

Empty state explains that completed races appear here and offers Quick Race plus Import Replay. A missing thumbnail uses a generated circuit contour. A replay that cannot be decoded remains listed as unavailable with Export and Delete so the source is recoverable.

### Workshop

Workshop opens to two collections: Circuits and Competitions. Each collection separates Official read-only content, Player documents, and Legacy archive where present. Primary actions are New Circuit/New Competition and Import. Opening a document enters its editor; official content opens as a read-only reference with Duplicate as the editable path.

Legacy content remains read-only and exportable. It does not appear in new-race selectors and has no silent conversion action.

### Settings

- **Race defaults:** laps and grid size.
- **Graphics:** quality preset, resolution scale, frame-rate limit, and renderer information.
- **Audio:** Master, Engine, Effects, Ambience, and Interface levels plus mute.
- **Interface:** Dark/Light theme and UI scale.
- **Accessibility:** Reduced Motion, camera shake, captions for meaningful audio cues, and high-contrast timing distinctions.

Changes apply immediately when safe and persist. Graphics changes that require scene recreation are staged behind Apply; failure restores the prior confirmed configuration and explains the recovery. Reset Section requires confirmation and affects only the visible section.

Settings opens `#/settings/interface` by default. Section slugs are `race`, `graphics`, `audio`, `interface`, and `accessibility`; changing section pushes history so Back returns to the prior section or originating page.

### Race

1. Show a cancellable load sequence with named stages: circuit, vehicles, simulation, presentation.
2. Pre-race grid presentation exposes Start when manual start is required. Countdown transitions to the live race without a route change.
3. Live layout contains event/lap status, 3D viewport, live timing, selected-driver/battle panel, current camera, and Race Actions.
4. Timing-row selection follows that driver. Camera controls offer Auto Broadcast, Overview, Chase, Onboard, and available Trackside positions.
5. Race Actions contains Pause/Resume, restart confirmation, playback speed, audio shortcut, and Exit to origin. Race length and grid cannot change after countdown begins.
6. Instant replay pauses the live simulation, uses the rolling buffer, and returns to the exact paused tick. Exit Instant Replay never resumes implicitly.
7. Finish transitions through winner presentation to Results. Only the stable Results route is added/replaced; intermediate presentations are not history entries.

Worker or renderer failure pauses the session and presents Retry initialization or Exit. It never changes to a different physics model. A recoverable renderer loss retains the authoritative worker state while graphics recreate; an unrecoverable failure offers a diagnostic export.

### Results

Results shows official classification, status, intervals, best laps, winner, circuit, competition, and race duration. Quick Race offers Watch Replay when stored, Race Again with the same setup, New Quick Race, and Home. Championship offers standings/next-round behavior described above. Browser Back does not return to a completed live race; it returns to its originating setup or championship summary.

### Circuit editor

1. Choose New, Player document, or Duplicate from an official reference.
2. Edit metadata, closed path, widths, elevation, banking, surfaces, curbs, runoff, barriers, timing gates, and 22-car grid using the 2D construction view and synchronized 3D preview.
3. Add curated scenery and camera placements, organize/select instances, and inspect LOD behavior.
4. Undo/redo covers document mutations. Viewport camera movement and selection changes do not enter document history.
5. Autosave maintains a recoverable draft. Save validates document data; Publish additionally compiles through the runtime compiler and requires no errors. Warnings remain visible but do not block unless identified as unsafe.
6. Export writes the versioned source document. Import validates into a preview and requires explicit Add to Library.

The persistent frame is Library | Viewport | Inspector, with top-level mode tabs for Layout, Surface, Scenery, Cameras, and Validate. At compact desktop width, Inspector becomes a toggleable right drawer; Library collapses to a labeled drawer.

### Competition editor

1. Choose New, Player document, or Duplicate from an official reference.
2. Edit competition identity and the ordered eleven-team/twenty-two-driver structure supported by launch content.
3. Edit team identity, livery material slots, driver identity, number, helmet, and AI traits in the inspector while the shared 3D preview updates.
4. Reordering, additions, removals, and property edits participate in undo/redo. Selection and preview camera do not.
5. Autosave, Save, Publish, import, export, validation, and unsaved-exit behavior match the Circuit editor.

Arbitrary executable content and unrestricted model import are absent. User customization selects the supplied vehicle model, livery slots, helmet options, and validated data.

## Shared state patterns

| State | Required presentation and action |
| --- | --- |
| Initial loading | Branded shell and named current stage; keep layout stable; show Cancel only when cancellation has a valid destination |
| Deferred loading | Skeleton with reserved dimensions; preserve existing content while updating; never replace controls with a global spinner |
| Empty | State what is absent, why it matters, and one primary creation/import/start action |
| Field error | Plain error adjacent to the field, programmatic association, preserved input, and correction guidance |
| Page error | Preserve navigation; identify failed resource/action; offer Retry and a safe Back destination |
| Partial asset error | Use a registered fallback, identify affected content in diagnostics, and preserve valid actions |
| Save success | Update persistent Saved state and announce once; avoid modal confirmation |
| Autosave recovery | Show draft time and source document; offer Restore or Discard before editing |
| Storage full | Keep the in-memory document/replay; offer Export and Manage Replays; never report Saved |
| Offline/static failure | Keep local content available; Retry only the failed fetch; avoid implying cloud sync |
| Corrupt/incompatible data | Quarantine from selectors, preserve raw export where safe, and state the unsupported version or integrity failure |

## Responsive, keyboard, and accessibility behavior

- Launch certification covers 1024×720 through 2560×1440 desktop viewports at device pixel ratios 1 and 2. The reference layouts are 1280×720 and 1920×1080. Above 1600 CSS px, content width is capped while the 3D viewport may expand.
- At 1024–1279 CSS px, reduce gutters, collapse secondary metadata, and turn editor side rails into drawers. Do not reduce control hit targets or timing text below its token minimum.
- Below 1024 CSS px, retain access to Home, settings, replay library, and setup as a single column, but display that live race and editors require a 1024×720 viewport for the certified experience. Never crop away Back, Export, or recovery actions.
- Tab follows visual reading order. Arrow keys move within segmented controls, tabs, menus, listboxes, timing-row selection, and editor tool groups. Enter/Space activates. Standard text-editing shortcuts remain untouched.
- Circuit editing keyboard defaults are `V` Select, `P` Path, `E` Elevation, `B` Banking, `S` Scenery, `C` Camera, `Delete` remove selected item, and platform Undo/Redo. Shortcuts are ignored in text inputs and are listed in an accessible help dialog.
- UI scale choices are 85%, 100%, 115%, and 130%. Scale changes type, controls, spacing, and overlay safe zones; it does not scale the rendered 3D world. Layout must remain usable at 130% and at 200% browser text zoom without two-dimensional page scrolling during a live race.
- Pointer targets are at least 44×44 CSS px where space permits and never below 32×32 in dense editor toolbars; dense targets require 8 px separation and an accessible name.
- Text and meaningful icons meet WCAG 2.2 AA contrast. Focus is always visible. Status, team, sectors, and validation do not rely on color alone.
- Reduced Motion follows the operating-system preference by default and can be enabled in settings. It suppresses camera shake, ambient pans, parallax, animated backgrounds, nonessential particles, and spatial transitions as defined in `EXPERIENCE-DIRECTION.md`.
