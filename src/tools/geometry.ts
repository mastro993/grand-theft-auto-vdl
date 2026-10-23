// Plane geometry for the map build: local projection, clipping to the play area,
// ring winding, point/segment distances and a bucketed segment index.
import { REGION } from "./region.ts"

import { segDist2 } from "../sim/collide.ts"

export type P = readonly [number, number]
/** A polyline vertex; `id` is the OSM node id, absent for points made by clipping. */
export interface V { readonly x: number; readonly y: number; readonly id?: string }

export const ORIGIN = REGION.origin
export const M_PER_DEG = { lat: 111115.37, lon: REGION.id === "lunigiana" ? 79987.94 : 111320 * Math.cos(ORIGIN.lat * Math.PI / 180) }
/** Play area, local metres: lat 44.1069–44.1968, lon 10.0937–10.1913. The whole Lucido catchment, ridge to ridge, plus the Aulella side by Gragnola and Codiponte. */
export const BOUNDS = REGION.bounds

export const r1 = (v: number): number => Math.round(v * 10) / 10
export const toLocal = (lat: number, lon: number): P => [(lon - ORIGIN.lon) * M_PER_DEG.lon, (lat - ORIGIN.lat) * M_PER_DEG.lat]
/** Inverse of `toLocal`: [lat, lon]. */
export const fromLocal = (x: number, y: number): [number, number] => [ORIGIN.lat + y / M_PER_DEG.lat, ORIGIN.lon + x / M_PER_DEG.lon]
export const inBounds = (x: number, y: number, margin = 0): boolean =>
  x >= BOUNDS.minX + margin && x <= BOUNDS.maxX - margin && y >= BOUNDS.minY + margin && y <= BOUNDS.maxY - margin

/** Liang-Barsky per segment, consecutive inside parts merged into pieces. Original vertices keep their ids. */
export const clipLine = (pts: ReadonlyArray<V>): Array<Array<V>> => {
  const { minX: X0, minY: Y0, maxX: X1, maxY: Y1 } = BOUNDS
  const out: Array<Array<V>> = []
  let cur: Array<V> = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!
    const dx = b.x - a.x, dy = b.y - a.y
    let t0 = 0, t1 = 1, ok = true
    for (const [p, q] of [[-dx, a.x - X0], [dx, X1 - a.x], [-dy, a.y - Y0], [dy, Y1 - a.y]] as const) {
      if (p === 0) {
        if (q < 0) ok = false
        continue
      }
      const r = q / p
      if (p < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
    }
    if (!ok || t1 <= t0) {
      if (cur.length > 1) out.push(cur)
      cur = []
      continue
    }
    if (cur.length === 0) cur.push(t0 === 0 ? a : { x: a.x + t0 * dx, y: a.y + t0 * dy })
    cur.push(t1 === 1 ? b : { x: a.x + t1 * dx, y: a.y + t1 * dy })
    if (t1 < 1) {
      out.push(cur)
      cur = []
    }
  }
  if (cur.length > 1) out.push(cur)
  return out
}

/** Sutherland-Hodgman clip of an open ring to the play area. */
export const clipRing = (ring: ReadonlyArray<P>): Array<P> => {
  const { minX: X0, minY: Y0, maxX: X1, maxY: Y1 } = BOUNDS
  let poly: ReadonlyArray<P> = ring
  const edges: ReadonlyArray<readonly [(p: P) => boolean, (a: P, b: P) => P]> = [
    [(p) => p[0] >= X0, (a, b) => [X0, a[1] + ((b[1] - a[1]) * (X0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= X1, (a, b) => [X1, a[1] + ((b[1] - a[1]) * (X1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= Y0, (a, b) => [a[0] + ((b[0] - a[0]) * (Y0 - a[1])) / (b[1] - a[1]), Y0]],
    [(p) => p[1] <= Y1, (a, b) => [a[0] + ((b[0] - a[0]) * (Y1 - a[1])) / (b[1] - a[1]), Y1]]
  ]
  for (const [ins, cut] of edges) {
    const next: Array<P> = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[(i + poly.length - 1) % poly.length]!, b = poly[i]!
      if (ins(b)) {
        if (!ins(a)) next.push(cut(a, b))
        next.push(b)
      } else if (ins(a)) next.push(cut(a, b))
    }
    poly = next
    if (poly.length === 0) break
  }
  return [...poly]
}

export const signedArea = (r: ReadonlyArray<P>): number => {
  let s = 0
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!, q = r[(i + 1) % r.length]!
    s += p[0] * q[1] - q[0] * p[1]
  }
  return s / 2
}

/** Rounds to 0.1 m, drops repeated points, returns a flat ring with the requested winding (CCW = positive area), or undefined if degenerate. */
export const flatRing = (ring: ReadonlyArray<P>, ccw: boolean): Array<number> | undefined => {
  const pts: Array<P> = []
  for (const [x, y] of ring) {
    const p: P = [r1(x), r1(y)]
    const last = pts.at(-1)
    if (last === undefined || last[0] !== p[0] || last[1] !== p[1]) pts.push(p)
  }
  while (pts.length > 1 && pts[0]![0] === pts.at(-1)![0] && pts[0]![1] === pts.at(-1)![1]) pts.pop()
  const area = signedArea(pts)
  if (pts.length < 3 || Math.abs(area) < 0.5) return undefined
  if (area > 0 !== ccw) pts.reverse()
  return pts.flatMap(([x, y]) => [x, y])
}

export const flatLine = (pts: ReadonlyArray<V>): Array<number> => pts.flatMap((p) => [r1(p.x), r1(p.y)])

/** Vertex mean of a flat ring. */
export const centroid = (ring: ReadonlyArray<number>): P => {
  let cx = 0, cy = 0
  for (let i = 0; i < ring.length; i += 2) [cx, cy] = [cx + (2 * ring[i]!) / ring.length, cy + (2 * ring[i + 1]!) / ring.length]
  return [cx, cy]
}

/** Bounding box [x0, y0, x1, y1] of a flat ring or polyline. */
export const ringBox = (ring: ReadonlyArray<number>): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i + 1 < ring.length; i += 2) [x0, y0, x1, y1] = [Math.min(x0, ring[i]!), Math.min(y0, ring[i + 1]!), Math.max(x1, ring[i]!), Math.max(y1, ring[i + 1]!)]
  return [x0, y0, x1, y1]
}

export { fillPolygon, pointInRing, segDist2 } from "../sim/collide.ts"

/** Arc length at each vertex. */
export const arcLengths = (pts: ReadonlyArray<V>): Array<number> => {
  const s = [0]
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y))
  return s
}

/** Linear interpolation of per-vertex values `z` at arc length `at` (arc lengths `s`). */
export const along = (s: ReadonlyArray<number>, z: ArrayLike<number>, at: number): number => {
  let i = 1
  while (i < s.length - 1 && s[i]! < at) i++
  const t = Math.max(0, Math.min(1, (at - s[i - 1]!) / (s[i]! - s[i - 1]! || 1)))
  return z[i - 1]! + (z[i]! - z[i - 1]!) * t
}

/** Bounding box [minX, minY, maxX, maxY] of a polyline. */
const lineBox = (l: ReadonlyArray<V>): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of l) [x0, y0, x1, y1] = [Math.min(x0, p.x), Math.min(y0, p.y), Math.max(x1, p.x), Math.max(y1, p.y)]
  return [x0, y0, x1, y1]
}

export interface Crossing { readonly x: number; readonly y: number; readonly sa: number; readonly sb: number }

/** Points where polylines a and b meet (shared vertices included, duplicates dropped), with the arc length along each. */
export const crossings = (a: ReadonlyArray<V>, b: ReadonlyArray<V>): Array<Crossing> => {
  const out: Array<Crossing> = []
  const [ax0, ay0, ax1, ay1] = lineBox(a), [bx0, by0, bx1, by1] = lineBox(b)
  if (ax0 > bx1 || bx0 > ax1 || ay0 > by1 || by0 > ay1) return out
  const la = arcLengths(a), lb = arcLengths(b)
  for (let i = 0; i + 1 < a.length; i++) for (let j = 0; j + 1 < b.length; j++) {
    const p = a[i]!, q = a[i + 1]!, r = b[j]!, s = b[j + 1]!
    const ex = q.x - p.x, ey = q.y - p.y, fx = s.x - r.x, fy = s.y - r.y, den = ex * fy - ey * fx
    if (den === 0) continue
    const t = ((r.x - p.x) * fy - (r.y - p.y) * fx) / den, u = ((r.x - p.x) * ey - (r.y - p.y) * ex) / den
    if (t < 0 || t > 1 || u < 0 || u > 1) continue
    const x = p.x + ex * t, y = p.y + ey * t
    if (out.some((c) => Math.abs(c.x - x) < 0.05 && Math.abs(c.y - y) < 0.05)) continue
    out.push({ x, y, sa: la[i]! + t * (la[i + 1]! - la[i]!), sb: lb[j]! + u * (lb[j + 1]! - lb[j]!) })
  }
  return out
}

/** Point and unit tangent at arc length `at` along a polyline with precomputed arc lengths. */
export const pointAt = (pts: ReadonlyArray<V>, s: ReadonlyArray<number>, at: number): { x: number; y: number; tx: number; ty: number } => {
  let i = 1
  while (i < pts.length - 1 && s[i]! < at) i++
  const a = pts[i - 1]!, b = pts[i]!, len = s[i]! - s[i - 1]! || 1
  const t = Math.max(0, Math.min(1, (at - s[i - 1]!) / len))
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len }
}

interface Buffered<T> { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number; readonly r: number; readonly data: T }

/** Segments with a buffer radius each, bucketed on a square grid for "is this point within r of a segment" queries. */
export const segIndex = <T>(bucket = 16) => {
  const cells = new Map<number, Array<number>>()
  const segs: Array<Buffered<T>> = []
  const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096)
  const add = (ax: number, ay: number, bx: number, by: number, r: number, data: T) => {
    const k = segs.length
    segs.push({ ax, ay, bx, by, r, data })
    for (let i = Math.floor((Math.min(ax, bx) - r) / bucket); i <= Math.floor((Math.max(ax, bx) + r) / bucket); i++)
      for (let j = Math.floor((Math.min(ay, by) - r) / bucket); j <= Math.floor((Math.max(ay, by) + r) / bucket); j++) {
        const c = cells.get(key(i, j))
        if (c === undefined) cells.set(key(i, j), [k])
        else c.push(k)
      }
  }
  const addLine = (pts: ReadonlyArray<V> | ReadonlyArray<number>, r: number, data: T) => {
    const xy = typeof pts[0] === "number" ? (pts as ReadonlyArray<number>) : (pts as ReadonlyArray<V>).flatMap((p) => [p.x, p.y])
    for (let i = 0; i + 3 < xy.length; i += 2) add(xy[i]!, xy[i + 1]!, xy[i + 2]!, xy[i + 3]!, r, data)
  }
  /** Calls `visit` for each segment whose buffer contains (x,y), with the squared distance and projection t. */
  const within = (x: number, y: number, visit: (s: Buffered<T>, d2: number, t: number) => void) => {
    const c = cells.get(key(Math.floor(x / bucket), Math.floor(y / bucket)))
    if (c === undefined) return
    for (const k of c) {
      const s = segs[k]!
      const { d2, t } = segDist2(x, y, s.ax, s.ay, s.bx, s.by)
      if (d2 < s.r * s.r) visit(s, d2, t)
    }
  }
  const covers = (x: number, y: number, pred?: (data: T) => boolean): boolean => {
    let hit = false
    within(x, y, (s) => {
      if (pred === undefined || pred(s.data)) hit = true
    })
    return hit
  }
  return { add, addLine, within, covers }
}

/** Deterministic hash of integers to [0, 1). */
export const hash01 = (...ns: ReadonlyArray<number>): number => {
  let h = 0x9e3779b9
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
  }
  return (h >>> 0) / 4294967296
}
