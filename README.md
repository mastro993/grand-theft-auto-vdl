# Grand Theft Auto: Lunigiana

> [!WARNING]
> **Grand Theft Auto: Lunigiana is in early development.** Today you can play one valley, about 6% of the planned map, and a separate experimental Cesena city-centre map.

![Title card](docs/screenshots/title.png)

Grand Theft Auto: Lunigiana is an open-world car-theft game in isometric pixel art, set in Lunigiana, the valley of the Magra between Tuscany and Liguria. You walk village streets, steal parked cars (the Carabinieri’s Alfa Romeo included, from right outside their station), carjack traffic and knock pedestrians over, on a map built from survey data of the real places. The isometric camera turns a quarter at a time and renders at low resolution for a pixel-art look.

The game will cover all of Lunigiana, from the beaches at the mouth of the Magra to the Apennine ridge. Today the playable map is one valley of it, the [Valle del Lucido](#the-playable-map-today-the-valle-del-lucido).

This is a fan project. It isn’t affiliated with or endorsed by Rockstar Games or Take-Two Interactive; “Grand Theft Auto” is their trademark.

## Where the game is set: Lunigiana

Lunigiana is the basin of the river Magra and its tributaries. For the game, it’s 21 comuni covering 1,102 km²:

- **Province of Massa-Carrara, Tuscany**: the 14 Lunigiana comuni, Aulla, Bagnone, Casola in Lunigiana, Comano, Filattiera, Fivizzano, Fosdinovo, Licciana Nardi, Mulazzo, Podenzana, Pontremoli, Tresana, Villafranca in Lunigiana and Zeri
- **Province of La Spezia, Liguria**: the 7 comuni of the lower Val di Magra, Sarzana, Santo Stefano di Magra, Vezzano Ligure, Arcola, Castelnuovo Magra, Luni and Ameglia

It runs from about 7 km of coast, between Punta Bianca and the Torrente Parmignola, up to the Apennine ridge between Monte Gottero and Monte Belfiore, which rises to 1,978 m on Monte Casarola. The Apuan Alps close it to the south-east.

### How the map grows, part by part

The map grows one part at a time, each built from the same survey sources as today’s valley. The parts come in this order, tracked in [#3](https://github.com/mastro993/gta-lunigiana/issues/3):

1. [Fivizzano, Casola and the upper Aulella](https://github.com/mastro993/gta-lunigiana/issues/17): the walled town of Fivizzano, the Verrucola fortress and the SS63 hairpins
2. [Fosdinovo, the Bardine valley and the Apuan foothills](https://github.com/mastro993/gta-lunigiana/issues/18): the Castello Malaspina on its crag, olive terraces and Colli di Luni vines
3. [Aulla and the Magra–Aulella–Taverone confluence](https://github.com/mastro993/gta-lunigiana/issues/19): the Fortezza della Brunella, the first motorway (the A15 della Cisa) and the first wide river
4. [Sarzana and the lower Val di Magra](https://github.com/mastro993/gta-lunigiana/issues/20): the first Ligurian part, with the fortresses of Sarzana and the A12–A15 junction
5. [The coast: Bocca di Magra, Marinella, Luni and Montemarcello](https://github.com/mastro993/gta-lunigiana/issues/21): the sea, sand beaches, the Magra mouth and ancient Luni
6. [Bagnone and its valley up to the Sillara–Matto–Marmagna ridge](https://github.com/mastro993/gta-lunigiana/issues/22): an arcaded borgo, its castles and passes up to 1,794 m
7. [Comano, the Lagastrello and the Cerreto](https://github.com/mastro993/gta-lunigiana/issues/23): the Apennine passes above Fivizzano, with the most reliable winter snow in Lunigiana
8. [The middle Magra: Villafranca, Filattiera, Mulazzo and Pontremoli](https://github.com/mastro993/gta-lunigiana/issues/24): Pontremoli’s Castello del Piagnaro and the chestnut country
9. [The Cisa, Brattello and Cirone passes](https://github.com/mastro993/gta-lunigiana/issues/25): the source of the Magra and the A15’s high viaducts and tunnels
10. [Zeri, the Gordana and Teglia valleys and the Passo dei Due Santi](https://github.com/mastro993/gta-lunigiana/issues/26): the Rossano plateau, sheep pastures and the Zum Zeri ski area

Parts 4 and 5 may swap. Before part 1, the engine has to scale: a single map file would exhaust a browser tab’s memory at about 320 km², less than a third of Lunigiana. The map moves into 2 km tiles loaded on demand ([#5](https://github.com/mastro993/gta-lunigiana/issues/5)). Issues [#4](https://github.com/mastro993/gta-lunigiana/issues/4) to [#12](https://github.com/mastro993/gta-lunigiana/issues/12) cover the rest of the groundwork: raw inputs out of git, motorways and other main roads, wide rivers and lakes, terrain where the LiDAR surveys stop, older building maps and the Ligurian sources.

### New landscapes

These landscapes come alongside the parts:

- **Sea, coast and beaches**: the sea at 0 m, sand and pebble beaches, piers and the mouth of the Magra ([#13](https://github.com/mastro993/gta-lunigiana/issues/13))
- **Forest types**: chestnut and oak in the valleys, beech above about 1,000 m and pines on the coast ([#14](https://github.com/mastro993/gta-lunigiana/issues/14))
- **Olive groves and vineyards**: on the hills, where they render as meadow today ([#15](https://github.com/mastro993/gta-lunigiana/issues/15))
- **Snow**: an early-spring snow line on the high Apennines, over bare beech woods ([#16](https://github.com/mastro993/gta-lunigiana/issues/16))

## The playable map today: the Valle del Lucido

The Valle del Lucido is a side valley of the Aulella in eastern Lunigiana, almost entirely in the comune of Fivizzano (province of Massa-Carrara). It runs a little over 14 km, from the flat, farmed valley floor at Gragnola, where the Lucido flows into the Aulella, up to pastures above 1,000 m in the northern Apuan Alps, under Pizzo d’Uccello and Monte Sagro. Local tradition calls the torrent *Lucido*, “bright”, for its clear water.

The Lucido has two branches, the Lucido di Vinca and the Lucido d’Equi, which meet on the valley floor at Monzone, under the 18th-century humpback bridge of Santa Lucia. Monzone has two halves: Ponte di Monzone along the road and the railway, and Monzone Alto on a rocky spur under the church of San Prospero.

Up the Equi branch, Equi Terme has sulphurous springs used since Roman times, karst caves open to visitors, a rock shelter (the Tecchia di Equi) with traces of Neanderthals and cave bears, and the Solco di Equi, a narrow canyon towards Pizzo d’Uccello.

Downstream, Gragnola, the valley’s historic market town, sits below the Malaspina Castello dell’Aquila. In the 19th century, marble quarried on Monte Sagro brought the valley a short period of prosperity; Monzone station’s freight yard served the marble trade, with the stone brought down by an aerial cableway. The Lucca–Aulla railway still climbs the valley through Gragnola, Monzone and Equi Terme.

The playable map covers the whole valley, ridge to ridge: 7.8 × 10 km, from Gragnola up to 1,800 m. It includes:

- **Monzone**: the station quarter on Via Cesare Battisti, the Carabinieri station, and the stone lanes of Monzone Alto
- **Vinca**: the stone village at the head of the western branch, at the end of the SP59’s hairpins, under Pizzo d’Uccello and Monte Sagro
- **Equi Terme**: the spa village up the eastern branch, with its own station, and above it the Solco di Equi gorge with the old marble road’s tunnels and its quarries
- **Gragnola**: the old town at the mouth of the valley, on the SR445 della Garfagnana and the Aulella, with the Castello dell’Aquila on the hill nearby
- **The hill villages**: Tenerano, Viano, Pieve di Viano, Colognola, Campiglione and Vezzanello west of the Lucido; Ugliancaldo on the ridge above the Solco
- **The Apuan ridge**: Pizzo d’Uccello’s north face, the Garnerone, Foce di Vinca, Monte Sagro and Monte Borla, with the white marble quarries of the Sagro basin
- **Hamlets and back roads**: Aiola, Mezzana, Codiponte and Casciana, with the woods, streams and hairpins in between

Roads, rivers, the railway, woods and place names come from OpenStreetMap. Buildings (with their surveyed eave heights), road widths and surfaces come from Regione Toscana’s 1:2000 technical map (2019), the terrain from its 1 m LiDAR surveys (2010 and 2012), and the bare rock, pastures and quarries from its land-cover map (2019).

## Screenshots of the Valle del Lucido

All screenshots come from today’s map:

| | |
|---|---|
| ![On foot beside the Carabinieri’s Alfa Romeo Giulia on Via Cesare Battisti, Monzone](docs/screenshots/monzone-carabinieri.png) | ![Driving the stolen Carabinieri car over the Via delle Cave bridge across the Lucido, beside the railway](docs/screenshots/driving.png) |
| On foot in Monzone, next to the Carabinieri’s car | Over the Lucido in the stolen Giulia |
| ![The full map, opened with M: the whole valley from Gragnola down to Vinca, Pizzo d’Uccello and Monte Sagro](docs/screenshots/full-map.png) | ![Gragnola’s old town on the Lucido and the Via Borgo Lucido bridge](docs/screenshots/gragnola.png) |
| The full map (M) | Gragnola, on the Lucido |
| ![Equi Terme around Piazza delle Terme](docs/screenshots/equi-terme.png) | ![Monzone Alto with the church of San Prospero and its bell tower](docs/screenshots/monzone-alto.png) |
| Equi Terme | Monzone Alto and San Prospero |
| ![Vinca’s stone borgo around Sant’Andrea, at the head of the SP59](docs/screenshots/vinca.png) | ![The Solco di Equi: woods, bare marble walls and Cava Cattani above Equi Terme](docs/screenshots/solco-di-equi.png) |
| Vinca | The Solco di Equi and its quarries |

## Requirements to run and build the game

You need:

- **Node 24**: runs the TypeScript tests and map tools directly, with no build step
- **pnpm 10**: `packageManager` pins it in `package.json`, and `corepack enable` installs it
- **A browser with WebGL**: plus Web Audio for the sound

## Play in the browser

Every push to `main` publishes the game to GitHub Pages at <https://gta-lunigiana.fedemas.dev/> (`.github/workflows/pages.yml`).

## Run the game locally

Install the dependencies and start the dev server:

```sh
pnpm install
pnpm dev
```

Then open `http://localhost:5173`. The server listens on the local network too, so a phone or another computer on the same network can play: open the `Network` address that Vite prints. Anyone on that network can reach it, so stop it on a shared network you don't trust. Every load is a new world. Add `?seed=N` (for example `http://localhost:5173/?seed=42`) to replay the same world: the seed drives every random choice, so the same seed and the same keys give the same game.

Choose **Cesena** on the title card, or open `http://localhost:5173/?map=cesena&seed=42`. Cesena is a separate 4 × 4 km map around the historic centre, with the Savio, the railway station and surrounding neighbourhoods. It uses OpenStreetMap streets and building footprints and Regione Emilia-Romagna's 5 m terrain model. It does not replace or extend Lunigiana. Building heights without OSM height tags and road widths are defaults, not surveyed Cesena measurements.

In dev mode, the backslash key toggles the Ritmo monitor, P toggles the debug menu that tunes the vehicle handling (the knobs it changes stay for the next load), and `http://localhost:5173/lab.html` opens the audio audition page: every sound on a button, its params on sliders, heard from a distance you pick (see [docs/audio.md](docs/audio.md#the-audition-page)).

## Controls on foot and driving

The same keys walk and drive; the table shows what each does in both modes:

| Key | On foot | Driving |
|---|---|---|
| W A S D or arrow keys | walk along the screen directions | up: throttle, down: brake and reverse, left/right: steer |
| Shift | sprint | |
| F or Enter | enter the nearest vehicle (steal, enter or carjack) | get out |
| Q / E | turn the view a quarter left / right | same |
| Space | | handbrake |
| H | | horn while held; in the Carabinieri car, siren on or off |
| M | full map (pauses the game); M, Esc or a click closes it | same |
| Esc | settings, which pause the game: the vehicle physics (Simulation, Balanced or Arcade; a new game starts on Balanced); Esc or Resume closes them. With the full map open, Esc closes the map instead | same |
| P (dev builds only) | debug menu: the vehicle physics presets and the handling knobs, for every vehicle at once; P closes it, and so does Esc while it has the focus | same |

The bindings live in `bindings` in `src/sim/schema.ts`. The HUD shows the street and district you’re in, cars stolen, people hit, the action the key would take, a speedometer while driving, and a minimap. M, or a click on the minimap, opens the full map: the whole area north-up with the villages, hamlets and main peaks named and your position marked.

### Touch controls on a phone or tablet

Where a touch screen is the main pointer, the game runs in mobile mode: the controls are on the screen, so no keyboard or mouse is needed, and the game is always landscape. A phone held upright shows the game turned a quarter, to be held sideways. On Android, the first tap also takes the game full screen and locks it to landscape. On foot a stick walks; in a vehicle, buttons take its place. The controls press the same keys as the keyboard:

| Control | On foot | Driving |
|---|---|---|
| Stick: a thumb on the left half | walk along the screen directions | |
| ◀ / ▶ on the left | | steer left / right |
| Gas / Brake on the right | | throttle / brake, then reverse |
| Run | sprint | |
| Steal, Enter, Carjack or Exit (shown only when it would act) | enter the nearest vehicle | get out |
| ↺ / ↻ | turn the view a quarter left / right | same |
| Hand brake | | handbrake |
| Horn | | horn while held; in the Carabinieri car, siren on or off |
| A tap on the minimap | full map (pauses the game); a tap closes it | same |

The settings have no touch control yet: Esc on a keyboard opens them.

## How the game sounds

The browser synthesises every sound with Web Audio, with no sample files: engines voiced from how each is built and revved by the drive simulation, tyres that squeal when they skid, horns and the Carabinieri siren, crashes, footsteps, voices, wind, crickets, birds, farm dogs, the village church bells striking the hours, and the Lucido and its streams.

Each sound reaches you through outdoor acoustics. It fades with distance and under the background noise, so you hear only what’s near. Houses and hills muffle it, the air dulls it, its pitch shifts as it passes, far crashes arrive late, and loud ones echo off the slopes.

The first key, click or tap once the game has loaded, the one that dismisses the title card, starts the sound. See [docs/audio.md](docs/audio.md) for the details.

## Package scripts

Every script runs with `pnpm`:

| Script | What it does |
|---|---|
| `pnpm dev` | Vite dev server on port 5173, open to the local network (`--host`) |
| `pnpm build` | production build into `dist/` (the Pages workflow adds `--base=./`) |
| `pnpm preview` | serves `dist/` on port 4173 |
| `pnpm check` | `typecheck`, then `lint`, then `test` |
| `pnpm typecheck` | `tsc` (no emit) |
| `pnpm lint` | `oxlint` with the Ritmo plugin, then `ritmo-devtools lint src/sim/index.ts` |
| `pnpm test` | `node --test` over `src/**/*.test.ts` |
| `pnpm map` | rebuilds `src/sim/map/monzone.bin` from `data/raw` |
| `pnpm map --region cesena` | rebuilds the separate `src/sim/map/cesena.bin` from pinned Cesena inputs |
| `pnpm fetch-osm` | downloads the OpenStreetMap extract again into `data/raw/lunigiana.osm.gz` |
| `pnpm fetch-osm --region cesena` | downloads the Cesena extract into `data/raw/cesena.osm.gz` |
| `pnpm fetch-rt` | downloads the Regione Toscana sources again into `data/raw/rt` |
| `pnpm fetch-rer --region cesena` | verifies the terrain licence and downloads Emilia-Romagna's DTM into `data/raw/cesena` |

## Repository layout

The simulation, the browser hosts and the map tools live in separate folders:

| Path | Contents |
|---|---|
| `src/sim/` | the simulation: Ritmo schema, systems, collision, routes, drive physics (chassis, tyres, drivetrain, the arcade assists), the handling knobs and presets, tuning. Headless and deterministic |
| `src/sim/systems/` | one file per system group (spawn, enter/exit, foot, drive, traffic, pedestrians, physics, contacts, populate) |
| `src/sim/map/` | the generated maps (`monzone.bin`, `cesena.bin`), their shared decoder, types and lookups (heights, walls, road graph, ground elevation, surfaces, land cover) |
| `src/render/` | Three.js host code: pixel pipeline, static world meshes, actor meshes, tyre marks and smoke, the render schedule |
| `src/audio/` | Web Audio host code: the audio schedule, the acoustics director, the speaker and mixer, the synths, the audition page |
| `src/hud/` | DOM HUD: the title card as loading screen, location names, score, prompt, speedometer, minimap, full map (M), touch controls (mobile mode), settings (Esc) with the vehicle physics, and the dev-only debug menu (P) for the vehicle handling, both setting it through one store |
| `src/tools/` | the region-aware map pipeline (`build-map.ts`, `region.ts`), the downloaders (`fetch-osm.ts`, `fetch-rt.ts`, `fetch-rer.ts`) and a top-down preview renderer |
| `src/maps.ts` | browser map catalogue and validation of the `?map=` choice |
| `src/boot.ts` | browser entry: downloads the map with progress, then imports the game |
| `src/main.ts` | browser host: builds the scene, makes the runtime, runs the fixed loop |
| `index.html` | canvas, HUD and touch-control markup, title card (the loading screen), and the switch to mobile mode |
| `lab.html` | the audio audition page (dev server only) |
| `data/raw/` | pinned map inputs: regional OSM extracts, Regione Toscana CTR and LiDAR, Emilia-Romagna DTM |
| `docs/` | architecture, map pipeline, gameplay and audio notes; `docs/standards/` holds the checks for each part of the game |

## Rebuilding the map

Rebuild the map from the pinned inputs with one command:

```sh
pnpm map
```

The build reads only `data/raw` and takes about 8s. Its output is deterministic: with the same inputs, `monzone.bin` (6.7 MB, gzipped) gunzips to the same bytes on every machine, and comes out byte-identical with the same Node build (another zlib or OS compresses differently). Never edit `monzone.bin` by hand.

Build Cesena without changing Lunigiana with `pnpm map --region cesena`. The checked-in inputs are sufficient; only run `pnpm fetch-osm --region cesena` and `pnpm fetch-rer --region cesena` when intentionally updating them. `data/raw/cesena/source.json` records the terrain request, verified CC BY 4.0 licence and raster SHA-256. Preview it with `node src/tools/preview-map.ts 0.3 -2000,-2000,2000,2000 .research/cesena-preview.png --region cesena`, then run `pnpm check`.

The inputs in `data/raw` are:

- `lunigiana.osm.gz`: an OpenStreetMap API 0.6 extract of the play area plus 100 m (lat 44.1060–44.1977, lon 10.0925–10.1925), written by `pnpm fetch-osm` (`src/tools/fetch-osm.ts`) from 4 × 4 `https://api.openstreetmap.org/api/0.6/map?bbox=…` tiles. It fetches every land-use, natural, building, leisure or amenity multipolygon whole with `https://api.openstreetmap.org/api/0.6/relation/<id>/full`, because most of a forest’s member ways lie outside the play area. It merges the elements by id and sorts them, so the same OSM data always gives the same file.
- `rt/`: Regione Toscana data from the Geoscopio cartoteca, written by `pnpm fetch-rt` (`src/tools/fetch-rt.ts`, which needs `unzip`; the download URLs are pinned there):
  - `ctr/<sheet>_<layer>.shp.gz` + `.dbf.gz`: CTR 1:2000 (2019), the 25 sheets that map ground in the play area (23D11–15, 23D18–21, 23D26–31, 23D34–37, 23D43, 23D46, 23D47, 23D53–55), layers `AED` (buildings with eave elevations), `AGE` (garages, ruins), `AVI` (road surfaces with street names) and `AZR` (the area each sheet maps).
  - `dtm.bin` + `dtm.json`: the 1 m LiDAR terrain model, 46 tiles of the 2010 flight and 19 of the 2012 flight (Monte Sagro and the Carrara side), mosaicked, cropped to the play area plus 32 m and averaged to 2 m cells. The 0.65 km² no flight covers come from the 10 m DTM.
  - `ucs.json.gz`: the land cover 1:10 000 (2019) polygons the build uses (quarries, bare rock, sparse vegetation, pastures, heath), from the Regione Toscana WFS.

Downloading the OSM data again pulls current edits, so the map changes; the files in `data/raw` pin it. `node src/tools/preview-map.ts` draws a top-down PNG of the built map (see [docs/map.md](docs/map.md)).

## Data attribution and licences

The map uses open data under these licences:

- **OpenStreetMap**: map data © OpenStreetMap contributors, available under the [Open Database License (ODbL) 1.0](https://www.openstreetmap.org/copyright). `monzone.bin` and `cesena.bin` are derived databases and stay under the ODbL.
- **Regione Toscana**: buildings, road surfaces, elevation and land cover, “Fonte dei dati: Regione Toscana – Rilievi LIDAR”, the Carta Tecnica Regionale 1:2000 and the Uso e copertura del suolo 2019, under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/), and the DTM 10x10 metri, under [Creative Commons Attribution 3.0 Italia](https://creativecommons.org/licenses/by/3.0/it/), from the [Geoscopio cartoteca](https://www502.regione.toscana.it/geoscopio/cartoteca.html).
- **Regione Emilia-Romagna**: Cesena terrain from [DTM 5x5 - ultima edizione](https://geoportale.regione.emilia-romagna.it/catalogo/dati-cartografici/altimetria/layer-2), under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/), downloaded through the region's WCS. The game resamples the 5 m source onto its 4 m terrain grid; this does not add survey detail.

The game shows these credits on the title card and in the HUD.

Sources for the description of Lunigiana and the Valle del Lucido: the Italian Wikipedia pages for [Lunigiana](https://it.wikipedia.org/wiki/Lunigiana), [Monzone](https://it.wikipedia.org/wiki/Monzone), [Equi Terme](https://it.wikipedia.org/wiki/Equi_Terme), [Gragnola](https://it.wikipedia.org/wiki/Gragnola_(Fivizzano)), [the Aulella](https://it.wikipedia.org/wiki/Aulella) and [Monzone station](https://it.wikipedia.org/wiki/Stazione_di_Monzone-Monte_dei_Bianchi-Isolano), [Grotte di Equi, *La Valle del Lucido*](https://grottediequi.it/territorio/la-valle-del-lucido/), [*Il nome Valle del Lucido*](https://aipiedidelleapuane.wordpress.com/2017/02/28/il-nome-valle-del-lucido/), [Visit Tuscany: Equi Terme](https://www.visittuscany.com/en/towns-and-villages/equi-terme/), and the valley study in [*ARQ*](https://arqarqt.revistas.csic.es/index.php/arqarqt/article/download/39/36/37).

## Further documentation

The `docs/` folder explains how the game works:

- [docs/architecture.md](docs/architecture.md): simulation and host, schedules, state, input, rendering, audio, HUD and checks
- [docs/audio.md](docs/audio.md): how the game sounds and why: data flow, the acoustics, every sound, the calibration, the audition page and tests
- [docs/map.md](docs/map.md): the map pipeline, the file format and the data’s limits
- [docs/gameplay.md](docs/gameplay.md): on foot, vehicles, traffic, pedestrians, score and tuning

[AGENTS.md](AGENTS.md) routes coding agents to [CODING_STANDARDS.md](CODING_STANDARDS.md), the workflow every change follows, and to the checks for each part of the game in [docs/standards/](docs/standards/).
