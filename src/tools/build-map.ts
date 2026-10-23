// Builds src/sim/map/monzone.bin from data/raw: OSM (fetch-osm.ts) and the Regione
// Toscana CTR 1:2000, LiDAR DTM and land cover (data/raw/rt, written by fetch-rt.ts).
// Run: node src/tools/build-map.ts  (pnpm map), from any directory. Output is deterministic:
// gunzipped, the same bytes everywhere; gzipped, the same file with the same Node build (another
// zlib or OS writes other compressed bytes).
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

import type { MonzoneMap } from "../sim/map/index.ts"
import { fitRoads, readCtr } from "./ctr.ts"
import { fitDistricts } from "./districts.ts"
import { extractAreas, extractBarriers, extractBuildings, extractPois, extractRail, extractRoads, extractWater, nameFromAddresses, type RoadF } from "./features.ts"
import { along, arcLengths, BOUNDS, crossings, flatLine, M_PER_DEG, ORIGIN, r1, segIndex, type V } from "./geometry.ts"
import { buildGraph } from "./graph.ts"
import { REGION } from "./region.ts"
import { packMap } from "./pack.ts"
import { readOsm } from "./osm.ts"
import { chainsOf, lifted, makeProfiler, type Bound, type Linear } from "./profiles.ts"
import { clearance, parkedSpots, playerSpawn, scatterTrees } from "./spawns.ts"
import { loadDtm, loadGeoDtm, makeGrid, sampleGrid } from "./terrain.ts"
import { readUcs } from "./ucs.ts"
import { buildWalls, clipBuildings, openBarriers } from "./walls.ts"
import { carveAll, fitUnderDecks, waterLine, waterProfiles, type Crossed } from "./water.ts"

const ROOT = join(import.meta.dirname, "../..")
const OUT = join(ROOT, `src/sim/map/${REGION.file}.bin`)
const t0 = performance.now()
const lap = (label: string) => console.log(`${label.padEnd(10)} ${((performance.now() - t0) / 1000).toFixed(2)} s`)

const osm = readOsm(join(ROOT, `data/raw/${REGION.id}.osm.gz`))
const ctr = REGION.id === "lunigiana" ? readCtr(join(ROOT, "data/raw/rt/ctr")) : { buildings: [], roadAreas: [], mapped: [] }
const roads = extractRoads(osm), rail = extractRail(osm)
fitRoads(roads, ctr.roadAreas, ctr.mapped)
nameFromAddresses(osm, roads)
const buildings = clipBuildings(extractBuildings(osm, ctr), roads), barriers = openBarriers(extractBarriers(osm), roads), pois = extractPois(osm)
const areas = [
  ...extractAreas(osm),
  ...(REGION.id === "lunigiana" ? readUcs(join(ROOT, "data/raw/rt/ucs.json.gz")) : []), // rock, pastures and quarries OSM lacks above the woods
  ...ctr.roadAreas.filter((a) => a.paved).map((a) => ({ kind: "paved", rings: a.rings })) // squares, lay-bys
]
lap("features")

// ---- terrain: LiDAR -> 4 m grid -> carved water -> roads and rail -> water kept under the decks ----
const ground = REGION.id === "lunigiana" ? loadDtm(join(ROOT, "data/raw/rt")) : await loadGeoDtm(join(ROOT, "data/raw/cesena/dtm.tif"))
const water = extractWater(osm, ground) // widths depend on the way's mean ground
const grid = makeGrid(ground)
const at = (x: number, y: number) => sampleGrid(grid, x, y)
const wp = waterProfiles(water, ground)
carveAll(grid, water, wp)
lap("water")

// Roads may claim river banks but never the water itself.
const protect = new Uint8Array(grid.cols * grid.rows)
const owner = new Uint8Array(grid.cols * grid.rows).fill(255)
{
  const wet = segIndex<null>()
  for (const w of water) if (w.w >= 4) wet.addLine(w.pts, w.w / 2 + 1, null)
  for (let k = 0; k < protect.length; k++) protect[k] = wet.covers(grid.x0 + (k % grid.cols) * grid.cell, grid.y0 + Math.floor(k / grid.cols) * grid.cell) ? 1 : 0
}
const { profile, grown, nodeZ, zOf, denseOf } = makeProfiler(grid, ground, owner, protect)
const zAt = (l: Linear, s: number) => along(arcLengths(l.pts), zOf.get(l)!, s)

const RAIL_DECK = 1.5 // rail bridge structure above an underpass's clear height, m
const UNDERPASS = 4 // clear height of an untagged underpass, m
const RAIL_OVER_WATER = 3 // minimum rail height over the water it bridges, m (more fights the station level crossing 25 m away)
/** Rail over road without a shared node (rail bridge or road tunnel): the road keeps the clearance under the rail. A rail tunnel passes under. */
const railRoad = rail.flatMap((rl) => roads.flatMap((rd) => {
  if (rl.bridge !== true && rd.tunnel !== true) return []
  const level = (c: V) => rl.pts.some((v) => v.id !== undefined && Math.hypot(v.x - c.x, v.y - c.y) < 0.1 && rd.pts.some((u) => u.id === v.id))
  return crossings(rl.pts, rd.pts).filter((c) => !level(c)).map((c) => ({ rl, rd, c, clear: (rd.maxheight ?? UNDERPASS) + RAIL_DECK, exact: rd.maxheight !== undefined }))
}))
type Chain = ReadonlyArray<{ readonly item: Linear }>
/** Mean uncarved ground along `l` within 35 m (arc length) of `s`: a road's natural level before it is profiled. */
const naturalAt = (l: Linear, s: number) => {
  const ss = arcLengths(l.pts)
  let sum = 0, n = 0
  for (let d = Math.max(0, s - 35); d <= Math.min(ss.at(-1)!, s + 35); d += 2, n++) sum += ground(along(ss, l.pts.map((v) => v.x), d), along(ss, l.pts.map((v) => v.y), d))
  return sum / Math.max(1, n)
}
/** Roads under the rail stay that far below it (exactly when the underpass has a maxheight). */
const roadBounds = (chain: Chain): Array<Bound> => railRoad.filter((x) => chain.some((m) => m.item === x.rd))
  .map((x) => ({ x: x.c.x, y: x.c.y, z: zAt(x.rl, x.c.sa) - x.clear, ...(x.exact ? {} : { kind: "max" as const }) }))
/** Level crossings: a rail node shared with a road. */
const levels = rail.flatMap((rl) => roads.flatMap((rd) => rd.pts.flatMap((v, i) => (v.id !== undefined && rl.pts.some((u) => u.id === v.id) ? [{ rl, rd, v, s: arcLengths(rd.pts)[i]! }] : []))))
/**
 * The rail meets level crossings and tagged underpasses (maxheight + RAIL_DECK above them) at the
 * road's natural level, and stays RAIL_OVER_WATER above the water it bridges.
 */
const railBounds = (chain: Chain): Array<Bound> => [
  ...levels.filter((x) => chain.some((m) => m.item === x.rl)).map((x) => ({ x: x.v.x, y: x.v.y, z: naturalAt(x.rd, x.s) })),
  ...railRoad.filter((x) => x.exact && chain.some((m) => m.item === x.rl)).map((x) => ({ x: x.c.x, y: x.c.y, z: naturalAt(x.rd, x.c.sb) + x.clear })),
  ...chain.filter((m) => m.item.bridge === true).flatMap((m) => water.flatMap((w, wi) =>
    crossings(m.item.pts, w.pts).map((c) => ({ x: c.x, y: c.y, z: along(wp[wi]!.s, wp[wi]!.z, c.sb) + RAIL_OVER_WATER, kind: "min" as const }))))
]
const widest = (chain: ReadonlyArray<{ readonly item: RoadF }>) => Math.max(...chain.map((m) => m.item.w))
const ofClass = (...cls: ReadonlyArray<string>) => roads.filter((r) => cls.includes(r.cls))
// The rail goes first (its grade limit is the strictest; roads dip under it and meet it at level
// crossings), then roads by class. Ranks decide grid cells: tertiary 0 beats rail 1 beats the rest.
for (const ch of grown(chainsOf(rail))) profile(ch, { w: 4, rank: 1, grade: 0.025, half: 100 }, railBounds(ch))
for (const ch of grown(chainsOf(ofClass("tertiary")))) profile(ch, { w: widest(ch), rank: 0, grade: 0.1, half: 20 }, roadBounds(ch))
for (const ch of grown(chainsOf(ofClass("unclassified", "residential")))) profile(ch, { w: widest(ch), rank: 2, grade: 0.15, half: 20 }, roadBounds(ch))
for (const ch of grown(chainsOf(ofClass("service", "track")))) profile(ch, { w: widest(ch), rank: 3, grade: 0.2, half: 20 }, roadBounds(ch))
lap("roads")

/**
 * A bridge or tunnel no profiled chain covers (paths, steps): the line between its ends, from the
 * uncarved ground. Under the rail both ends keep the road's clearance, as in a profiled tunnel.
 */
const lone = (l: Linear): Array<number> => {
  const cap = Math.min(...railRoad.filter((x) => x.rd === l).map((x) => zAt(x.rl, x.c.sa) - x.clear))
  const end = (v: V) => Math.min(cap, (v.id !== undefined ? nodeZ.get(v.id) : undefined) ?? ground(v.x, v.y))
  const za = end(l.pts[0]!), zb = end(l.pts.at(-1)!), s = arcLengths(l.pts)
  return s.map((d) => za + ((zb - za) * d) / (s.at(-1)! || 1))
}
const deckZ = (l: Linear) => zOf.get(l) ?? lone(l)
const crossed: Array<Crossed> = []
for (const [l, lw] of [...roads.map((r) => [r, r.w] as const), ...rail.map((r) => [r, 4] as const)]) {
  if (l.tunnel === true || (!lifted(l) && !zOf.has(l))) continue // tunnels pass under; paths follow the terrain
  const z = deckZ(l), s = arcLengths(l.pts)
  water.forEach((w, wi) => {
    for (const c of crossings(w.pts, l.pts)) crossed.push({ water: wi, at: c.sa, half: lw / 2 + (l.bridge === true ? 2 : 1), deck: along(s, z, c.sb), bridge: l.bridge === true })
  })
}
fitUnderDecks(grid, water, wp, crossed, (n) => owner[n] !== 255, at)
for (let k = 0; k < grid.z.length; k++) grid.z[k] = Math.round(grid.z[k]! * 10) / 10
lap("decks")

/** Per-vertex elevation: the profile, a lone bridge's line between its ends, or the terrain (paths). */
const zLine = (l: Linear): Array<number> => (zOf.get(l) ?? (lifted(l) ? lone(l) : l.pts.map((v) => at(v.x, v.y)))).map(r1)
/** Output polyline and z: profiled pieces carry their extra bend samples. */
const lineOut = (l: Linear) => {
  const d = denseOf.get(l)
  return d === undefined ? { pts: flatLine(l.pts), z: zLine(l) } : { pts: flatLine(d.pts), z: d.z.map(r1) }
}

// ---- collision, graph, trees, spawns ----
const walls = buildWalls(grid, roads, water, buildings, barriers)
lap("walls")
const trees = scatterTrees(areas, roads, buildings, water, rail)
lap("trees")
const walkClear = clearance(walls.walk, trees), driveClear = clearance(walls.drive, trees)
/** Room for a car to stop and turn (map.test.ts asks the same of every traffic dead end). */
const TURN = 2.3
const graph = buildGraph(roads, (x, y) => driveClear.circle(x, y, TURN))
const poi = (id: number) => {
  const p = pois.find((q) => q.id === id)
  if (p === undefined) throw new Error(`poi ${id} missing`)
  return p
}
const station = poi(REGION.id === "lunigiana" ? 1813987803 : 827592490), carabinieri = poi(REGION.id === "lunigiana" ? 14183344901 : 806564311)
const central = REGION.id === "lunigiana" ? [] : graph.traffic.map((edge) => {
  const node = graph.edges[3 * edge]!, road = graph.edges[3 * edge + 2]!
  const x = graph.xy[2 * node]!, y = graph.xy[2 * node + 1]!
  return { road: roads[road]!, x, y, distance: Math.hypot(x, y) }
}).sort((a, b) => a.distance - b.distance)
const start = central[0]
if (REGION.id === "cesena" && start === undefined) throw new Error("Cesena has no connected traffic roads")
const player = playerSpawn(roads, walkClear, driveClear, start ?? carabinieri, buildings, start?.road)
const junctions = graph.degree.flatMap((d, n) => (d >= 3 ? [[graph.xy[2 * n]!, graph.xy[2 * n + 1]!] as const] : []))
const parked = parkedSpots({ roads, buildings, areas, junctions, walk: walkClear, drive: driveClear, avoid: player, station, police: carabinieri })
lap("spawns")

const districts = fitDistricts(osm, buildings)

/** Surveyed eave over a building's lowest ground, m, outside which the eave is a survey slip and the default height stands. */
const EAVE = { min: 1.5, max: 45 }
const roadOut = (r: RoadF) => ({
  id: r.id, cls: r.cls, ...(r.name !== undefined ? { name: r.name } : {}), ...(r.ref !== undefined ? { ref: r.ref } : {}), w: r.w, surface: r.surface,
  ...(r.oneway ? { oneway: true } : {}), ...(r.bridge ? { bridge: true } : {}), ...(r.tunnel ? { tunnel: true } : {}), ...(r.layer !== undefined ? { layer: r.layer } : {}),
  ...lineOut(r)
})
const map: MonzoneMap = {
  version: 1,
  origin: ORIGIN,
  mPerDeg: M_PER_DEG,
  bounds: BOUNDS,
  heightmap: { cell: grid.cell, cols: grid.cols, rows: grid.rows, x0: grid.x0, y0: grid.y0, data: Array.from(grid.z, (z) => Math.round(z * 10)) },
  roads: roads.map(roadOut),
  buildings: buildings.map((b) => {
    let z0 = Number.MAX_VALUE
    for (const ring of [b.outer, ...(b.holes ?? [])]) for (let i = 0; i < ring.length; i += 2) z0 = Math.min(z0, at(ring[i]!, ring[i + 1]!))
    const { id, kind, name, eave, style, ruins, tint, outer, holes } = b
    const rise = eave === undefined ? Number.NaN : eave - z0
    const h = rise >= EAVE.min && rise <= EAVE.max ? rise : b.h
    return { id, kind, ...(name !== undefined ? { name } : {}), h: r1(h), z0: r1(z0), style, ...(ruins ? { ruins } : {}), tint, outer, ...(holes ? { holes } : {}) }
  }),
  water: water.map((w, i) => {
    const line = waterLine(w.pts, wp[i]!)
    return { id: w.id, kind: w.kind, ...(w.name !== undefined ? { name: w.name } : {}), w: w.w, pts: flatLine(line.pts), z: line.z.map(r1) }
  }),
  rail: rail.map((r) => ({ id: r.id, ...(r.bridge ? { bridge: true } : {}), ...(r.tunnel ? { tunnel: true } : {}), ...lineOut(r) })),
  areas,
  barriers,
  pois,
  districts,
  graph: { xy: graph.xy, edges: graph.edges, traffic: graph.traffic, walk: graph.walk },
  walls: { walk: walls.walk, drive: walls.drive },
  trees,
  spawns: { player, parked }
}
const { file, sizes } = packMap(map)
const gz = gzipSync(file, { level: 9 })
writeFileSync(OUT, gz)
lap("write")

/** Steepest vertex-to-vertex grade per road class (bridges included), over steps of >= 4 m. */
const grades: Record<string, string> = {}
for (const r of map.roads) for (let i = 1, j = 0; i < r.z.length; i++) {
  const ds = Math.hypot(r.pts[2 * i]! - r.pts[2 * j]!, r.pts[2 * i + 1]! - r.pts[2 * j + 1]!)
  if (ds < 4) continue
  const g = Math.abs(r.z[i]! - r.z[j]!) / ds
  if (g > parseFloat(grades[r.cls] ?? "0") / 100) grades[r.cls] = `${(g * 100).toFixed(1)}% (${r.id})`
  j = i
}
const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`, jsonKb = (v: unknown) => kb(JSON.stringify(v).length)
console.log({
  bytes: gz.length, roads: map.roads.length, buildings: map.buildings.length, water: map.water.length, rail: map.rail.length, areas: areas.length,
  wallsWalk: walls.walk.length / 4, wallsDrive: walls.drive.length / 4, blockedCells: { walk: walls.walkCells, drive: walls.driveCells },
  nodes: graph.xy.length / 2, edges: graph.edges.length / 3, traffic: graph.traffic.length, walk: graph.walk.length, trees: trees.length / 3, parked: parked.length, player,
  grades,
  // the file's parts before gzip (the JSON line, then the packed sections), and the JSON line's biggest fields
  sizes: { ...Object.fromEntries(Object.entries(sizes).map(([part, n]) => [part, kb(n)])), graph: jsonKb(map.graph), roads: jsonKb(map.roads), buildings: jsonKb(map.buildings), areas: jsonKb(areas) }
})
