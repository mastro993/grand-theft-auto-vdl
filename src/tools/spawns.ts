// Deterministic tree scatter, the player spawn and parked-car spots.
import { staticGrid } from "../sim/collide.ts"
import type { Area, Spawn } from "../sim/map/index.ts"
import { pushTrunk, TRUNK } from "../sim/map/kinds.ts"
import type { BuildingF, RailF, RoadF, WaterF } from "./features.ts"
import { arcLengths, BOUNDS, centroid, fillPolygon, hash01, inBounds, pointAt, pointInRing, r1, ringBox, segDist2, segIndex } from "./geometry.ts"

const TREE_AREA = 50 // m² per tree
const MASK_RES = 2

/** Raster of the play area at MASK_RES m with every polygon in `polys` filled. */
const mask = (polys: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>) => {
  const cols = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / MASK_RES), rows = Math.ceil((BOUNDS.maxY - BOUNDS.minY) / MASK_RES)
  const m = new Uint8Array(cols * rows)
  // Even-odd within each polygon (fillPolygon visits a pixel once per polygon), OR across them.
  for (const rings of polys) fillPolygon(rings, BOUNDS.minX, BOUNDS.minY, MASK_RES, cols, rows, (k) => (m[k] = 1))
  return (x: number, y: number) => {
    const c = Math.floor((x - BOUNDS.minX) / MASK_RES), r = Math.floor((y - BOUNDS.minY) / MASK_RES)
    return c >= 0 && r >= 0 && c < cols && r < rows && m[r * cols + c] === 1
  }
}

/** Flat (x, y, scale) triples (positions to the metre: scatter needs no more, and it keeps the JSON small): a jittered ~7 m lattice inside forest, plus sparse trees on river banks. */
export const scatterTrees = (areas: ReadonlyArray<Area>, roads: ReadonlyArray<RoadF>, buildings: ReadonlyArray<BuildingF>, water: ReadonlyArray<WaterF>, rail: ReadonlyArray<RailF>): Array<number> => {
  const forest = mask(areas.filter((a) => a.kind === "forest").map((a) => a.rings))
  const open = mask(areas.filter((a) => a.kind !== "forest").map((a) => a.rings))
  const built = mask(buildings.map((b) => [b.outer, ...(b.holes ?? [])]))
  const keepOut = segIndex<null>()
  for (const r of roads) keepOut.addLine(r.pts, r.w / 2 + 2, null)
  for (const b of buildings) keepOut.addLine([...b.outer, b.outer[0]!, b.outer[1]!], 2, null)
  for (const w of water) keepOut.addLine(w.pts, w.bed, null)
  for (const r of rail) if (r.tunnel !== true) keepOut.addLine(r.pts, 6, null)
  const free = (x: number, y: number) => inBounds(x, y, 1) && !open(x, y) && !built(x, y) && !keepOut.covers(x, y)
  const trees: Array<number> = [], planted = new Set<number>()
  /** Rounded to the metre, two jittered lattice points can land on one spot: keep the first. */
  const plant = (x: number, y: number, scale: number) => {
    const tx = Math.round(x), ty = Math.round(y), key = tx * 65536 + ty
    if (planted.has(key)) return
    planted.add(key)
    trees.push(tx, ty, r1(scale))
  }
  const step = Math.sqrt(TREE_AREA)
  for (let gj = 0; gj * step < BOUNDS.maxY - BOUNDS.minY; gj++) for (let gi = 0; gi * step < BOUNDS.maxX - BOUNDS.minX; gi++) {
    const x = BOUNDS.minX + (gi + hash01(gi, gj, 1)) * step, y = BOUNDS.minY + (gj + hash01(gi, gj, 2)) * step
    if (forest(x, y) && free(x, y)) plant(x, y, 0.8 + 0.5 * hash01(gi, gj, 3))
  }
  water.forEach((w, wi) => {
    if (w.w < 4) return
    const s = arcLengths(w.pts), total = s.at(-1)!
    for (let k = 0; k * 9 < total; k++) for (const side of [1, -1]) {
      if (hash01(wi, k, side, 4) > 0.55) continue
      const p = pointAt(w.pts, s, k * 9), off = side * (w.bed + 2 + 3 * hash01(wi, k, side, 5))
      const x = p.x - p.ty * off, y = p.y + p.tx * off
      if (!forest(x, y) && free(x, y)) plant(x, y, 0.8 + 0.5 * hash01(wi, k, side, 6))
    }
  })
  return trees
}

/** Segments farther than this from a clearance query are ignored, m (every caller asks less). */
const REACH = 3

/**
 * Clearance checks against flat (ax, ay, bx, by) `walls` plus the TRUNK square of every tree in
 * flat (x, y, scale) `trees`. Trees are indexed as points and their squares made on query, as
 * `wallsNear` does in the game: a segment per trunk edge would take gigabytes at a million trees.
 */
export const clearance = (walls: ReadonlyArray<number>, trees: ReadonlyArray<number>) => {
  const idx = segIndex<null>()
  for (let i = 0; i + 3 < walls.length; i += 4) idx.add(walls[i]!, walls[i + 1]!, walls[i + 2]!, walls[i + 3]!, REACH, null)
  const treesIn = staticGrid(trees.length / 3, (i) => [trees[3 * i]!, trees[3 * i + 1]!, trees[3 * i]!, trees[3 * i + 1]!], 16)
  const trunk: Array<number> = [], edge = { ax: 0, ay: 0, bx: 0, by: 0 }
  /** Calls `visit` for every wall and trunk edge within REACH of (x, y), with its squared distance. */
  const near = (x: number, y: number, visit: (seg: { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number }, d2: number) => void) => {
    idx.within(x, y, visit)
    const r = REACH + TRUNK
    treesIn(x - r, y - r, x + r, y + r, (i) => {
      trunk.length = 0
      pushTrunk(trunk, trees[3 * i]!, trees[3 * i + 1]!)
      for (let k = 0; k < trunk.length; k += 4) {
        [edge.ax, edge.ay, edge.bx, edge.by] = [trunk[k]!, trunk[k + 1]!, trunk[k + 2]!, trunk[k + 3]!]
        const { d2 } = segDist2(x, y, edge.ax, edge.ay, edge.bx, edge.by)
        if (d2 < REACH * REACH) visit(edge, d2)
      }
    })
  }
  const circle = (x: number, y: number, r: number) => {
    let ok = true
    near(x, y, (_, d2) => (ok &&= d2 >= r * r))
    return ok
  }
  /** No segment crosses or lies inside the oriented box (half-length hl along `angle`, half-width hw). */
  const box = (x: number, y: number, angle: number, hl: number, hw: number) => {
    const c = Math.cos(angle), s = Math.sin(angle)
    let ok = true
    near(x, y, (seg) => {
      const ax = (seg.ax - x) * c + (seg.ay - y) * s, ay = -(seg.ax - x) * s + (seg.ay - y) * c
      const dx = (seg.bx - x) * c + (seg.by - y) * s - ax, dy = -(seg.bx - x) * s + (seg.by - y) * c - ay
      let t0 = 0, t1 = 1
      for (const [p, q] of [[-dx, ax + hl], [dx, hl - ax], [-dy, ay + hw], [dy, hw - ay]] as const) {
        if (p === 0) {
          if (q < 0) return
          continue
        }
        const r = q / p
        if (p < 0) t0 = Math.max(t0, r)
        else t1 = Math.min(t1, r)
      }
      if (t1 >= t0) ok = false
    })
    return ok
  }
  return { circle, box }
}
type Clearance = ReturnType<typeof clearance>

const CAR_HL = 3.7 / 2, CAR_HW = 1.7 / 2, CAR_GAP = 0.3, SPAWN_R = 1.3 // 1.2 m (map.test.ts) + rounding margin

/** A clear sidewalk spot outside building footprints, with an open walking route to the street. */
export const playerSpawn = (roads: ReadonlyArray<RoadF>, walk: Clearance, drive: Clearance, target: { readonly x: number; readonly y: number }, buildings: ReadonlyArray<BuildingF>, preferred?: RoadF): Spawn => {
  const road = preferred ?? roads.find((r) => r.name === "Via Cesare Battisti")
  if (road === undefined) throw new Error("Player spawn road not found")
  const s = arcLengths(road.pts)
  let at = 0, best = Number.MAX_VALUE
  for (let d = 0; d <= s.at(-1)!; d += 0.5) {
    const p = pointAt(road.pts, s, d), dd = Math.hypot(p.x - target.x, p.y - target.y)
    if (dd < best) [at, best] = [d, dd]
  }
  for (let k = 0; k < 80; k++) {
    const d = at + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 1.5
    const p = pointAt(road.pts, s, Math.min(s.at(-1)!, Math.max(0, d)))
    const toward = Math.sign((target.x - p.x) * -p.ty + (target.y - p.y) * p.tx) || 1
    for (const side of [toward, -toward]) {
      const off = side * (road.w / 2 + 1), x = r1(p.x - p.ty * off), y = r1(p.y + p.tx * off)
      if (!inBounds(x, y, SPAWN_R) || buildings.some((building) => pointInRing(x, y, building.outer))) continue
      if (!walk.circle(x, y, SPAWN_R) || !drive.circle(x, y, SPAWN_R)) continue
      const steps = Math.ceil(Math.hypot(x - p.x, y - p.y) / 0.5)
      let connected = true
      for (let step = 0; step <= steps; step++) {
        const fraction = step / steps
        if (!walk.circle(x + (p.x - x) * fraction, y + (p.y - y) * fraction, SPAWN_R)) {
          connected = false
          break
        }
      }
      if (connected) return { x, y, angle: Math.round(Math.atan2(p.ty, p.tx) * 1000) / 1000 }
    }
  }
  throw new Error(`No clear player spawn on ${road.name ?? road.id}`)
}

interface ParkingInput {
  readonly roads: ReadonlyArray<RoadF>
  readonly buildings: ReadonlyArray<BuildingF>
  readonly areas: ReadonlyArray<Area>
  readonly junctions: ReadonlyArray<readonly [number, number]>
  readonly walk: Clearance
  readonly drive: Clearance
  readonly avoid: { readonly x: number; readonly y: number }
  readonly station: { readonly x: number; readonly y: number }
  /** The Carabinieri station: its two nearest kerb spots are always kept (the sim parks their cars there). */
  readonly police: { readonly x: number; readonly y: number }
}

const KERB_CLASSES = new Set(["tertiary", "unclassified", "residential"])
/** Kerbside spots kept: one per this many buildings (Monzone's 800 buildings had 100), drawn in hash order so every village gets its share. */
const BUILDINGS_PER_SPOT = 8

/** Kerbside spots in built-up streets (right kerb, >= 9 m apart, >= 12 m from junctions; the two nearest the Carabinieri first) plus a few in the Monzone station car parks. */
export const parkedSpots = ({ roads, buildings, areas, junctions, walk, drive, avoid, station, police }: ParkingInput): Array<Spawn> => {
  // Bucketed lookups: building centroids within 40 m, junctions within 12 m, footprints by bounding box.
  const centroids = segIndex<null>(), corners = segIndex<null>()
  for (const b of buildings) {
    const [x, y] = centroid(b.outer)
    centroids.add(x, y, x, y, 40, null)
  }
  for (const [jx, jy] of junctions) corners.add(jx, jy, jx, jy, 12, null)
  const footprints = staticGrid(buildings.length, (i) => ringBox(buildings[i]!.outer), 32)
  const insideBuilding = (x: number, y: number) => {
    let inside = false
    footprints(x, y, x, y, (i) => (inside ||= pointInRing(x, y, buildings[i]!.outer)))
    return inside
  }
  const housesNear = (x: number, y: number) => {
    let n = 0
    centroids.within(x, y, () => n++)
    return n
  }
  const carriage = segIndex<RoadF>(), lanes = segIndex<RoadF>()
  for (const r of roads) {
    carriage.addLine(r.pts, r.w / 2 + 0.9, r)
    lanes.addLine(r.pts, r.w / 2, r)
  }
  /** Centre and corners of the car box grown by `gap`. */
  const box = (x: number, y: number, angle: number, gap: number) => {
    const c = Math.cos(angle), s = Math.sin(angle), l = CAR_HL + gap, w = CAR_HW + gap
    return [[x, y] as const, ...[[l, w], [l, -w], [-l, w], [-l, -w]].map(([u, v]) => [x + c * u! - s * v!, y + s * u! + c * v!] as const)]
  }
  const fits = (x: number, y: number, angle: number) =>
    inBounds(x, y, 5) && walk.circle(x, y, SPAWN_R) && drive.circle(x, y, SPAWN_R) && drive.box(x, y, angle, CAR_HL + CAR_GAP, CAR_HW + CAR_GAP) &&
    !insideBuilding(x, y) && Math.hypot(x - avoid.x, y - avoid.y) > 6
  const candidates: Array<Spawn & { readonly order: number }> = []
  roads.forEach((r, ri) => {
    if (!KERB_CLASSES.has(r.cls) || r.bridge === true || r.tunnel === true) return
    const s = arcLengths(r.pts), total = s.at(-1)!
    for (let d = 6; d <= total - 6; d += 3) {
      const p = pointAt(r.pts, s, d), off = r.w / 2 + 1, x = p.x + p.ty * off, y = p.y - p.tx * off, angle = Math.atan2(p.ty, p.tx)
      if (corners.covers(p.x, p.y) || housesNear(x, y) < 2) continue
      if (carriage.covers(x, y) || box(x, y, angle, 0).some(([qx, qy]) => lanes.covers(qx, qy))) continue // overlaps a carriageway (another road, or this one on a bend)
      if (fits(x, y, angle)) candidates.push({ x, y, angle, order: hash01(ri, Math.round(d), 11) })
    }
  })
  const spots: Array<Spawn> = []
  const take = (list: ReadonlyArray<Spawn>, upTo: number) => {
    for (const c of list) {
      if (spots.length >= upTo) break
      if (spots.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= 9)) spots.push(c)
    }
  }
  const toPolice = (c: Spawn) => Math.hypot(c.x - police.x, c.y - police.y)
  take([...candidates].sort((a, b) => toPolice(a) - toPolice(b)), 2)
  take(candidates.sort((a, b) => a.order - b.order), Math.round(buildings.length / BUILDINGS_PER_SPOT))
  // Station car parks: rows across the lot's longest edge, cars nose-in.
  for (const lot of areas.filter((a) => a.kind === "parking")) {
    const ring = lot.rings[0]!
    const n = ring.length / 2
    let cx = 0, cy = 0
    for (let i = 0; i < n; i++) [cx, cy] = [cx + ring[2 * i]! / n, cy + ring[2 * i + 1]! / n]
    if (Math.hypot(cx - station.x, cy - station.y) > 150) continue
    let ex = 1, ey = 0, longest = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = ring[2 * j]! - ring[2 * i]!, dy = ring[2 * j + 1]! - ring[2 * i + 1]!, l = Math.hypot(dx, dy)
      if (l > longest) [ex, ey, longest] = [dx / l, dy / l, l]
    }
    const angle = Math.atan2(ex, -ey) // facing across the row (perpendicular to the longest edge)
    const lotSpots: Array<Spawn> = []
    const grid: Array<readonly [number, number]> = []
    for (let u = -60; u <= 60; u += 2.7) for (let v = -60; v <= 60; v += 6) grid.push([cx + ex * u - ey * v, cy + ey * u + ex * v])
    grid.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy) || a[0] - b[0] || a[1] - b[1])
    for (const [x, y] of grid) {
      if (lotSpots.length >= 6) break
      const pts = box(x, y, angle, CAR_GAP)
      if (!pts.every(([qx, qy]) => pointInRing(qx, qy, ring))) continue
      if (pts.some(([qx, qy]) => carriage.covers(qx, qy))) continue // keep the lot's lanes and through roads free
      if (!fits(x, y, angle) || ![...spots, ...lotSpots].every((o) => Math.hypot(o.x - x, o.y - y) >= 2.6)) continue
      lotSpots.push({ x, y, angle })
    }
    spots.push(...lotSpots)
  }
  return spots.map((p) => ({ x: r1(p.x), y: r1(p.y), angle: Math.round(p.angle * 1000) / 1000 }))
}
