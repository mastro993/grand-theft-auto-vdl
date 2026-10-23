// OSM (and for buildings the CTR) -> map features in local metres, clipped to the play area.
// Terrain-dependent fields (z, z0) are filled later by build-map.ts.
import type { Area, Barrier, Poi } from "../sim/map/index.ts"
import { type AreaKind, type BuildingStyle, isRoadClass, type RoadClass, ROADS } from "../sim/map/kinds.ts"
import { staticGrid } from "../sim/collide.ts"
import type { Ctr } from "./ctr.ts"
import { assembleRings, type Osm, type OsmWay, type Tags } from "./osm.ts"
import { centroid, clipLine, clipRing, crossings, flatLine, flatRing, hash01, inBounds, pointInRing, r1, ringBox, toLocal, type P, type V } from "./geometry.ts"
import { REGION } from "./region.ts"

export interface RoadF {
  readonly id: number
  readonly cls: RoadClass
  name?: string
  readonly ref?: string
  w: number
  surface: string
  readonly oneway?: true
  readonly bridge?: true
  readonly tunnel?: true
  readonly layer?: number
  /** OSM maxheight (m) of an underpass. */
  readonly maxheight?: number
  readonly private: boolean
  readonly pts: ReadonlyArray<V>
}
export interface WaterF { readonly id: number; readonly kind: "river" | "stream"; readonly name?: string; readonly w: number; readonly bed: number; readonly depth: number; readonly pts: ReadonlyArray<V> }
export interface RailF { readonly id: number; readonly bridge?: true; readonly tunnel?: true; readonly pts: ReadonlyArray<V> }
export interface BuildingF {
  readonly id: number
  readonly kind: string
  readonly name?: string
  /** Wall height when there is no surveyed `eave`, m. */
  readonly h: number
  /** Surveyed eave elevation (CTR), m a.s.l. */
  readonly eave?: number
  readonly style: BuildingStyle
  readonly ruins?: true
  readonly tint: number
  readonly outer: ReadonlyArray<number>
  readonly holes?: ReadonlyArray<ReadonlyArray<number>>
}

const vertices = (osm: Osm, nds: ReadonlyArray<string>): Array<V> =>
  nds.map((id) => {
    const n = osm.nodes.get(id)!
    const [x, y] = toLocal(n.lat, n.lon)
    return { x, y, id }
  })
const ringOf = (osm: Osm, nds: ReadonlyArray<string>): Array<P> => vertices(osm, nds.slice(0, -1)).map((v) => [v.x, v.y])
const closed = (w: OsmWay) => w.nds.length > 3 && w.nds[0] === w.nds.at(-1)

/**
 * OSM highway values folded into a road class: the SR445 (primary) is a two-lane valley road like
 * the provincial ones, living streets drive like residential streets, footways and pedestrian
 * lanes are walked like paths.
 */
const FOLDED: Readonly<Partial<Record<string, RoadClass>>> = { primary: "tertiary", living_street: "residential", footway: "path", pedestrian: "path" }
const CITY_FOLDED: Readonly<Partial<Record<string, RoadClass>>> = { secondary: "tertiary", primary_link: "tertiary", secondary_link: "tertiary", tertiary_link: "tertiary", cycleway: "path" }
const classOf = (t: Tags): RoadClass | undefined => {
  if (t.highway === undefined || t.area === "yes") return undefined // squares are areas
  return isRoadClass(t.highway) ? t.highway : FOLDED[t.highway] ?? (REGION.id === "cesena" ? CITY_FOLDED[t.highway] : undefined)
}

export const extractRoads = (osm: Osm): Array<RoadF> =>
  [...osm.ways.values()].flatMap((w) => {
    const t = w.tags, cls = classOf(t)
    if (cls === undefined) return []
    return clipLine(vertices(osm, w.nds)).map((pts): RoadF => ({
      id: +w.id,
      cls,
      ...(t.name ? { name: t.name } : {}),
      ...(t.ref ? { ref: t.ref } : {}),
      w: ROADS[cls].w,
      surface: t.surface ?? (ROADS[cls].paved ? "asphalt" : "unpaved"),
      ...(t.oneway === "yes" ? { oneway: true } : {}),
      ...(t.bridge !== undefined && t.bridge !== "no" ? { bridge: true } : {}),
      ...(t.tunnel !== undefined && t.tunnel !== "no" ? { tunnel: true } : {}),
      ...(t.layer ? { layer: +t.layer } : {}),
      ...(t.maxheight !== undefined && !Number.isNaN(parseFloat(t.maxheight)) ? { maxheight: parseFloat(t.maxheight) } : {}),
      private: t.access === "private" || t.access === "no",
      pts
    }))
  })

/**
 * Names a street only has on addresses (addr:street of POIs): each goes to the unnamed road whose
 * vertices are nearest to most of its addresses.
 */
export const nameFromAddresses = (osm: Osm, roads: ReadonlyArray<RoadF>): void => {
  const votes = new Map<string, Map<number, number>>()
  for (const n of osm.nodes.values()) {
    const street = n.tags["addr:street"]
    if (street === undefined) continue
    const [x, y] = toLocal(n.lat, n.lon)
    let best: RoadF | undefined, bestD = Number.MAX_VALUE
    for (const r of roads) for (const p of r.pts) {
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < bestD) [best, bestD] = [r, d]
    }
    if (best === undefined || best.name !== undefined) continue
    const v = votes.get(street) ?? new Map<number, number>()
    v.set(best.id, (v.get(best.id) ?? 0) + 1)
    votes.set(street, v)
  }
  for (const [street, v] of votes) {
    const [id] = [...v].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]!
    const name = street.startsWith("Via") ? street : `Via ${street}`
    for (const r of roads) if (r.id === id && r.name === undefined) r.name = name
  }
}

/** Mean ground (m) below which a Lucido or Caldanella way runs on the valley floor; above it, the stream is a wooded mountain gully. */
const MAIN_BELOW = 500

/**
 * Water width, gravel-bed half-width and depth, m, from the way's name, kind and mean ground `z`
 * (LiDAR, over its vertices). The rivers are measured on the 2010 orthophoto: the Aulella runs in
 * a 25-35 m gravel bed at Gragnola (a wooded 10 m channel at Codiponte), the Lucido in a 22 m one
 * below Monzone. The Lucido's Vinca branch and the Caldanella (from Equi) are the main streams on
 * the valley floor (5-16 m of open marble gravel below 400 m). Above Vinca the Lucido runs in a
 * beech-wood gully with only 3-6 m of bed showing, like the other named streams (4 m); unnamed ones are 2 m.
 */
const waterSize = (name: string | undefined, kind: "river" | "stream", z: number): { readonly w: number; readonly bed: number; readonly depth: number } => {
  if (name === "Torrente Aulella") return { w: 12, bed: 13, depth: 2.5 }
  if (name === "Torrente Lucido" && kind === "river") return { w: 14, bed: 11, depth: 2.5 }
  const main = (name === "Torrente Lucido" || name === "Torrente Caldanella") && z < MAIN_BELOW
  const w = main ? 8 : name !== undefined ? 4 : 2
  return { w, bed: Math.max(w / 2 + 1, 3), depth: kind === "river" ? 2.5 : main ? 1.5 : 1 }
}

/** Median cross-section between mapped riverbanks; missing outlines leave the existing default. */
const mappedRiverWidth = (pts: ReadonlyArray<V>, banks: ReadonlyArray<ReadonlyArray<V>>): number | undefined => {
  const widths: Array<number> = []
  for (let index = 1; index < pts.length; index++) {
    const start = pts[index - 1]!, end = pts[index]!
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (length < 1) continue
    const x = (start.x + end.x) / 2, y = (start.y + end.y) / 2
    const nx = -(end.y - start.y) / length, ny = (end.x - start.x) / length
    const section = [{ x: x - nx * 200, y: y - ny * 200 }, { x: x + nx * 200, y: y + ny * 200 }]
    for (const bank of banks) {
      const hits = crossings(section, bank).map((hit) => hit.sa).sort((a, b) => a - b)
      for (let hit = 0; hit + 1 < hits.length; hit += 2) {
        const left = hits[hit]!, right = hits[hit + 1]!
        if (left <= 200 && right >= 200 && right - left >= 2) widths.push(right - left)
      }
    }
  }
  widths.sort((a, b) => a - b)
  const width = widths[Math.floor(widths.length / 2)]
  return width === undefined ? undefined : r1(width)
}

export const extractWater = (osm: Osm, ground: (x: number, y: number) => number): Array<WaterF> => {
  const isBank = (tags: Tags) => tags.waterway === "riverbank" || (tags.natural === "water" && tags.water === "river")
  const banks = REGION.id !== "cesena" ? [] : [
    ...[...osm.ways.values()].filter((way) => isBank(way.tags) && closed(way)).map((way) => vertices(osm, way.nds)),
    ...[...osm.relations.values()].filter((relation) => isBank(relation.tags)).flatMap((relation) => assembleRings(osm, relation, "outer").map((ring) => vertices(osm, ring)))
  ]
  return [...osm.ways.values()].filter((w) => w.tags.waterway !== undefined && w.tags.waterway !== "riverbank" && w.tags.tunnel !== "culvert").flatMap((w) => {
    const t = w.tags
    const kind = t.waterway === "river" ? "river" : "stream"
    return clipLine(vertices(osm, w.nds)).map((pts): WaterF => {
      const z = pts.reduce((s, p) => s + ground(p.x, p.y), 0) / pts.length
      const size = waterSize(t.name, kind, z)
      const measured = kind === "river" && REGION.id === "cesena" ? mappedRiverWidth(pts, banks) : undefined
      return { id: +w.id, kind, ...(t.name ? { name: t.name } : {}), ...size, ...(measured === undefined ? {} : { w: measured, bed: measured / 2 + 1 }), pts }
    })
  })
    }

export const extractRail = (osm: Osm): Array<RailF> =>
  [...osm.ways.values()].filter((w) => w.tags.railway === "rail").flatMap((w) =>
    clipLine(vertices(osm, w.nds)).map((pts): RailF => ({
      id: +w.id,
      ...(w.tags.bridge !== undefined && w.tags.bridge !== "no" ? { bridge: true } : {}),
      ...(w.tags.tunnel !== undefined && w.tags.tunnel !== "no" ? { tunnel: true } : {}),
      pts
    })))

/**
 * Historic stone cores (x, y, r), traced on the 2010 orthophoto (dense irregular blocks around the
 * church or castle); newer houses along the main roads are plaster.
 */
const STONE_CORES: ReadonlyArray<readonly [number, number, number]> = [
  [-20, -300, 170], // Monzone Alto
  [720, 170, 220], // Aiola, with its eastern houses
  [420, -260, 120], // Castellaccio
  [-1730, 3350, 95], // Gragnola, the borgo by the Lucido
  [-1309, 3278, 40], // Castello dell'Aquila, Gragnola (one OSM footprint, centred on its vertex mean)
  [1797, 665, 80], // Equi Terme, the old village under the church
  [-2300, 55, 80], // Viano
  [-2025, 855, 50], // Pieve di Viano
  [-2205, 1540, 70], // Campiglione
  [-2540, 1370, 90], // Vezzanello
  [-1725, 1135, 60], // Colognola
  [-1550, 645, 80], // Terma
  [-1030, 490, 70], // Isolano
  [-1050, 1135, 40], // La Rocca di Monzone
  [65, 1140, 75], // Monte dei Bianchi
  [705, 1215, 65], // Mezzana
  [415, 2025, 60], // Fazzano
  [-245, 2035, 70], // La Giunca-Mozzano
  [-790, 2355, 85], // Folegnano
  [-1462, 1955, 50], // the borgo west of Pian del Molino
  [-1860, 2540, 65], // Cortila
  [-2270, 2790, 50], // La Traggiara
  [1605, 3195, 100], // Codiponte, the borgo south of the Aulella
  [1735, 3180, 55], // Codiponte, the eastern houses
  [2050, 2300, 120], // Casciana
  [2275, -2630, 115], // Vinca, the borgo around Sant'Andrea
  [2165, -2565, 48], // Vinca, the old houses along the upper street west of the core
  [-2212, -865, 65], // Tenerano, the ring borgo
  [4130, 1445, 55], // Ugliancaldo, the castle ring
  [4205, 1405, 60], // Ugliancaldo, the borgo along the ridge
  [4270, 1320, 65], // Ugliancaldo, the borgo down to Sant'Andrea
  [4805, 3225, 65] // Argigliano, the borgo below Santa Maria
]
/** Generic buildings closer than this (m) form a hamlet: up to HAMLET of them take one facade style. */
const HAMLET_LINK = 25
const HAMLET = 200
/** Closer than this (m), buildings are one terrace block, which takes one style in bigger villages too. */
const BLOCK_LINK = 6

/** Stone inside the hill-village cores, plaster elsewhere. */
const genericStyle = (cx: number, cy: number): BuildingStyle => (REGION.id === "lunigiana" && STONE_CORES.some(([x, y, r]) => Math.hypot(cx - x, cy - y) < r) ? "stone" : "plaster")
const isGeneric = (s: BuildingStyle) => s === "plaster" || s === "stone"

const styleOf = (t: Tags, cx: number, cy: number): BuildingStyle => {
  if (t.ruins !== undefined || t.building === "ruins") return "ruin"
  if (t.building === "church" || t.amenity === "place_of_worship") return "church"
  if (t.building === "tower" || t.man_made === "tower") return "tower"
  if (t.building === "train_station") return "station"
  if (t.building === "industrial" || t.power !== undefined) return "industrial"
  return genericStyle(cx, cy)
}

/**
 * Buildings: the CTR's where its sheets map the ground, OSM's elsewhere. A CTR building inside an
 * OSM footprint takes that building's name, and its style when the CTR only says "building" and
 * surveyed no fixed-style unit (the church itself) inside that footprint: then the other units are
 * the houses around it.
 */
export const extractBuildings = (osm: Osm, ctr: Ctr): Array<BuildingF> => {
  const fromOsm = osmBuildings(osm)
  const osmIn = staticGrid(fromOsm.length, (k) => ringBox(fromOsm[k]!.outer), 32)
  /** The index of the first OSM footprint (file order) around the point, or -1. */
  const hostOf = (x: number, y: number) => {
    let first = fromOsm.length
    osmIn(x, y, x, y, (k) => {
      if (k < first && pointInRing(x, y, fromOsm[k]!.outer)) first = k
    })
    return first < fromOsm.length ? first : -1
  }
  const hosts = ctr.buildings.map((c) => hostOf(...centroid(c.outer)))
  const surveyed = new Set(ctr.buildings.flatMap((c, i) => (c.style !== undefined && hosts[i]! >= 0 ? [hosts[i]!] : [])))
  const fromCtr = ctr.buildings.map((c, i): BuildingF => {
    const [cx, cy] = centroid(c.outer)
    const host = fromOsm[hosts[i]!]
    const style = c.style ?? (host !== undefined && !isGeneric(host.style) && !surveyed.has(hosts[i]!) ? host.style : genericStyle(cx, cy))
    return {
      id: c.id, kind: c.kind, ...(host?.name !== undefined ? { name: host.name } : {}), h: c.h, ...(c.eave !== undefined ? { eave: c.eave } : {}), style,
      ...(style === "ruin" ? { ruins: true } : {}), tint: Math.floor(hash01(-c.id % 1e9, 7) * 4), outer: c.outer, ...(c.holes !== undefined ? { holes: c.holes } : {})
    }
  })
  const unmapped = fromOsm.filter((b) => !ctr.mapped.some((ring) => pointInRing(...centroid(b.outer), ring)))
  return unifyStyles(unifyStyles([...unmapped, ...fromCtr], HAMLET_LINK, HAMLET), BLOCK_LINK)
}

const osmBuildings = (osm: Osm): Array<BuildingF> => {
  const rels = [...osm.relations.values()].filter((r) => r.tags.type === "multipolygon" && r.tags.building !== undefined)
  const inRel = new Set(rels.flatMap((r) => r.members.map((m) => m.ref)))
  const make = (id: string, t: Tags, outer: Array<P>, holes: Array<Array<P>>): BuildingF | undefined => {
    const o = flatRing(clipRing(outer), true)
    if (o === undefined) return undefined
    const [cx, cy] = centroid(o)
    const ruins = t.ruins !== undefined || t.building === "ruins"
    const tagged = t.height === undefined ? Number.NaN : parseFloat(t.height)
    const h = Number.isNaN(tagged) ? (ruins ? 2.5 : 6) : Math.min(Math.max(tagged, 2.5), 22)
    const hs = holes.map((r) => flatRing(clipRing(r), false)).filter((r) => r !== undefined)
    return {
      id: +id,
      kind: t.building === "yes" && t.amenity === "place_of_worship" ? "church" : t.building!,
      ...(t.name ? { name: t.name } : {}),
      h: r1(h),
      style: styleOf(t, cx, cy),
      ...(ruins ? { ruins: true } : {}),
      tint: Math.floor(hash01(+id % 1e9, 7) * 4),
      outer: o,
      ...(hs.length > 0 ? { holes: hs } : {})
    }
  }
  return [
    ...[...osm.ways.values()].filter((w) => w.tags.building !== undefined && !inRel.has(w.id) && closed(w)).map((w) => make(w.id, w.tags, ringOf(osm, w.nds), [])),
    ...rels.flatMap((r) => {
      const inner = assembleRings(osm, r, "inner").map((ring) => ringOf(osm, ring))
      return assembleRings(osm, r, "outer").map((ring) => make(r.id, r.tags, ringOf(osm, ring), inner))
    })
  ].filter((b) => b !== undefined)
}

/**
 * Plaster/stone buildings within `link` m of each other (single linkage) form clusters; each
 * cluster of at most `max` buildings takes its majority style, so it never splits at a core radius.
 */
const unifyStyles = (bs: ReadonlyArray<BuildingF>, link: number, max = Infinity): Array<BuildingF> => {
  const generic = bs.map((b) => isGeneric(b.style))
  const parent = bs.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!
    return i
  }
  const near = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) => {
    for (let i = 0; i < a.length; i += 2) for (let j = 0; j < b.length; j += 2) if (Math.hypot(a[i]! - b[j]!, a[i + 1]! - b[j + 1]!) < link) return true
    return false
  }
  // Candidate pairs: the generic footprints whose box, grown by `link`, overlaps this one's.
  const gen = bs.flatMap((_, i) => (generic[i] ? [i] : []))
  const boxes = bs.map((b) => ringBox(b.outer))
  const grid = staticGrid(gen.length, (k) => {
    const [x0, y0, x1, y1] = boxes[gen[k]!]!
    return [x0 - link, y0 - link, x1 + link, y1 + link]
  }, 64)
  for (const i of gen) grid(...boxes[i]!, (k) => {
    const j = gen[k]!
    if (j > i && find(i) !== find(j) && near(bs[i]!.outer, bs[j]!.outer)) parent[find(i)] = find(j)
  })
  const stone = new Map<number, number>(), size = new Map<number, number>()
  bs.forEach((b, i) => {
    if (!generic[i]) return
    stone.set(find(i), (stone.get(find(i)) ?? 0) + (b.style === "stone" ? 1 : -1))
    size.set(find(i), (size.get(find(i)) ?? 0) + 1)
  })
  return bs.map((b, i) => (generic[i] && size.get(find(i))! <= max ? { ...b, style: stone.get(find(i))! > 0 ? "stone" : "plaster" } : b))
}

const LANDUSE = ["cemetery", "vineyard", "farmland", "farmyard", "industrial", "residential", "forest", "quarry"] as const satisfies ReadonlyArray<AreaKind>
const landuses: ReadonlySet<string> = new Set(LANDUSE)
const isLanduse = (landuse: string): landuse is (typeof LANDUSE)[number] => landuses.has(landuse)

const areaKind = (t: Tags): AreaKind | undefined => {
  if (t.landuse !== undefined && isLanduse(t.landuse)) return t.landuse
  if (t.highway === "pedestrian" && t.area === "yes") return "paved"
  if (t.leisure === "pitch" || t.leisure === "park") return t.leisure
  if (t.amenity === "parking" || t.amenity === "school") return t.amenity
  if (t.railway === "platform") return "platform"
  if (t.historic === "ruins" || t.historic === "archaeological_site") return "ruins"
  if (t.natural === "grassland" || t.natural === "fell" || t.landuse === "meadow" || t.landuse === "grass") return "grassland"
  if (t.natural === "wood") return "forest"
  if (t.natural === "bare_rock" || t.natural === "rock") return "rock"
  if (t.natural === "scree" || t.natural === "shingle") return "scree" // mostly ravaneti, the quarries' marble waste
  if (t.natural === "scrub" || t.natural === "heath") return "scrub"
  return undefined
}

/**
 * Closed-way areas plus multipolygon relations with an area kind. The OSM file holds every such
 * relation whole (fetch-osm.ts), so its rings assemble even where most members lie outside the
 * play area. Each inner ring goes to the outer ring that contains it.
 */
export const extractAreas = (osm: Osm): Array<Area> => {
  const areas: Array<Area> = []
  for (const w of osm.ways.values()) {
    const kind = areaKind(w.tags)
    if (kind === undefined || w.tags.building !== undefined || !closed(w)) continue
    const ring = flatRing(clipRing(ringOf(osm, w.nds)), true)
    if (ring !== undefined) areas.push({ kind, ...(w.tags.name ? { name: w.tags.name } : {}), rings: [ring] })
  }
  for (const rel of osm.relations.values()) {
    const kind = areaKind(rel.tags)
    if (rel.tags.type !== "multipolygon" || kind === undefined || rel.tags.building !== undefined) continue
    const inners = assembleRings(osm, rel, "inner").map((r) => ringOf(osm, r))
    for (const outer of assembleRings(osm, rel, "outer").map((r) => ringOf(osm, r))) {
      const flat = outer.flatMap(([x, y]) => [x, y])
      const ring = flatRing(clipRing(outer), true)
      if (ring === undefined) continue
      const holes = inners.filter((h) => pointInRing(h[0]![0], h[0]![1], flat)).map((h) => flatRing(clipRing(h), false)).filter((h) => h !== undefined)
      areas.push({ kind, ...(rel.tags.name ? { name: rel.tags.name } : {}), rings: [ring, ...holes] })
    }
  }
  return areas
}

export const extractBarriers = (osm: Osm): Array<Barrier> =>
  [...osm.ways.values()].filter((w) => w.tags.barrier === "wall" || w.tags.barrier === "guard_rail" || w.tags.natural === "cliff").flatMap((w) =>
    clipLine(vertices(osm, w.nds)).map((pts) => ({ kind: w.tags.natural === "cliff" ? "cliff" : w.tags.barrier!, pts: flatLine(pts) })))

const POI_KEYS = ["amenity", "shop", "tourism", "historic", "railway", "place", "leisure", "man_made", "natural", "highway"]

export const extractPois = (osm: Osm): Array<Poi> => {
  const pois: Array<Poi> = []
  for (const n of osm.nodes.values()) {
    const k = POI_KEYS.find((key) => n.tags[key] !== undefined)
    if (k === undefined || n.tags.tourism === "information" || n.tags.railway === "level_crossing" || n.tags.amenity === "bench") continue
    if (k === "highway" && n.tags.highway !== "trailhead") continue // crossings, stops, street lamps
    const [x, y] = toLocal(n.lat, n.lon)
    if (inBounds(x, y)) pois.push({ id: +n.id, kind: `${k}=${n.tags[k]}`, ...(n.tags.name ? { name: n.tags.name } : {}), x: r1(x), y: r1(y) })
  }
  // Named polygons (churches, cemetery, station...) as centroid POIs.
  for (const w of osm.ways.values()) {
    if (w.tags.name === undefined || !closed(w) || w.tags.highway !== undefined) continue
    const ring = ringOf(osm, w.nds)
    const x = ring.reduce((s, p) => s + p[0], 0) / ring.length, y = ring.reduce((s, p) => s + p[1], 0) / ring.length
    const kind = areaKind(w.tags) ?? w.tags.amenity ?? w.tags.building ?? "named"
    if (inBounds(x, y)) pois.push({ id: +w.id, kind: `area:${kind}`, name: w.tags.name, x: r1(x), y: r1(y) })
  }
  return pois
}
