# Architecture

The game is a Ritmo ECS simulation plus a browser host. The simulation (`src/sim`) owns every rule
that changes the world. It is headless and deterministic: no DOM, no Three.js, no wall clock, no
`Math.random`. The host (`src/main.ts`, `src/render`, `src/audio`, `src/hud`) captures input,
draws, plays the sound, and shows the HUD. It reads the world and never writes saved state: its
one request, the handling the player picks in the settings or the dev debug menu, goes in as
`SetHandling` events that a system applies.

```
keys, touch ──► KeyboardInput service ──► CaptureInput ──► Input resource ──► systems
                                                                                │
             HUD ◄── PlayerView (inspector) ◄────────── world (components, resources, events)
             three.js nodes ◄── render schedule (RenderSync) ◄──┤
             speakers ◄── director ◄── audio schedule (Hear) ◄──┘
```

## Simulation

`src/sim/index.ts` is the entry. It re-exports the schema, defines the schedules, and exports
`makeRuntime({ seed, services, debug? })`, which makes a runtime with the starting resources:
`Time` (60 Hz clock), `Rng` (seeded from `seed`), `Score` (zeroed), `View` (home view),
`Handling` (a new game's knobs, `DEFAULT_HANDLING`: the Balanced preset) and `Input` (idle
keys).

### Schedules and system order

`setup` runs once after the runtime is made:

1. `SpawnWorld` (`systems/spawn.ts`): the player and the parked cars on 200 of the map's parked
   spots (`PARKED`), the two Carabinieri cars included.
2. `ApplyHandling` (`index.ts`): runs here once, before any request exists, so it is listening
   when the host first sends: a `SetHandling` sent before the first `update` (the host
   re-sending the player's stored handling at load) would otherwise be dropped by whichever
   schedule ticked first.
3. `applyDeferred`

`update` is one fixed step (`STEP = Clock.hz(60)`):

| # | System | File | Does |
|---|---|---|---|
| 1 | `AdvanceTime` | `index.ts` | advances `Time` (Ritmo `Clock.system`) |
| 2 | `CaptureInput` | `index.ts` | copies the `KeyboardInput` snapshot into `Input` |
| 3 | `StorePrevious` | `index.ts` | copies every `Pose` into `PrevPose` (for interpolation) |
| 4 | `TurnView` | `index.ts` | turn keys: the view's quarter turns (`View`) |
| 5 | `ApplyHandling` | `index.ts` | each `SetHandling` request sets its knob in `Handling`, kept in the knob's range |
| 6 | `EnterExit` | `systems/enter-exit.ts` | action key: enter, steal, carjack, get out |
| 7 | `applyDeferred` | | applies the enter/exit commands before anything moves |
| 8 | `PlayerFoot` | `systems/foot.ts` | player walking, sprinting, sliding when down |
| 9 | `PlayerDrive` | `systems/drive.ts` | player keys into the driven car's `CarInput` |
| 10 | `TrafficAI` | `systems/traffic.ts` | AI drivers write their `CarInput`; a driver held up honks (`Honk`) |
| 11 | `Pedestrians` | `systems/pedestrians.ts` | walkers follow their routes, flee, slide |
| 12 | `VehiclePhysics` | `systems/physics.ts` | every vehicle moves on its springs and tyres from its `CarInput` under the `Handling`; wall and ground hits are `Impact` events, sliding tyres `Skid` events |
| 13 | `Contacts` | `systems/contacts.ts` | car–car, car–person and person–person contacts, knockdowns; car–car hits and knockdowns are `Impact` events |
| 14 | `RideAlong` | `systems/drive.ts` | the driving player takes the car's pose and motion |
| 15 | `Recover` | `systems/contacts.ts` | knocked-down people get up; pedestrians then flee |
| 16 | `Populate` | `systems/populate.ts` | every 0.5 s spawns and despawns traffic and pedestrians |
| 17 | `applyDeferred` | | applies spawns, despawns, inserts and removals |

Controls and the handling are read before movement, all movement happens before contacts, and
contacts happen before the player's pose follows the car. Gameplay is in [gameplay.md](gameplay.md).

### Where state lives

Saved world state (in snapshots), declared in `src/sim/schema.ts`:

| Component | On | Holds |
|---|---|---|
| `Pose`, `PrevPose` | every body | x, y (m, east/north from the map origin), angle (rad CCW from east) |
| `Motion` | every body | velocity vx, vy (m/s) and spin (rad/s) |
| `Player` | the player | tag |
| `Person` | player, pedestrians | look: skin, hair, shirt, trousers colours (immutable) |
| `Pedestrian` | pedestrians | mood (`walk` or `flee`), flee end step, steps blocked |
| `Down` | knocked-down people | step at which they get up |
| `Vehicle` | vehicles | model and paint colour (immutable) |
| `CarInput` | vehicles | throttle, steer, handbrake for this step |
| `Chassis` | vehicles | centre-of-mass elevation and vertical speed, pitch and roll with their rates, road-wheel steering angle, gear, step the current shift ends |
| `Traffic` | AI vehicles | tag |
| `Route` | traffic, pedestrians | current graph edge, direction, lateral offset |
| `Autopilot` | traffic | next edge, stuck counter, reverse end step, unstick tries |
| `Stolen` | vehicles | tag: already entered once by the player |
| `Driving` | the player | handle of the vehicle being driven |

`Schema.requires` enforces the bundles: a `Player` has a pose, previous pose, motion and look; a
`Vehicle` has a pose, previous pose, motion, `CarInput` and `Chassis`; `Traffic` also needs
`Route` and `Autopilot`. Spawns put a vehicle on its springs at rest on the ground (`settle` in
`src/sim/chassis.ts`), in the gear for its speed. No save is ever persisted, so the new
`Chassis` and `Handling` need no snapshot migration.

Resources: `Time`, `Rng`, `Score` (`stolen`, `knocked`), `View` (`turns`, the net quarter turns
of the camera) and `Handling` (the 15 handling knobs, [gameplay.md](gameplay.md#handling)) are
saved. `Input` is transient: it is rebuilt every step and never saved.

Events are transient too. `Impact` (a vehicle hit a wall, another vehicle, a person or the ground:
where, which is the contact point for a wall, a vehicle or the ground, how hard, with how much mass
in tonnes, and for the ground which face of the body struck), `Skid` (a tyre slid this step: where,
how fast, how far past its grip, on what surface) and `Honk` (an AI driver held up sounds the horn)
carry moments that leave no trace in the components. `VehiclePhysics`, `Contacts` and `TrafficAI`
emit them; the audio schedule reads all three ([audio.md](audio.md#data-flow)) and the render
schedule reads `Skid` (tyre marks and smoke). `SetHandling` (set one handling knob to a value) is
a host intent: no system emits it, the host's handling store (`src/hud/handling.ts`) sends it
with `runtime.send` for the settings and the dev debug menu, and `ApplyHandling` reads it.
Snapshots hold no events, and emitting them changes neither the determinism nor the saves test.

Static data is module content, not state. `MAP` and `graph` (`src/sim/map/index.ts`), the wall,
tree, building and edge lookups, the per-model lane tables in `src/sim/route.ts` and the per-model
rigs in `src/sim/chassis.ts` (`RIGS`: static wheel loads, springs, inertias, steering lock, tipping
threshold) are built once at load and never change, so they are safe to share between runtimes.
A rig under a handling off its real values (`rigFor`) is a pure function of the model and the
`Handling`, derived on first use and cached (the whole cache empties once it holds 64 rigs, 16
for each of the four models), so it is safe to share too.
The land-cover raster (`mapCover` in `src/sim/map/cover.ts`, ≈ 105 ms and 4.9 MB) and the road
index of `surfaceAt` (`src/sim/map/surface.ts`) are built on first use: pure functions of `MAP`,
never written after; `main.ts` builds the raster in its "Painting land cover" loading step, so
the first physics step finds it ready. The lookups are compact static grids (`staticGrid` in
`src/sim/collide.ts`, item indices packed into one `Int32Array`):

- `wallsNear` indexes the walls straight from the decoded flat arrays and the trees as points,
  making each trunk's square (`pushTrunk` in `src/sim/map/kinds.ts`) only when a query reaches it.
  It reuses its answer array and the segment objects in it until the next call of the same kind:
  copy the coordinates to keep them.
- `buildingsIn` (over `buildingBoxes`, 64 m cells) and `treesIn` (the trees as points) in
  `src/sim/map/index.ts` are broad phases that call back with candidate indices; callers run the
  exact test. The sim (`Populate`'s pedestrian spawns) and the audio host (occlusion, streets,
  birds) share them.
- `edgeIndex`, `trafficIndex` and `walkIndex` (`src/sim/route.ts`) answer nearest-edge and
  spawn-band lookups without scanning the whole graph.
- `groundZ` (`src/sim/map/ground.ts`) is where every wheel, foot, sound source and drawn actor
  stands, in m a.s.l.: the terrain as its mesh is drawn (each 4 m cell split along its SW–NE
  diagonal), at-grade roads `ROAD_LIFT` above their profile (blended where several overlap, so a
  junction's ground stays continuous where their profiles disagree), and bridge decks and tunnels
  kept to the level nearest the caller's previous height. Road segments are bucketed in 16 m
  cells at load. The renderer converts it to render y (`src/render/ground.ts`).

Host state stays in the host: the camera, the render clock, the three.js scene and nodes, the
streamed world's chunks, the tyre marks and smoke, the HUD's DOM, the player's handling (a
preset's name or the knobs set by hand, kept in `localStorage` by `src/hud/handling.ts`), and the
audio context, live voices and the director's memory of each sound source (pruned as sources go;
see [audio.md](audio.md#where-state-lives)).

## Input

1. `src/main.ts` makes `Keyboard.actions(window, bindings)` and passes it as the `KeyboardInput`
   service. In mobile mode ([HUD](#hud)) it passes `withTouch` (`src/hud/touch.ts`) instead: the
   keyboard's snapshot with the touch controls' added. The stick holds the direction keys it leans
   more than 22.5° toward, so it has the keys' eight directions, and each button holds its key;
   every key has a button. A key is held while any of them holds it, so the sim cannot tell a tap
   from a key. Only the controls shown in the player's mode count: one the mode hides under a
   thumb that stays down (the stick on getting in, ◀ on getting out) lets go of its keys.
2. `CaptureInput` (Ritmo's `InputCapture.system`) copies its snapshot into the `Input` resource
   at the start of each step.
3. Systems read `Input`: `held` for movement, steering and handbrake, `pressed` (once per press)
   for the action and turn keys. No sim system reads `horn` (H): only the audio schedule does.

`bindings` in `src/sim/schema.ts` is the only list of keys. Tests and replays use the same path:
`Keyboard.scripted(bindings, timeline)` replaces the live keyboard.

## Start-up

The title card doubles as the loading screen: it says the game is in early development, downloads
the map, builds in named steps, and asks for a key only once the first frame is drawn.

1. `index.html` is static, so the card shows before any script runs. Its entry, `src/boot.ts`,
  imports the card (`src/hud/title.ts`), map selection (`src/maps.ts`) and the map file's
  handover (`src/sim/map/packed.ts`), keeping simulation setup out of the entry module.
2. `boot.ts` validates `?map=` and fetches the selected hashed asset: `monzone.bin` by default,
  or `cesena.bin` for `?map=cesena`. It counts the bytes against
   `Content-Length` (the first 60% of the bar, with MB so far). It gunzips with
   `DecompressionStream` while the file arrives, then hands the bytes to `provideMap`. The file is
   named `.bin`, not `.gz`: Vite's server would label a `.gz` as `Content-Encoding: gzip`, and the
   browser would then gunzip it first.
3. It imports the game in three parts, with a paint between them, because each import evaluates
   only the modules the earlier ones left: `src/sim/map/index.ts` (decoding, collision grids),
   `src/sim/route.ts` (each vehicle model's lanes), then `main.ts`.
4. `main.ts` builds the rest in steps with top-level `await`, each named on the card: the land
   cover (`mapCover`), the world (`new World`), then the HUD, the runtime, `setup` and the first
   audio tick, then every chunk of the first view.
5. `main.ts` draws the first frame itself, shader compiles included: a throw there reaches the
   card, where inside the loop's animation frame it would stop the loop behind "Press any key".
   It then drops the presses of keys hit while loading (held keys stay held, as `pausable` does),
   starts the loop, arms M and calls `titleReady`. The card swaps the bar for "Press any key"
   ("Tap to play" in mobile mode) and hides on the next key, click or tap.
6. If any step throws (the download, a missing WebGL), the card keeps the step's name, shows the
   error (`role="alert"`) and a Retry button that reloads; a failed module import stays failed
   until a reload. Retry stops Enter and Space from reaching the game's keyboard, which cancels
   them at the window. When the scripts themselves fail to load (a network error, or an
   `index.html` cached from before a deploy asking for removed assets), a small inline script in
   `index.html` shows the same error and Retry.

The step name is a polite live region, so screen readers hear each step; the byte count beside it
is not, so chunks stay quiet. A background tab has no animation frames and slows timers to about
one a second, so there each step yields on a `MessageChannel` message instead (eight steps would
otherwise add ≈ 8 s).

Measured with the production build in headless Chrome on an M4 Pro, 1280×720:

| Case | Before | After |
|---|---|---|
| local server | first frame at 1.9 s; JS heap after GC 117 MB | "Press any key" at 0.63 s; 88 MB |
| 4× CPU, 1.5 MB/s | the 15 MB script in at 9.8 s (a dead "Press any key" until then), one 3.5 s task, first frame at 13.5 s | map in at 4.6 s, ready at 7.1 s, longest task 0.64 s |

## Host loop

`src/main.ts` drives everything from one `FixedLoop`: 60 Hz steps, at most 5 steps per frame, and
frames clamped to 0.25 s. Before the loop starts it ticks `setup`, then the `audio` schedule once,
and draws the first frame (the `render` schedule's first run): a system reads the events published
since its own last run, so a reader that has never run would miss the first steps' `Impact`,
`Honk` and `Skid` events. Each animation frame it:

1. writes the loop's `alpha` (fraction of a step since the last one) into `RenderClock`;
2. ticks the `render` and `audio` schedules (`runtime.tick(render, audio)`);
3. reads `PlayerView` and moves and turns the camera;
4. streams the static world around the camera focus (see below);
5. renders the pixel view, then updates the HUD and, in mobile mode, the touch controls.

The seed comes from `?seed=N`, or a random 32-bit number.

## Rendering

The render schedule (`src/render/index.ts`) uses `@typeonce/ritmo-render`:

- `SyncPeople` and `SyncVehicles` (`RenderSync.system`) keep one three.js node per entity with a
  `Person` or a `Vehicle`, in the `People` and `Vehicles` node registries. A person in a car is
  hidden; a knocked-down person lies flat.
- `MarkDriven` shows the x-ray silhouette (drawn only where the world hides the actor) on the
  player's car and no other vehicle. `SyncPeople` shows it on the player's figure.
- `PlacePeople` (`RenderSync.interpolate`) blends `PrevPose` → `Pose` at the render alpha and
  stands each person on the ground or road under them (`groundY` in `src/render/ground.ts`, kept
  to the level they were on); people swap between three walk frames.
- `PlaceVehicles` puts each vehicle's node at its centre of mass from the sim, with no ground
  lookup of its own: x and y blended `PrevPose` → `Pose`, and the `Chassis` height, pitch and
  roll stepped back from the current step along their rates (`vz`, `pitchRate`, `rollRate`) by
  (1 − alpha) of a step: close to the previous step's values (within a few cm and about 1° as a
  car lands from a jump, since the physics moves them in four substeps), with no previous copy
  saved. A heading more than a quarter turn on from `PrevPose` is a tumble's angles folding
  (heading + π, pitch π − pitch, roll + π: the same body), so the blend unfolds them first.
  Rotation order YZX turns the node as the sim turns the body: heading, pitch about its right
  axis, roll about its forward axis (a positive roll tips the roof to the right). Each mesh
  stands on y = 0 at rest, centred on the centre of mass, with its wheels where `VEHICLES` puts
  them (the truck's one sim rear axle drawn as a tandem 1.3 m apart); body and x-ray proxy hang
  `cg` below the node (`VehicleNode` in `src/render/actors.ts`).
- `DrawEffects` reads the `Skid` events since the last frame and feeds the effects host
  (`makeEffects` in `src/render/index.ts`, made in `main.ts` beside the registries, passed as the
  `Effects` service, and `gta.effects` in dev builds). The marks and the smoke age by sim time
  (`Time.step` plus the render alpha), so both stand still while the game is paused. They are
  host state for the page's life: nothing loads a save in the browser.
  - Tyre marks (`src/render/marks.ts`): one dynamic mesh for the whole map, a ring buffer of 4,096
    quads, the oldest overwritten first. Each (car, wheel) draws a strip joining its consecutive
    steps; a step without a skid breaks it. Width by model's tread (Panda 0.18 m, Ape 0.1 m,
    Giulia 0.22 m, the truck's twin tyres 0.35 m), rubber on asphalt and stone, an earth rut on the
    rest, opacity by `amount`, fading out over 60 s. A quad lies 4 cm over the ground the event
    names or the highest road ribbon drawn within 3 m over it (`drawnZ`; on a hairpin or at a
    junction the wheels' blended ground can sit under it, while a tunnel's hill stands higher),
    which clears the centre dash (2 cm over its road), and the material is pulled towards the
    camera in depth like the decals. Only the slots written since the last
    frame are uploaded (`addUpdateRange`), plus the whole colour buffer on a fade pass every
    0.25 s of sim time (≈ 0.5 ms for a full buffer).
  - Smoke and dust (`src/render/smoke.ts`): one `InstancedMesh` of up to 256 low-poly puffs
    (an icosahedron tinted per puff, 60 % opaque), spawned at `rate` × `amount` × `slip` puffs a
    second: white-grey burnt rubber on asphalt and stone, tan dust on gravel and dirt, dark brown
    on leaves, hardly any on grass. A puff swells, rises, drifts and thins away over 1–2 s; when
    all 256 are in the air, the puffs owed meanwhile are dropped. Being transparent it draws after
    every opaque mesh, the x-ray silhouettes included, and it writes no depth.
  - Measured in headless Chrome on an M4 Pro, 1280×720, dev server, seed 7: "Press any key" at
    ≈ 0.66–0.69 s (0.68–0.85 s before the change); JS heap after GC at the spawn 96.1–96.6 MB
    (96.0 MB before), 97.2 MB with a full ring of marks and the smoke at its cap; 60 fps and no
    frame over 16.8 ms through handbrake slides on asphalt and a dirt track, and with 4,095 marks
    and up to 256 puffs in view.

The static world (`src/render/world.ts`) is cut into 128 m chunks (`src/render/chunks.ts`), and
only the chunks around the camera exist as meshes. A built chunk has a terrain mesh, a solid mesh
(buildings, roofs, bridges, platforms), a decal mesh (roads, water, rail) and one `InstancedMesh`
per tree kind. A 192 m apron of extra chunks continues the terrain, lines and trees beyond the map
bounds. Terrain cells take their colours from the land cover (`src/sim/map/cover.ts`, painted by
`COVER_LOOK` in `src/render/terrain.ts`): the
map's areas, meadow where none covers a cell, paving where open ground lies within 3 m of both a
wall and a road's edge (house fronts, sidewalks, alleys), and pebble beds along the wide streams.

Streaming:

- `new World(scene)` prepares, once (≈ 190 ms in Node for the whole valley): the land-cover raster
  for the whole map (`mapCover()` in `src/sim/map/cover.ts`, ≈ 105 ms and 4.9 MB, cheaper than
  clipping areas per chunk; built on first use and shared read-only with the sim's surfaces and the
  audio host), every
  static item as a `Piece` (an anchor polyline plus a `draw` function), the pieces bucketed per
  chunk with the range of segments that reach it, and the trees bucketed per chunk and kind. A chunk
  build reads only its own bucket; it draws each piece's segments plus one neighbour on each side
  (for ribbon mitres) and keeps exactly the triangles that fall in the chunk, so the result is the
  same as cutting a whole-map build.
- Distances are measured on the screen plane, from the focus to each chunk's box projected along
  the camera's right and up axes, terrain relief included. A valley far below a ridge counts as
  near when the camera shows it beside the focus. The boxes are measured once (`chunkBoxes`);
  their screen rectangles are projected again whenever the view's yaw changes, which is every
  frame of a turn (≈ 1,600 boxes of 8 corners each).
- `world.update(focus, yaw, reach, budgetMs)` runs every frame. `reach` is the half-diagonal of the view
  at the widest zoom (`WIDEST_ZOOM`, 5 texels/m), so zooming out never shows a missing chunk.
  Chunks within reach + 64 m are built, nearest first, until 4 ms of the frame are spent (at least
  one per frame). Chunks beyond reach + 64 + 128 m are dropped: removed from the scene, their
  geometry and instance buffers disposed (the tree shapes are shared and stay).
- Before the first frame, `main.ts` builds every chunk the spawn view needs, so nothing pops in.
- Measured (1280×720 and 2560×1440, focus swept at 40 m/s through Monzone, Equi Terme, Gragnola,
  Colognola, Campiglione and Viano): 20–37 chunks loaded, chunk builds ≈ 0.25 ms on average and
  under 3 ms at worst, first frame after ≈ 0.6–0.85 s, JS heap ≈ 185 MB (was ≈ 550 MB building the
  whole map), no frame over 30 ms, 60 fps. Widened to the whole valley (7.8 × 10 km, 3.3× the
  area), chunks per view do not grow; load times and heap are under [Start-up](#start-up).

The pixel pipeline (`src/render/pipeline.ts`):

- An orthographic camera at 30° elevation. At that angle the ground axes project to exact 2:1
  pixel lines.
- In its home view the camera sits north-west of the focus and looks south-east: the mountains
  rise to the south and east, so this side sees every street. Q and E turn it a quarter at a time
  (the sim's `View`). `screenAxes(turns)` in `src/sim/view.ts` gives the screen axes on the
  ground for each turn. The sim maps on-foot keys through them, and the camera and minimap are
  built from them.
- The host eases the camera's yaw toward `turns × π/2` (`turnToward`). A quarter turn takes
  about a third of a second and stops exactly on the heading, so at rest the 2:1 lines and the
  texel snapping are exact again. Under `prefers-reduced-motion` the view turns at once.
- The scene renders into a low-resolution HalfFloat target about 270 texels tall. One fullscreen
  pass then darkens depth edges (outlines), converts to sRGB, and upscales by an integer factor.
- The camera snaps to the texel grid and the remainder becomes a sub-texel scroll offset. The
  static world never shimmers, but the view still scrolls smoothly.
- Zoom (`zoomFor`): 8 texels/m on foot, 6 in a car, 5 above 16 m/s (back to 6 below 13 m/s).
- The camera leads the player by 0.6 s of velocity, at most 14 m (`LOOK_AHEAD`), and eases
  toward its target.
- The sun's shadow box follows the view, snapped to shadow-map texels. The sun turns with the
  view, so the lit and shaded wall faces look the same whichever way the camera looks. The box
  covers the ground the view shows (`shadowFit`): a 5 × 5 grid of rays across the view is marched
  down to the terrain, because a slope falling away from the camera shows ground far past the flat
  rectangle (at most 300 m across the light) and a valley seen between the view's edges can lie
  hundreds of metres deeper along the light. Its depth also reaches 1.5 km toward the sun for the
  ridges that shade a valley. The depth bias stays 0.45 m whatever the depth range.
- The far plane is 3 km from the camera (2.5 km past the focus): from the Apuan summits the
  deepest ground in view is ≈ 2.45 km from the camera, past the 1 km the plane used to stop at.

## Audio

The audio schedule (`src/audio/index.ts`) is host code beside render. Its one system,
`Lunigiana/Hear`, reads the player, the vehicles that run or move (with the revs and load the sim's
drivetrain gives for their `Chassis`, speed and pedal at the `Time` step, and whether their wheels
are down), the people on foot, the `Impact`, `Skid` and `Honk` events, the horn key and the view's
turns (the stereo image turns with the screen), and hands them as plain `Heard` data to the
`Audio` service.
`main.ts` provides the director (`src/audio/director`, plain TypeScript), which runs the outdoor
acoustics and drives the Web Audio speaker (`src/audio/speaker.ts`) and its synths
(`src/audio/synth`). The speaker starts its AudioContext on the first key, click or tap once it
exists (made during the last loading steps, so normally the one that dismisses the title card), and
suspends it while the full map or the settings are open or the tab is hidden. In dev builds
`gta.audio` exposes the speaker, its output level and the context. Everything else is in
[audio.md](audio.md).

## HUD

The HUD (`src/hud`) is plain DOM over the canvas, with its markup in `index.html`. It reads only
the `PlayerView` inspector (`src/sim/views.ts`) and the map; the handling store also reads the
`HandlingView` inspector:

- `PlayerView` returns a `PlayerViewModel`: previous and current pose, velocity, mode (`foot`,
  `driving`, `down`), the driven vehicle's label and speed, the vehicle in reach (label,
  occupied, stolen), the score, and the view's quarter turns.
- `vehicleInReach` (`src/sim/body.ts`) answers both the HUD prompt and the `EnterExit` action, so
  the prompt never offers something the key will not do. The touch controls' action button shows
  the prompt's verb (`actionFor` in `src/hud/hud.ts`).
- Location: the name of the nearest road within 15 m, if it has one (tracks and paths skipped,
  so an unnamed road never borrows a side street's name), and the district disc from `districtAt`. Looked up again only after moving 2 m.
- The minimap is drawn once to an offscreen canvas and then blitted around the player, 300 m
  across, turned with the view so that screen-up is up. At 0.3 px/m, the minimap's own scale (90
  canvas px over 300 m, so the blit is 1:1), the whole map is 2340 × 3000 px (7 MP, 28 MB): under
  every browser's canvas limit (the strictest, Safari's, is 16.7 MP). Drawing it takes ≈ 15 ms at
  load; the per-frame blit ≈ 1 ms. hud.css shows its 90 px at 180 CSS px (120 in mobile mode),
  and a click or tap on it opens the full map.
- The full map (`src/hud/worldmap.ts`, `#hud-map` in `index.html`): the key labelled M toggles it
  (matched by the character it types, so AZERTY works; non-Latin layouts fall back to the key's
  position) and Esc closes it; repeats and Ctrl/Cmd/Alt chords are ignored. A click or tap on the
  minimap opens it, one on the map closes it. It paints the whole area north-up at the resolution of
  its own box (the page's, which a phone held upright lays out sideways) with the same layers as the
  minimap (`paintMap`), but roads light and at least 1.5–2 px wide so the network reads. It names
  the OSM villages (big, placed first) and hamlets (`place=*` POIs, localities left out), then the
  peaks that are HUD landmark districts (Monte Sagro, Pizzo d'Uccello...), once per name; a label
  that would overlap another or the north arrow is dropped with its dot. The player is a red arrow
  in a red ring (no label is red), drawn on its own canvas over the map so CSS blinks it (steady
  under `prefers-reduced-motion`), with a 1 km bar and the player's district in the header. It is
  repainted on open, on resize, and when the pixel ratio changes. The dialog takes focus when it
  opens, so screen readers announce its title and the district.
- The settings (`src/hud/settings.ts`), in every build: Esc opens and closes them, except that
  Esc closes the full map first while it is open, and does nothing on the title card; mobile mode
  has no touch control for them yet. They pause
  the game as the map does, the last frame drawn dimmed behind them (drawn again when the window
  is resized). Their Gameplay section holds "Vehicle physics": a radio button for each preset
  (`HANDLING_PRESETS`, with its description), the current one checked, and none with a Custom note
  when the knobs match no preset ([gameplay.md](gameplay.md#presets)).
- The handling store (`src/hud/handling.ts`) holds the player's handling for the settings and the
  debug menu, so both show the same choice: it sends each change as `SetHandling` events and
  keeps it in `localStorage` under `gta-lunigiana/handling`. A preset is stored by its name, so a
  preset retuned in a later build reaches the player; knobs set by hand are stored as the knobs.
  At load it sends the stored handling before the first step.
- While the full map or the settings are open the host pauses the game: the FixedLoop keeps
  running, but `pausable` (`src/hud/hud.ts`) skips the sim update and `main.ts` skips the frame
  (no world render, so actors do not jitter between `PrevPose` and `Pose`, and no audio tick) and
  suspends the AudioContext (`speaker.pause`). Each skipped update drains the controls' press
  edges, keys and touch, so a key tapped on the map (F, Enter) does nothing on resume, while a key
  held through the pause is still held.
- The debug menu (`src/hud/debug.ts`) sets the handling ([gameplay.md](gameplay.md#handling)) in
  dev builds only: `main.ts` loads it inside its `import.meta.env.DEV` block, beside the Ritmo
  monitor, so production builds leave it out. P or the Debug button beside the Ritmo monitor's
  (bottom left; top centre in mobile mode, off the touch controls) opens and closes it. It has a button for each preset, Custom shown when the knobs match none,
  and a control for every knob. It reads the handling from the store, not from the game: the game
  applies a `SetHandling` event only on its next step, and not while the full map or the settings
  pause it, so reading the game could show and store a stale value. Keys pressed inside it do not
  reach the game. What it sets goes through the store, so the settings show it and a reload keeps
  it.
- Mobile mode: an inline script in `index.html`'s head marks the page `touch` when a touch screen
  is the main pointer (`(pointer: coarse)`), before the first paint, so the title card shows right.
  hud.css then shows the touch controls and a smaller HUD (the minimap top left, the speedometer
  and credits between the left controls and the right ones) and hides the key prompt: the action
  button shows its verb, without the vehicle. The card trades its key list for two touch hints and
  "Tap to play", and hides on the tap's click, not its press, so the click cannot land on the
  minimap under it. The keyboard keeps working. In headless Chrome emulating an 844 × 390 phone at 3× on an M4
  Pro, the view is 633 × 293 texels and runs at 60 fps with no frame over 30 ms while the stick is
  held; no real phone has been measured.
- Touch controls (`src/hud/touch.ts`, `#hud-touch`): Ritmo's `Touch` tracks the fingers on the
  canvas. On foot, a thumb on the left half brings the stick under it (full tilt at 56 px), and
  Run shows on the right. In a car the stick goes, and buttons hold the arrow keys like the
  keyboard: ◀ and ▶ on the left steer, Gas and Brake take the bottom right, and Hand brake, the
  action button and Horn a row above them. The action button shows only when it would act; ↺ and
  ↻ always. The zones are read from the drawn buttons on every new touch, so they follow
  hud.css and the mode, and a control the mode hides lets go of its key. `withTouch` turns them
  into keys ([Input](#input)).
- Landscape only: a phone held upright lays the page out sideways (`width: 100dvh`, the height
  Safari's toolbars leave) and turns it a quarter clockwise, to be held sideways (hud.css). The
  renderer and the full map size to the page's box, not the window, and each touch is turned back
  through the inverse of the page's transform about its origin (`unturn`) before `Touch` reads it.
  The settings dialog opens in the top layer, which the page's turn does not reach, so it turns
  on its own.
  On the first tap's click, `holdLandscape` asks for the full screen and then locks the screen to
  landscape, which Android grants; iPhones grant neither to a page, so the page turns itself there.
  It waits for the click because the full screen uses up the tap's user activation, which the
  speaker needs first, on the `touchend`, to start the sound.

## Checks

`pnpm check` runs:

- `tsc`: strict TypeScript, no emit.
- `oxlint` (`.oxlintrc.json`) with `@typeonce/oxlint-plugin-ritmo`:
  - everywhere: `handle-tick-result`, `prefix-descriptor-and-system-names`, `use-cell-value`;
  - in `src/sim/**`: `use-clock-for-time`, `use-random-for-randomness`, `use-ops-for-math`,
    `keep-simulation-headless`, `no-infinity-in-simulation-data`, and a ban on importing
    `render`, `hud`, `audio` or `main.ts`;
  - in `src/audio/**`: a ban on importing `hud` or `main.ts` (they wire the audio host, never the
    reverse).
- `ritmo-devtools lint src/sim/index.ts`: loads `lintTarget` and lints the `setup`, `update` and
  (described, not run) `render` and `audio` schedules. Any warning fails: without the audio
  schedule described, `Impact` and `Honk` would be `event-never-read`. `lintTarget` declares
  `SetHandling` a host event (`hostEvents`), since only the host sends it; undeclared it would be
  `event-never-written`. It also fails if a module the sim loads is not covered by the oxlint
  simulation override.
- `node --test`. Beside the unit tests, these guard the architecture:
  - `determinism` (`src/sim/index.test.ts`): `Determinism.check` runs a 600-frame scripted joyride
    twice, with the handling off its real values (`SetHandling`), and requires identical state,
    transient components included.
  - `saves`: a snapshot taken mid-joyride, with a changed handling, goes through JSON, restores
    into a fresh runtime, and plays on identically.
  - `src/sim/handling.test.ts`: each handling knob's effect, each preset's behaviour, and
    `SetHandling` kept in range and through a save.
  - `src/hud/handling.test.ts`: the handling store (what it stores, restores and sends);
    `src/hud/settings.test.ts`: the settings' keys (Esc on to the router, every other key kept
    from the game) and the preset they show (Custom for a hand-set mix); `src/hud/hud.test.ts`:
    the Esc and M routing (`overlayKey`) and the pause.
  - `src/render/index.test.ts`: every system of every described schedule (`render` and `audio`)
    declares no writes.
  - `src/sim/map/map.test.ts`: invariants of the generated map (see [map.md](map.md)).
  - the audio tests, in Node without Web Audio (see [audio.md](audio.md#tests)).

`src/sim/testing.ts` is the headless test kit: `start(timeline, staging)` makes a runtime with
scripted keys and collects every `Impact` and `Honk` emitted (`heard`), `stage` clears the map and
places exactly the cars and pedestrians a test needs, `World` inspects everything as plain data,
the handling included, and `drive` steps one vehicle with `advance` alone (test ground, no walls)
under a given handling.
