// Top-down debug render of src/sim/map/monzone.bin -> .research/map-preview.png.
// Usage: node src/tools/preview-map.ts [pxPerM=1] [minX,minY,maxX,maxY] [out.png]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { gunzipSync } from "node:zlib"

import type { AreaKind, BuildingStyle, RoadClass } from "../sim/map/index.ts"
import { provideMap } from "../sim/map/packed.ts"
import { fillPolygon, segDist2 } from "./geometry.ts"
import { encodePngRgb } from "./png.ts"
import { REGION } from "./region.ts"

provideMap(gunzipSync(readFileSync(join(import.meta.dirname, `../sim/map/${REGION.file}.bin`))))
const { buildingStyleOf, graph, heightAt, isAreaKind, MAP } = await import("../sim/map/index.ts")

type RGB = readonly [number, number, number]
const scale = Number(process.argv[2] ?? 1)
const [minX, minY, maxX, maxY] = (process.argv[3] ?? "").split(",").length === 4 ? process.argv[3]!.split(",").map(Number) as [number, number, number, number]
  : [MAP.bounds.minX, MAP.bounds.minY, MAP.bounds.maxX, MAP.bounds.maxY]
const out = process.argv[4] ?? join(import.meta.dirname, "../../.research/map-preview.png")
const W = Math.round((maxX - minX) * scale), H = Math.round((maxY - minY) * scale)
const img = new Uint8Array(W * H * 3) // row 0 = south; flipped on encode

const blend = (k: number, c: RGB, a: number) => {
  for (let ch = 0; ch < 3; ch++) img[k * 3 + ch] = Math.round(img[k * 3 + ch]! * (1 - a) + c[ch]! * a)
}
const px = (x: number) => (x - minX) * scale, py = (y: number) => (y - minY) * scale
const dot = (x: number, y: number, r: number, c: RGB, a = 1) => line(x, y, x, y, r, c, a)
/** Thick segment of half-width `r` metres (at least half a pixel). */
function line(ax: number, ay: number, bx: number, by: number, r: number, c: RGB, a = 1) {
  const rp = Math.max(0.5, r * scale), x0 = px(ax), y0 = py(ay), x1 = px(bx), y1 = py(by)
  for (let j = Math.max(0, Math.floor(Math.min(y0, y1) - rp)); j <= Math.min(H - 1, Math.ceil(Math.max(y0, y1) + rp)); j++)
    for (let i = Math.max(0, Math.floor(Math.min(x0, x1) - rp)); i <= Math.min(W - 1, Math.ceil(Math.max(x0, x1) + rp)); i++)
      if (segDist2(i + 0.5, j + 0.5, x0, y0, x1, y1).d2 <= rp * rp) blend(j * W + i, c, a)
}
const polyline = (pts: ReadonlyArray<number>, r: number, c: RGB, a = 1) => {
  for (let i = 0; i + 3 < pts.length; i += 2) line(pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!, r, c, a)
}
const fill = (rings: ReadonlyArray<ReadonlyArray<number>>, c: RGB, a: number) => fillPolygon(rings, minX, minY, 1 / scale, W, H, (k) => blend(k, c, a))

// Terrain: elevation ramp x hillshade (light from the north-west).
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = minX + (i + 0.5) / scale, y = minY + (j + 0.5) / scale, z = heightAt(x, y)
  const dx = (heightAt(x + 2, y) - heightAt(x - 2, y)) / 4, dy = (heightAt(x, y + 2) - heightAt(x, y - 2)) / 4
  const shade = Math.max(0.35, Math.min(1.25, 0.85 + (dx * 0.7 - dy * 0.7) * -0.9 / Math.hypot(1, Math.hypot(dx, dy))))
  const t = Math.min(1, Math.max(0, (z - 205) / 450))
  const base: RGB = [150 + 70 * t, 170 + 30 * t, 120 + 60 * t]
  for (let ch = 0; ch < 3; ch++) img[(j * W + i) * 3 + ch] = Math.min(255, Math.round(base[ch]! * shade))
}
const AREA = {
  forest: [40, 110, 50], cemetery: [150, 150, 170], pitch: [90, 200, 90], park: [120, 190, 100], parking: [170, 170, 170], vineyard: [170, 140, 200],
  farmland: [220, 210, 140], farmyard: [210, 180, 140], industrial: [200, 160, 200], residential: [230, 200, 190], platform: [120, 120, 120],
  school: [240, 220, 120], ruins: [160, 120, 90], grassland: [170, 210, 120], paved: [140, 140, 135], quarry: [250, 250, 245],
  rock: [215, 210, 195], sparse: [200, 200, 150], scree: [190, 180, 160], scrub: [110, 150, 80]
} as const satisfies Record<AreaKind, RGB>
for (const a of MAP.areas) fill(a.rings, isAreaKind(a.kind) ? AREA[a.kind] : [255, 0, 255], a.kind === "forest" ? 0.25 : 0.45)
for (let i = 0; i + 2 < MAP.trees.length; i += 3) dot(MAP.trees[i]!, MAP.trees[i + 1]!, 0.9 * MAP.trees[i + 2]!, [20, 70, 30], 0.8)
for (const w of MAP.water) polyline(w.pts, w.w / 2, [60, 120, 220])
const ROAD = {
  tertiary: [250, 240, 150], unclassified: [255, 255, 255], residential: [235, 235, 235], service: [210, 210, 210], track: [170, 130, 80], path: [200, 90, 60], steps: [200, 60, 60]
} as const satisfies Record<RoadClass, RGB>
const order: ReadonlyArray<RoadClass> = ["path", "steps", "track", "service", "residential", "unclassified", "tertiary"]
for (const cls of order) for (const r of MAP.roads) {
  if (r.cls !== cls) continue
  if (r.bridge === true) polyline(r.pts, r.w / 2 + 1, [40, 40, 40])
  polyline(r.pts, r.w / 2, r.tunnel === true ? [130, 130, 130] : ROAD[cls], r.tunnel === true ? 0.6 : 1)
}
for (const r of MAP.rail) polyline(r.pts, 1.2, r.tunnel === true ? [110, 110, 110] : [50, 40, 40], r.tunnel === true ? 0.5 : 1)
const STYLE = {
  plaster: [235, 190, 140], stone: [170, 160, 145], church: [250, 250, 240], tower: [210, 200, 190], industrial: [150, 160, 180], station: [200, 80, 70], ruin: [120, 100, 80]
} as const satisfies Record<BuildingStyle, RGB>
for (const b of MAP.buildings) {
  fill([b.outer, ...(b.holes ?? [])], STYLE[buildingStyleOf(b)], 1)
  for (const ring of [b.outer, ...(b.holes ?? [])]) polyline([...ring, ring[0]!, ring[1]!], 0.25, [60, 40, 30])
}
for (const b of MAP.barriers) polyline(b.pts, 0.6, b.kind === "cliff" ? [90, 60, 60] : [100, 100, 100])
const segs = (flat: ArrayLike<number>, c: RGB) => {
  for (let i = 0; i + 3 < flat.length; i += 4) line(flat[i]!, flat[i + 1]!, flat[i + 2]!, flat[i + 3]!, 0.15, c)
}
segs(MAP.walls.drive, [255, 150, 0])
segs(MAP.walls.walk, [220, 0, 0])
for (const e of graph.trafficEdges) {
  const { a, b } = graph.edges[e]!
  line(graph.nodes[a]!.x, graph.nodes[a]!.y, graph.nodes[b]!.x, graph.nodes[b]!.y, 0.3, [200, 0, 200])
}
for (const p of MAP.spawns.parked) {
  const c = Math.cos(p.angle), s = Math.sin(p.angle)
  line(p.x - c * 1.85, p.y - s * 1.85, p.x + c * 1.85, p.y + s * 1.85, 0.85, [255, 220, 0])
}
const pl = MAP.spawns.player
dot(pl.x, pl.y, 2.5, [0, 230, 255])
line(pl.x, pl.y, pl.x + Math.cos(pl.angle) * 8, pl.y + Math.sin(pl.angle) * 8, 0.6, [0, 230, 255])

const flipped = new Uint8Array(img.length)
for (let j = 0; j < H; j++) flipped.set(img.subarray(j * W * 3, (j + 1) * W * 3), (H - 1 - j) * W * 3)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, encodePngRgb(W, H, flipped))
console.log(`${out} ${W}x${H}`)
