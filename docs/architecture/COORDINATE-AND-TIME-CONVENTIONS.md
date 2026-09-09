# Coordinate and Time Conventions

## World coordinates

GridWatch uses one right-handed coordinate system throughout track documents, the compiler, Rapier, Babylon, cameras, replays, and editor previews:

- Units are meters.
- `+X` is local/world right.
- `+Y` is up, opposite gravity.
- `+Z` is local/world forward.
- `forward (+Z) × right (+X) = up (+Y)`.
- Gravity is `(0, -9.81, 0)` meters per second squared.
- Babylon scenes must set `useRightHandedSystem = true` before creating scene resources.

Vehicle source assets face `+Z`, place their origin on the chassis center plane, and use the same scale. A positive yaw is a right-hand rotation around `+Y`; viewed from above, it turns `+Z` toward `+X`. Track progress increases in the authored race direction.

Positions and lengths use meters, velocity uses meters per second, acceleration uses meters per second squared, mass uses kilograms, force uses newtons, impulse uses newton-seconds, and angles/angular rates use radians and radians per second. Authoring tools may display kilometers per hour or degrees but convert only at their input/output boundary.

Quaternions are ordered `(x, y, z, w)`, must contain finite values, and must remain normalized within the protocol tolerance. Euler angles are not stored in race or replay contracts. Wheel transforms are world-space transforms; suspension compression is a non-negative distance from the fully extended state.

Track documents store world-space centerline points plus elevation and banking. The compiler creates road frames continuously from the path tangent and authored banking. Renderer, physics, AI, timing, editor, and camera data consume those compiled frames; none recomputes an alternative coordinate interpretation.

## Authoritative time

The simulation worker advances in integer ticks at exactly 120 Hz:

```text
fixedDeltaSeconds = 1 / 120
simulationSeconds = authoritativeTick / 120
```

`authoritativeTick` is a non-negative safe integer. The worker increments it exactly once after completing a fixed simulation step. Timing gates, lap and sector durations, countdown, finish order, failures, AI decisions, events, and replay indexing use ticks. Display seconds are derived values and are never fed back into the simulation.

Playback rates of 1×, 2×, and 4× change how many fixed steps the worker attempts per unit of wall time. They do not multiply the fixed delta and do not skip ticks. When hardware cannot sustain a requested rate, wall-clock playback slows. Classification must remain identical across playback rates, render rates, camera choices, tab visibility transitions, and snapshot publication rates.

Pause finishes the current fixed step, records its tick, and schedules no further steps. Resume begins at the following tick and ignores wall time elapsed while paused. Restart creates a fresh world and tick zero. Dispose makes the session terminal.

## Rendering and snapshots

The renderer maintains the two newest decoded snapshots for a session and interpolates visual transforms between their ticks. Interpolation changes only rendered transforms. It cannot update collision, timing, AI, events, or classification. The renderer does not extrapolate indefinitely when snapshots stop; it freezes presentation and surfaces a stale-data state.

Snapshot publication may run below 120 Hz and may drop intermediate presentation snapshots under backpressure. The worker transfers bounded, pooled `ArrayBuffer` instances and never uses `SharedArrayBuffer`. All authoritative events remain ordered and are not discarded with presentation snapshots.

React receives throttled view models suitable for UI rendering. It does not subscribe to every physics tick. Audio and broadcast systems consume tick-stamped snapshots and events without modifying them.

## Commands and ordering

Each session has an immutable `sessionId`. Each command has a unique `commandId` and supplies the last `expectedTick` known to the sender. Each worker response supplies the worker's `authoritativeTick`.

Consumers apply these ordering rules:

1. Reject a protocol version, session ID, engine version, or content revision mismatch.
2. Ignore a snapshot older than the most recently accepted snapshot.
3. De-duplicate events by `eventId` and process them in tick order.
4. Match ready, acknowledgement, and fault results to their command ID.
5. Treat an acknowledgement as completion of its lifecycle operation.

Wall-clock timestamps are allowed for file metadata and diagnostics. They are forbidden as inputs to race outcomes.
