# The map

`pnpm map` runs `src/tools/build-map.ts`. It turns the pinned inputs in `data/raw` into
`src/sim/map/monzone.bin`, the default Lunigiana map (6.7 MB, see
[File format](#file-format)). The build is deterministic (gunzipped, its output is the same bytes
on every machine; the gzipped file is byte-identical with the same Node build, while another zlib
or OS writes other compressed bytes) and takes about 8 s. It prints a lap time per stage
and a summary: counts, the steepest grade per road class, and the size of each part of the file.
Inputs and attribution are in the [README](../README.md).

`src/sim/map/kinds.ts` holds the vocabulary that the build and the game share: road classes and
their default widths, building styles, area kinds, and the tree-trunk size. It imports no data, so the
build can use it before `monzone.bin` exists.

## Cesena

Cesena is a separate experimental city-centre map; it loads instead of Lunigiana, not alongside it.
The pipeline below describes Lunigiana unless a Cesena difference is noted here.

- **Selection**: the title card links to `?map=cesena`; an omitted `map` selects Lunigiana.
  `src/maps.ts` validates the name before download, and the boot host updates the title and credits.
  Switching maps reloads the page and starts a fresh world. The links preserve an explicit seed.
- **Extent**: `region.ts` centres Cesena at latitude 44.1391, longitude 12.2429, with local bounds
  of -2000 to 2000 m on both axes. This covers a 4 by 4 km city-centre area, not the whole comune.
- **Accepted sources**: OpenStreetMap (ODbL) supplies roads, buildings, water, land use and names.
  `pnpm fetch-osm --region cesena` pins a separate `data/raw/cesena.osm.gz` using the tiled API
  fetcher. Regione Emilia-Romagna's
  [DTM 5x5 - ultima edizione](https://geoportale.regione.emilia-romagna.it/catalogo/dati-cartografici/altimetria/layer-2)
  is accepted under the catalogue's CC BY 4.0 licence. `pnpm fetch-rer --region cesena` checks that
  licence and requests WCS coverage `DTM5X5_RDN32_RMD` as an EPSG:4326 GeoTIFF. The pinned
  `data/raw/cesena/source.json` records the request and raster SHA-256. `loadGeoDtm` rejects
  incorrect CRS, incomplete coverage and invalid or missing heights instead of inventing terrain.
- **Excluded sources**: the Tuscany CTR, LiDAR and UCS inputs do not cover Cesena and are not
  reused there. No other terrain, building or imagery source is included for Cesena.
- **Build**: `pnpm map --region cesena` writes only `src/sim/map/cesena.bin`, using the same
  profiles, collision, road graph, parking and packed format as Lunigiana. The source terrain has
  5 m cells; resampling onto the game's 4 m grid does not make it a finer survey.
- **Features**: secondary roads and main-road links use the existing tertiary class; cycleways
  are walkable paths. OSM building height tags are used where present, otherwise existing default
  heights apply. Road widths use class defaults. The Savio's width is the median of perpendicular
  cross-sections through its OSM bank polygons, not the mountain-stream fallback. Neighbourhood
  labels come from OSM place nodes, without Monzone's hand-placed districts or stone cores.
- **Start**: the player starts beside a central street in the connected traffic network, outside
  buildings with an open walk-clear route to the street. Police and station parking use Cesena's
  mapped Carabinieri headquarters and railway station.
- **Checks**: `src/tools/cesena.test.ts` checks landmarks, connected networks, the outdoor spawn,
  nearby cars, measured river widths and deterministic simulation startup. Run `pnpm check` after
  a build. Preview the map with
  `node src/tools/preview-map.ts 0.3 -2000,-2000,2000,2000 .research/cesena-preview.png --region cesena`.
  Repeat builds must have identical decompressed hashes, as for Lunigiana.

## Pipeline

### 1. Sources (`osm.ts`, `ctr.ts`, `shp.ts`, `ucs.ts`, `crs.ts`)

- **OSM**: `data/raw/lunigiana.osm.gz`, written by `pnpm fetch-osm` (`src/tools/fetch-osm.ts`):
  the play area plus 100 m in 4 × 4 API tiles (the `/map` call stops at 50 000 nodes), then every
  multipolygon relation with a land-use, natural, building, leisure or amenity tag fetched whole
  (`/relation/<id>/full`), because most of a forest's member ways lie outside the play area.
  Elements are merged by id and written sorted. A regex reader parses the XML into nodes, ways
  and relations, and assembles multipolygon rings from member ways (unclosed chains are dropped).
  OSM gives the road network and its names, water, rail, land use, barriers, POIs and place names.
- **CTR**: Regione Toscana's Carta Tecnica Regionale 1:2000, 2019 flight, the 25 sheets that map
  ground in the play area (23D11–15, 23D18–21, 23D26–31, 23D34–37, 23D43, 23D46, 23D47, 23D53–55).
  `shp.ts` reads the shapefiles; `crs.ts` converts their EPSG:6707 (RDN2008 / UTM 32N)
  coordinates. The CTR gives the buildings with their surveyed eave elevations, the road surfaces
  with their street names, and the area each sheet maps (`ctr.ts`). The 2019 sheets map the
  villages and the settled valley floors (Vinca, Tenerano, Ugliancaldo and the Solco quarries
  included), about 11% of the play area; the mountains between them are unmapped. A sheet with no
  garages or road surfaces has no `AGE` or `AVI` layer.
- **LiDAR**: Regione Toscana's 1 m digital terrain model, in EPSG:3003 (Monte Mario / Gauss-Boaga
  west): the 2010 flight (46 tiles) everywhere it has data, then the 2012 flight (19 tiles) for the
  Carrara side of the ridge and Monte Sagro, which 2010 did not fly. `crs.ts` converts with the
  EPSG:1660 datum shift plus a residual of (−0.4, +0.5) m, fitted by matching the 2010 surface
  model to the 2019 CTR building outlines. The MATTM 2008 flight (lot 006) adds nothing here and is
  CC BY-SA, so it is not used.
- **10 m DTM**: the 0.65 km² neither flight covers (two patches on the slopes south of Tenerano,
  one in the Sagro quarries) come from Regione Toscana's 10 m DTM of the province of Massa-Carrara
  (derived from the CTR 1:10 000, CC BY 3.0 IT), bent onto the LiDAR: the LiDAR − DTM residual on
  the cells around each patch (−47 to +20 m around the biggest) is spread over it by inverse
  squared distance, so the patch meets the LiDAR without a step.
- **Land cover**: Regione Toscana's "Uso e copertura del suolo" 1:10 000, 2019 (UCS, CC BY 4.0,
  0.5 ha minimum unit), from its WFS. OSM maps the woods and the quarries well but only about a
  fifth of the Apuans' bare rock and half their pastures, so `ucs.ts` adds the open covers: quarries
  (UCS 131), natural pastures (321), heath and scrub (322), bare rock and cliffs (332) and sparse
  vegetation (333). Woods, fields and towns stay OSM's.

`pnpm fetch-rt` (`src/tools/fetch-rt.ts`) downloads the CTR sheets, the LiDAR tiles, the 10 m DTM
and the land cover. It copies the shapefile layers the build reads (`AED`, `AGE`, `AVI`, `AZR`) to
`data/raw/rt/ctr`, and mosaics the LiDAR into `data/raw/rt/dtm.bin` + `dtm.json`: cropped to the
play area plus 32 m, averaged to 2 m cells (the game grid is 4 m), stored as int16 decimetres
with each row delta-coded and deflated (15 MB). It writes the kept land-cover polygons, in
EPSG:3003 to the decimetre, to `data/raw/rt/ucs.json.gz` (`crs.ts` has the inverse transform);
the WFS box is padded by 500 m, because the server's box filter sometimes drops features near its
edge.

### 2. Projection and play area (`geometry.ts`)

Equirectangular around `ORIGIN` (lat 44.16175, lon 10.13), with `M_PER_DEG` = 111115.37 m per
degree of latitude and 79987.94 m per degree of longitude. x = east, y = north, in metres, rounded
to 0.1 m. The play area `BOUNDS` is x −2900…4900 m, y −6100…3900 m (7.8 × 10 km; lat
44.1069–44.1968, lon 10.0937–10.1913): the whole catchment of the Lucido, ridge to ridge, from its
mouth in the Aulella below Gragnola up both branches. Up the Vinca branch: the SP59, Vinca and its
valley to Foce di Vinca, the Garnerone and Foce di Giovo, with Monte Sagro, Monte Borla and their
quarries on the ridge. Up the Equi branch: Equi Terme, the Solco di Equi and its quarries, Pizzo
d'Uccello and Ugliancaldo. West of the Lucido: Tenerano and the SP10, Viano, Pieve di Viano,
Colognola, Campiglione and Vezzanello; Monzone, Aiola, Codiponte and Casciana in the middle. Being
a rectangle, the area also takes in some of the Aulella side (Argigliano), the Bardine side and the
Carrara side of the ridge (Campocecina). Lines are clipped with Liang–Barsky and rings with
Sutherland–Hodgman.

### 3. Features (`features.ts`)

- **Roads**: OSM highway classes `tertiary`, `unclassified`, `residential`, `service`, `track`,
  `path` and `steps`, plus four values folded into them: `primary` (the SR445 della Garfagnana
  through Gragnola and Codiponte, a two-lane valley road) is `tertiary`, `living_street` is
  `residential`, `footway` and `pedestrian` are `path`. A highway way tagged `area=yes` is a
  square, not a road (a pedestrian square becomes a `paved` area). Other highway values are
  skipped. The ways keep `oneway`, `bridge`, `tunnel`, `layer`, `maxheight` and private access.
  - Width, surface and name come from the CTR road surfaces (`fitRoads` in `ctr.ts`). Every 4 m
    along a drivable road (skipping 6 m at each end), a station on a surface measures the surface
    across the centreline. Stations with more than 10 m on either side (squares, car parks) are
    skipped. A road with at least half its stations, and three or more, on a surface takes the
    median width (clamped to 3–12 m) and asphalt or dirt by most stations. It takes the street
    name most stations share (the CTR's upper-case toponym, cased like "Via Castel dell'Aquila"
    and "Via XX Settembre") when the same holds for its stations inside the area the sheets map,
    so a road that runs on into the unmapped mountains keeps the name of its village stretch (Via
    di Ugliancaldo). OSM names stay, and so do specific OSM surfaces (cobblestone, gravel). Roads
    the CTR does not cover keep their class width (6.5, 5, 4.5, 3.5, 3, 1.5 and 2 m).
  - Roads still unnamed take a street name from `addr:street` votes (the nearest road to most
    addresses with that name).
- **Water**: every `waterway` except culverts, with a water width, a gravel-bed half-width and a
  depth, measured on the 2010 orthophoto:

  | Water | Width | Bed half-width | Depth |
  |---|---|---|---|
  | Torrente Aulella (25–35 m gravel bed at Gragnola, a wooded 10 m channel at Codiponte) | 12 m | 13 m | 2.5 m |
  | Torrente Lucido, river part (Monzone to Gragnola) | 14 m | 11 m | 2.5 m |
  | Torrente Lucido (Vinca branch) and Torrente Caldanella (from Equi), ways averaging under 500 m of ground | 8 m | 5 m | 1.5 m |
  | other named streams, and the Lucido above Vinca | 4 m | 3 m | 1 m |
  | unnamed streams | 2 m | 3 m | 1 m |

  A way's class comes from its mean LiDAR ground over its vertices, so water is extracted once the
  terrain is loaded. The Vinca branch shows 6–11 m of open marble gravel below 250 m and 4–6 m up to
  400 m; from 500 m its bed is under closed canopy. Its way from the source under the Garnerone down
  to Vinca (mean 826 m) is a beech-wood gully with 3–6 m windows of bed, so it gets 4 m. The
  Caldanella runs 15–16 m between walls at Equi and 5–9 m of boulders down to Monzone. The Solco di
  Equi (dry, 5–7 m of gravel in the gorge) and the other named streams keep 4 m. Other rivers would
  be 2.5 m deep with the stream widths.
- **Rail**: `railway=rail` (the Lucca–Aulla line), with bridges and tunnels.
- **Buildings**: the CTR's wherever its sheets map the ground, OSM's elsewhere (an OSM building
  is dropped when its centroid lies in a mapped area).
  - CTR buildings are the `AED` volumetric units plus garages and ruins from `AGE`. Each unit is
    one building: a terrace of houses becomes one building per house, each with its own height
    and roof. Not buildings here: overhangs, canopies, tents, porticoes, loggias and
    semi-basements. The CTR code gives a kind and, for churches, towers, the station and
    industrial buildings, a fixed style.
  - Height: the surveyed eave elevation (`Qt_grmax`) minus the lowest ground under the footprint
    (see `z0` below), when that comes to 1.5–45 m. Otherwise, and for garages and ruins (no
    elevations), a default by kind (house 6 m, shed 2.5 m, garage 2.6 m, ruin 2.5 m...). The
    CTR's ground elevation is not used: it disagrees with the LiDAR on a quarter of the units.
  - A CTR building inside an OSM footprint takes that building's name, and its style when the
    CTR only says "building" (the bell tower of San Prospero is an OSM tower) and surveyed no
    fixed-style unit inside the same footprint: where the CTR maps the church itself, the other
    units in an OSM church outline are the houses around it (Tenerano, Vinca, Viano).
  - OSM buildings (outside the CTR's area, about 610 of them: mountain huts, quarry sheds, the
    Carrara side): height is the `height` tag clamped
    to 2.5–22 m, otherwise 6 m (ruins 2.5 m). Style comes from the tags: `ruin`, `church`,
    `tower`, `station`, `industrial`.
  - Generic buildings are `stone` inside the historic cores (`STONE_CORES`, discs traced on the
    2010 orthophoto: the dense blocks around the church or castle) and `plaster` elsewhere. The
    cores are Monzone Alto, Aiola, the Castellaccio, Gragnola's borgo by the Lucido and the
    Castello dell'Aquila, Equi Terme's old village under the church, Viano, Pieve di Viano,
    Campiglione, Vezzanello, Colognola, Terma, Isolano, La Rocca di Monzone, Monte dei Bianchi,
    Mezzana, Fazzano, La Giunca-Mozzano, Folegnano, the borgo west of Pian del Molino, Cortila,
    La Traggiara, Codiponte's borgo south of the Aulella, Casciana, Vinca's borgo around
    Sant'Andrea and its upper street, Tenerano's ring, Ugliancaldo's castle ring and its borgo down
    the ridge to Sant'Andrea, and Argigliano's borgo below Santa Maria. The newer houses along the
    main roads (Molina di Equi, Pian del Molino, the SR445 in Gragnola) are plaster.
  - Plaster and stone buildings within 25 m of each other form a hamlet; a hamlet of up to 200
    buildings takes its majority style, so it never splits at a core radius. Bigger clusters
    (Gragnola, Codiponte, Mezzana, Equi Terme) keep the core split, but each terrace block
    (buildings within 6 m) takes its own majority style. `tint` 0–3 comes from a hash of the id.
- **Areas**: landuse, leisure, amenity, railway platform, historic ruins, grassland and wood
  polygons, mapped to `AREA_KINDS`, plus pedestrian squares as `paved`. Mountain covers:
  `landuse=quarry` is `quarry`, `natural=bare_rock`/`rock` is `rock`, `natural=scree`/`shingle`
  is `scree` (mostly ravaneti, the quarries' marble waste), `natural=scrub`/`heath` is `scrub`,
  and `natural=fell`, `landuse=meadow`/`grass` are `grassland`. The UCS land cover adds its
  quarries, rock (`rock`), sparse vegetation (`sparse`), pastures (`grassland`) and heath
  (`scrub`). The CTR's asphalt road surfaces are added as `paved` areas: squares, lay-bys and
  station forecourts.
- **Barriers**: `barrier=wall`, `barrier=guard_rail` and `natural=cliff` lines. Walls and cliffs
  are opened wherever a road (not a tunnel) comes within w/2 of them (`openBarriers` in
  `walls.ts`): OSM draws cliffs across the paths that climb through them and garden walls up to
  the centreline. Guard rails run along their road and stay whole.
- **POIs**: tagged nodes (minus guideposts, level crossings, benches and most highway nodes),
  plus named polygons as centroid POIs with kind `area:<kind>`.

### 4. Heightmap (`terrain.ts`)

The LiDAR terrain is sampled through the projection (computed exactly on a 50 m lattice,
bilinear in between). Each node of the 4 m grid over the bounds (1951 × 2501 nodes) is the mean
of a 5 × 5 m square of samples. This grid is carved and flattened by the next steps; profiles and water sample the untouched terrain (the "ground"). Elevations run from 147 m
(the Aulella below Gragnola) to 1799 m (the north-west ridge of Monte Grondilice).

### 5. River carving (`water.ts`)

- The water surface is sampled every 2 m at ground − depth/2. It is made monotone downstream and
  continuous at confluences: a tributary's tail is lowered (by at most 0.25 extra slope) or ponded
  up to the level of the water it joins. The Lucido meets the Aulella below Gragnola.
- The bed is carved into the grid: depth/2 below the surface inside w/2, a gravel slope out to the
  bed width, then a one-cell bank back to the terrain.

### 6. Road and rail profiles (`profiles.ts`, `terrain.ts`)

- Pieces are chained through nodes where exactly two ends meet. Each chain is resampled every 4 m
  from the ground and smoothed with a moving average. Bridges and tunnels are straight between
  their ends.
- Within each pass, the next chain profiled is the longest one that touches a node an earlier
  chain already set, else the longest left. Elevations spread along the network from where it is
  pinned, so a short link is not pinned at both ends by chains fitted apart (a lane in Codiponte
  between two levels got a 93% straight line that way).
- The profile is then fitted to a grade limit through hard pins: elevations already set at
  shared nodes by earlier chains, and rail clearance bounds. The fit is the midpoint of the two
  grade envelopes, so cut and fill split evenly.
- Where the fit strays more than 4 m from the smoothed ground, the grade limit within 60 m is
  raised in 10% steps, up to 1.5× the class limit.

| Pass (in order) | Grade limit | Smoothing half-window | Rank |
|---|---|---|---|
| rail | 2.5% | 100 m | 1 |
| tertiary (with the SR445) | 10% | 20 m | 0 |
| unclassified, residential | 15% | 20 m | 2 |
| service, track | 20% | 20 m | 3 |

- Each profile is written into the grid: the core (max(w/2 + 0.3 + 2, 3) m, half a 4 m cell past
  the carriageway's edge) takes the road elevation, and the next 8 m blend back to the terrain. A
  core that stopped at w/2 + 0.5 left the outer node of most cells the carriageway's edge crossed
  on the hillside, so the drawn road leaned across with it: under a Panda in its lane more than
  10% at 3.5% of 40,000 sampled positions and more than 20% at 1.2%, enough to roll an Ape over.
  With the wider core those shares are 1.1% and 0.5%, mostly at junctions and road ends. A core a
  whole cell wider (0.9%, 0.4%) cut road banks steep enough to paint as rock 2.5% more often (0.9%
  with this one), and a bank steeper than bare rock (50°) echoes: 17 of the 23 asphalt points of
  a 25 m grid over Monzone hear one (the spawn an echo 312 m away, 1.8 s, off a bank beside a
  road). The wider core also buries more of the narrow streams (under 4 m wide, which
  roads may write over): with a core a cell wider, 664 m of stream ran more than 1 m under the
  terrain against 474 m before, and houses on a bank above a road lost up to 8 m of base (above
  the SR445 near (50, −290)). At junctions the lower rank keeps the cell, so tertiary beats rail and
  rail beats the rest.
- Grid nodes inside the wider streams (w ≥ 4 m) are protected: no road writes them. Bridges and
  tunnels write nothing. Paths and steps are not profiled.
- Rail: level crossings meet the road at its natural level. A road under a rail bridge (or in a
  tunnel under the rail) keeps `maxheight` (4 m when untagged) plus a 1.5 m deck below it. The
  rail stays at least 3 m above the water it bridges. A rail tunnel passes under everything: the
  3.2 km of the line's tunnel from Equi Terme to Argigliano run under the streams on the hillside.
- A bridge or tunnel no profiled chain covers (paths, steps) is a straight line between its ends.
  Under the rail both ends keep the road clearance, as in a profiled tunnel (the pedestrian
  underpass at Equi Terme station).

### 7. Water under decks (`water.ts`)

Bridges keep 2.5 m of clearance over the water: the surface is capped there, settled again
downstream, and re-carved outside road cores. At-grade road crossings imply a culvert, where the
water dips 0.3 m below the road (the two fords over the Aulella, at and below Codiponte, are
such crossings). Water left perched more than 1 m above the terrain (streams that end at a road cut)
drops to the terrain, except inside a wider channel it flows into, and there only while it still
runs downhill: a stream dropped into a river's carved bed never steps back up. The grid is then
rounded to 0.1 m and stored as integer decimetres.

### 8. Collision walls (`walls.ts`)

Walls are segments of at most 16 m. Blocked 4 m cells are traced with marching squares and
simplified (Douglas–Peucker, 1.5 m tolerance). Slopes use a 12 m baseline, so shorter steps
(terrace walls, road cuts) stop no one. Steep cells are majority-filtered (3 × 3) so the walls
follow slopes, not single-cell bumps.

| Wall source | `walk` | `drive` |
|---|---|---|
| Water cells (within max(w/2, 2) m of the centreline) | yes, except on any road | yes, except where a drivable road crosses (bridge or ford) |
| Slope | > 35°, except on any road | > 25°, except within w/2 + 1.5 m of a drivable road |
| Building outlines | yes | yes |
| `wall`, `cliff` barriers | yes | yes |
| `guard_rail` barriers | no | yes |
| Map bounds | yes | yes |
| Road-exit caps (4 m inside, where drivable roads leave the area) | no | yes |
| Bridge parapets (w/2 + 0.25 m each side of a drivable bridge's deck, where `lines.ts` draws them; open where any other road, tunnels included, crosses under, joins or carries on) | no | yes |

- Road buffers are padded by half a cell plus the simplification tolerance, so no traced wall
  comes within w/2 of a centreline. The carved banks of the wider streams skip the slope test.
- Where a drivable road (not a tunnel) runs through or along a footprint, the house gives way:
  OSM centrelines and CTR footprints disagree by a metre or two, and none of these roads is
  tagged as a passage. `clipBuildings` cuts a corridor of min(w/2, 1.2) m half-width out of the
  footprint (rasterised at 0.2 m and traced like the walls), so the house drawn and its walls are
  one outline. A footprint cut in two becomes two buildings with the same id; slivers under
  4 m² are dropped. Clipped houses lose their hip roof.
- Tunnels, paths and steps under arches only open such a corridor in the walls: the house is
  drawn whole, the passage stays open and the interior stays closed.
- Tree trunks are not stored as walls. `wallsNear` indexes the trees as points and adds a 0.5 m
  square (`pushTrunk`, `TRUNK` in `kinds.ts`) around each tree a query reaches.

### 9. Road graph (`graph.ts`)

Nodes come from shared OSM node ids (clip points get their own), and edges are split to at most
25 m. Where a road leaves the play area, its end is pulled back 8 m, past the exit cap. `traffic`
is the largest connected component of `tertiary`, `unclassified`, `residential` and `service`
edges (the SR445 and living streets included), minus private roads, dead-end tunnel spurs, and
dead-end tips with no room for a car to turn (a 2.3 m circle clear of drive walls and trunks:
lanes that end between houses); tracks are drivable by the player but get no AI traffic. `walk`
is the largest connected component of every edge except tunnels.

### 10. Trees, spawns, districts (`spawns.ts`, `districts.ts`)

- **Trees**: a jittered lattice at one tree per 50 m² inside forest areas. Trees stay out of other
  areas, buildings (plus 2 m), roads (w/2 + 2 m), stream beds and the rail (6 m). Sparse trees
  also line the banks of the wider streams. No cap: about 1 012 000 trees, positions rounded to 1 m
  (at most one tree per spot) and a scale of 0.8–1.3 (1.7 MB of the gzipped map file). Placement
  uses a fixed hash, not a random generator.
- **Player spawn**: the Via Cesare Battisti sidewalk nearest the Carabinieri station, with 1.3 m
  clear of walk and drive walls. Cesena uses a central street in its connected traffic network.
  The final rounded position must lie outside every building footprint and have a walk-clear
  route to its street centreline, sampled at intervals no greater than 0.5 m. Wall distance alone
  can accept a point deep inside a building, leaving the player trapped.
- **Parked spots**: one per 8 buildings (797) on the right kerb of tertiary, unclassified and
  residential roads (not bridges or tunnels), at least 12 m from junctions and 9 m from each
  other, with two or more buildings within 40 m, off every carriageway (tunnels included) and
  clear of walls. The two nearest the Carabinieri station come first (the sim parks their cars
  there); the rest are drawn in hash order from every village's candidates, so each village gets
  its share. Car parks within 150 m of Monzone station add up to 6 nose-in spots each (805
  spots in all). The sim decides how many cars to park on them.
- **Districts** (`districts.ts`): 14 hand-placed discs (name, centre, radius) for Monzone's
  station, streets and hill clusters, then a disc per OSM `village` and `hamlet` node outside
  them (26: Gragnola, Equi Terme, Viano, Vinca, Tenerano, Ugliancaldo...), then 35 hand-placed
  landmark discs for the unpopulated mountains (Monte Sagro, Pizzo d'Uccello, Foce di Vinca, Cava
  Cattani, Capanna Garnerone..., and the quarries of the Carrara side): peaks, saddles and huts on
  their OSM nodes, quarries on their pits, localities and ridges centred by hand on the slope they
  name. None overlaps a village disc. A `locality` (a named
  hillside or field, like I Pianelli above Equi Terme) gets none: it would claim the village's
  station and spa. Each building outside Monzone's discs goes to the nearest place node within
  600 m; the place's disc is centred on its node and covers 90% of those buildings plus 10 m,
  clamped to 80–400 m. `districtAt` picks the disc the point is relatively closest to, or the
  nearest rim outside every disc.

## File format

`monzone.bin` is gzip (level 9) of one JSON line, a newline, then four packed sections. The game
loads it as one asset: the browser host downloads and gunzips it and hands the bytes to
`provideMap` (`src/sim/map/packed.ts`) before anything imports the map module; Node (the tests, the
tools, `ritmo-devtools lint`) reads it from disk. It is 6.7 MB, 28.5 MB gunzipped. Gzipped on its
own, the JSON line is 1.5 MB, the heightmap 2.8 MB, the walls 0.7 MB and the trees 1.7 MB. The
base64 JSON it replaced was 36 MB, 14.4 MB gzipped.

`MonzoneMapJson` in `src/sim/map/index.ts` is the schema of the JSON line, `MonzoneMap` the decoded
map the game reads. Polylines and rings are flat `[x0, y0, x1, y1, ...]` arrays. Rings are open:
outer rings counter-clockwise, holes clockwise.

| Field | Contents |
|---|---|
| `version` | `1` |
| `origin`, `mPerDeg` | projection origin (lat, lon) and metres per degree |
| `bounds` | play area `minX`, `minY`, `maxX`, `maxY` (m) |
| `heightmap` | `cell` (4 m), `cols`, `rows`, `x0`, `y0`; the nodes (integer decimetres, row-major, row 0 = south) are the first packed section |
| `roads` | `id`, `cls`, `name?`, `ref?`, `w`, `surface`, `oneway?`, `bridge?`, `tunnel?`, `layer?`, `pts`, `z` (surface elevation per vertex) |
| `buildings` | `id` (OSM id, or negative for the CTR), `kind`, `name?`, `h` (wall height above `z0`), `z0` (lowest ground under the footprint), `style`, `ruins?`, `tint`, `outer`, `holes?` |
| `water` | `id`, `kind` (`river` or `stream`), `name?`, `w`, `pts`, `z` (water surface per vertex) |
| `rail` | `id`, `bridge?`, `tunnel?`, `pts`, `z` (rail top per vertex) |
| `areas` | `kind` (one of `AREA_KINDS`), `name?`, `rings` (outer first, then holes) |
| `barriers` | `kind` (`wall`, `guard_rail`, `cliff`), `pts` |
| `pois` | `id`, `kind` (`key=value` or `area:<kind>`), `name?`, `x`, `y` |
| `districts` | `name`, `x`, `y`, `r` |
| `graph` | `xy` (node coordinates), `edges` (flat `a, b, roadIndex` triples), `traffic`, `walk` (edge indices) |
| `walls` | `walk`, `drive`: segment counts; the `ax, ay, bx, by` segments are the second and third packed sections |
| `trees` | tree count; the `x, y, scale` triples are the last packed section |
| `spawns` | `player` and `parked`: `{ x, y, angle }` |

The packed sections follow the newline in file order: heightmap, walk walls, drive walls, trees
(`packMap` in `src/tools/pack.ts` encodes, `decodeMap` in `src/sim/map/packed.ts` decodes; the
build throws if a value does not fit). Each holds n integers as the zigzag-coded difference
(0, −1, 1, −2... stored as 0, 1, 2, 3...) from the value `stride` places back, split into byte
planes: the low byte of every value, then the next byte of every value. Neighbours differ little
and like bytes sit together, which is what gzip compresses best.

| Section | Integers | Bytes | Stride |
|---|---|---|---|
| heightmap | decimetres (int16), each row delta-coded from its first node | 2 | `cols`: the node to the south |
| walls | decimetres from a point 100 m south-west of the bounds' corner | 4 | 2: the previous x or y |
| trees | whole metres from the same corner (trees stand on whole metres), the scale in hundredths | 2 | 3: the previous tree |

Decoding is exact: the same numbers a one-decimal JSON array would give.

Profiled roads and rail carry extra points where the elevation bends between OSM vertices (dips
under the rail, crests). Graph edges run a → b in the OSM way direction, so a `oneway` road may
only be driven from a to b. Game code reads the map through `src/sim/map/index.ts`: `MAP`,
`graph`, `heightAt`, `wallsNear`, `districtAt`, `roadClassOf` and `buildingStyleOf`, plus two
broad phases the sim and the audio host share: `buildingsIn` over the building boxes
(`buildingBoxes`, indexed like `MAP.buildings`) and `treesIn` over the trees. It never reads the
file itself.

## Checks and tools

`src/sim/map/map.test.ts` checks the built map in about 4 s: heightmap coverage, spawns clear
of walls and off traffic lanes (with parking in each village the map was widened for: Equi
Terme, Gragnola, Colognola, Campiglione, Viano, Vinca, Ugliancaldo and Tenerano), no walls on
roads, no drivable road inside a footprint, closed building interiors, one traffic component
reaching the station, Monzone Alto and each of those villages, grades within 1.5× the class
limits (a track shortcut pinned at both ends by the bends of one quarry road may only be the
straight line between them), bridge and underpass clearances, no perched water, the Lucido's
widths, and valid names, classes, styles, area kinds and districts (each of those villages is
its own HUD name, Equi Terme's station and spa included, and Monte Sagro and Pizzo d'Uccello
name themselves; CTR street names cased like "Via XX Settembre" and "Via Castel dell'Aquila").
Run `pnpm test` after every `pnpm map`. `src/sim/map/packed.test.ts` round-trips a small map
through `packMap` and `decodeMap` (negative values, the widest 2-byte deltas, an empty section, a
newline inside a name) and checks that a value or delta too big for its section throws.

`node src/tools/preview-map.ts [pxPerM=1] [minX,minY,maxX,maxY] [out.png]` draws a top-down PNG of
the built map. It writes `.research/map-preview.png` by default.

## Known data limitations

- **The terrain is 4 m.** The LiDAR resolves 1 m (stored at 2 m), but the game grid averages it
  over 4 m cells: terrace walls, steps and narrow road benches are smoothed into slopes. Slopes
  come from a 12 m baseline. The LiDAR is from 2010 (2012 on the Carrara side), so earthworks
  since then are missing: the quarry floors of the Sagro and Solco basins have moved since, and
  the OSM and UCS quarry outlines (2019–2026) do not match the terrain cut there. The datum
  residual is fitted on the 2010 flight; the 2012 tiles agree with it within about 0.2 m of
  elevation, but their horizontal fit is not checked (no CTR buildings stand there). The three
  10 m DTM patches (south of Tenerano, Cava Bardiglio) are smooth: the 1:10 000 map they come
  from misses the small relief.
- **Roads are profiled, not copied.** Road surfaces follow the LiDAR within 0.5 m on Monzone's
  provincial roads (90th percentile), but the steep lanes of the hill villages are steeper than
  the 15% class limit and are fitted up to 3 m off the terrain there. Bridges come from the OSM
  tags: the LiDAR terrain has no decks.
- **Junction profiles disagree.** Each road's profile is a line, flat across its ribbon, so where
  two roads overlap their surfaces differ: by more than 0.15 m at 16% of the overlapping points
  and up to 2.9 m (measured over 6,000 of them). The ground the wheels and feet stand on
  (`groundZ`) blends the overlapping surfaces, so it stays continuous, while each ribbon is drawn
  at its own profile: under the highest drawn ribbon a wheel sits more than 0.3 m low at about 2%
  of the points inside two or more carriageways, up to about 2.7 m (a residential lane over the
  Via di Ugliancaldo near (4188, 1477)). Tyre marks lie on the highest ribbon within 3 m over the
  wheel (`drawnZ`), so one in a tunnel stays on its floor, not on the hill above. A bridge
  that runs into a tunnel through a stub of at-grade road over a river bank (the 3.4 m bridge at
  Gragnola, OSM 140780476) has no wall on the stub's sides, so a car can drive off it into the
  river.
- **Paths and steps follow the terrain.** They can be very steep (the summary prints the worst
  grade per class). Footways and pedestrian lanes are paths, so the HUD does not name them (Via
  Buca in Equi Terme).
- **Roofs are procedural** (`src/render/roof.ts`: hip roof when the footprint nearly fills its
  minimum-area rectangle, flat otherwise): the CTR gives eave heights, not roof shapes. Small
  units (stairwells, extensions) are separate buildings, so roofs step where the real ones do,
  but every unit gets its own roof.
- **The CTR is from 2019** and maps only the villages and the settled valleys; OSM fills the rest
  (about 610 buildings: huts, quarry sheds, the Carrara side). Road widths fall back to the class width where the CTR has no road surface (parts
  of the SR445 keep 6.5 m), and a surface that spans several streets lends its name to all of them.
- **Facade styles are a judgement.** The stone cores are discs traced by eye on the orthophoto;
  many old houses in the cores are plastered in reality, and a whole hamlet of up to 200
  buildings takes one style.
- **River widths are one value per river.** The Aulella's 12 m water and 26 m bed fit Gragnola
  better than the wooded channel at Codiponte; the gravel bars of the Lucido at Pian del Molino
  are wider than its 22 m bed. The Vinca branch below Vinca is one OSM way, so its 8 m fits the
  valley floor below the SP59 bridge but not the 3–6 m gorge just below Vinca. The LiDAR still
  shapes the banks.
- **Land cover is 1:10 000.** The UCS polygons (0.5 ha minimum) generalise the edge between rock,
  pasture and wood; tree species are not mapped tree by tree (conifers are a flat 3% of the woods,
  their share in the UCS woodland around the valley).
- **Some names only exist on addresses.** The vote can pick the wrong piece of road. Culverted
  waterways are dropped; at-grade crossings imply a culvert instead.
- **Re-downloading changes the map.** `pnpm fetch-osm` pulls current OSM edits; `data/raw` is the
  source of truth.
