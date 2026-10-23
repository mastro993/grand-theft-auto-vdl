// HUD district discs (`districtAt` in src/sim/map/index.ts): Monzone's named clusters, placed by
// hand, every OSM village and hamlet elsewhere, centred on its place node with a radius fitted to
// the buildings nearest it, and the mountains' landmarks, placed by hand.
import type { District } from "../sim/map/index.ts"
import type { BuildingF } from "./features.ts"
import { centroid, inBounds, r1, toLocal } from "./geometry.ts"
import type { Osm } from "./osm.ts"
import { REGION } from "./region.ts"

/** Monzone's station, streets and hill clusters: OSM names only Monzone (Alto) and Aiola there. */
const MONZONE: ReadonlyArray<District> = [
  { name: "Monzone (Stazione)", x: -500, y: 480, r: 250 },
  { name: "Via Riolo", x: -200, y: 310, r: 160 },
  { name: "Immacolata", x: -90, y: 120, r: 120 },
  { name: "Santa Lucia", x: 44.6, y: 223.8, r: 130 },
  { name: "Via per Equi", x: 260, y: 370, r: 190 },
  { name: "Caldanella", x: 570, y: 510, r: 110 },
  { name: "Cimitero", x: -45, y: -70, r: 70 },
  { name: "Monzone Alto", x: -34.4, y: -300.3, r: 170 },
  { name: "Collecchia", x: -140, y: -480, r: 100 },
  { name: "Torrignana", x: -398.7, y: -99.1, r: 200 },
  { name: "Aiola", x: 720, y: 190, r: 240 },
  { name: "Castello di Aiola", x: 420, y: -260, r: 110 },
  { name: "Novicchia", x: -924.1, y: -397.1, r: 220 },
  { name: "Acquanera", x: 117.2, y: -95.6, r: 120 }
]

/**
 * The unpopulated mountains, so the HUD never names the nearest village on Monte Sagro: peaks,
 * saddles and huts on their OSM nodes, quarries on their pits, localities and ridges centred by
 * hand on the slope they name. None overlaps a village disc. The Carrara and Massa sides of the
 * ridge are in the rectangle too.
 */
const LANDMARKS: ReadonlyArray<District> = [
  { name: "Torre di Monzone", x: 300, y: -2560, r: 380 },
  { name: "Alpe di Monzone", x: -530, y: -2386, r: 200 },
  { name: "Rocca di Tenerano", x: -728, y: -3012, r: 300 },
  { name: "Balzone", x: 900, y: -3700, r: 360 },
  { name: "Monte Borla", x: 495, y: -4789, r: 250 },
  { name: "Cava Castelbaito", x: 800, y: -4320, r: 200 },
  { name: "Cava Fratteta", x: 1040, y: -4450, r: 100 },
  { name: "Cava Bardiglio", x: 1531, y: -4536, r: 50 },
  { name: "Cava Vittoria", x: 1401, y: -4795, r: 240 },
  { name: "Cave Crespina", x: 1284, y: -5241, r: 280 },
  { name: "Foce di Pianza", x: 907, y: -5154, r: 130 },
  { name: "Capanne del Sagro", x: 1796, y: -5497, r: 120 },
  { name: "Monte Sagro", x: 2364, y: -5129, r: 450 },
  { name: "Foce di Vinca", x: 3083, y: -5035, r: 200 },
  { name: "Capanna Garnerone", x: 4100, y: -4530, r: 200 },
  { name: "Cresta Garnerone", x: 4570, y: -4050, r: 250 },
  { name: "Foce di Giovo", x: 4511, y: -3252, r: 200 },
  { name: "Capanne di Giovo", x: 4090, y: -3150, r: 220 },
  { name: "Pizzo d'Uccello", x: 4210, y: -2454, r: 300 },
  { name: "Cresta di Capradossa", x: 4600, y: -1950, r: 250 },
  { name: "Pizzo dell'Aquila", x: 2391, y: -1592, r: 300 },
  { name: "Cave del Cantonaccio", x: 4042, y: -1744, r: 160 },
  { name: "Cava Col Pelato", x: 3673, y: -1271, r: 200 },
  { name: "Cava di Poggio di Sante", x: 3812, y: -979, r: 60 },
  { name: "Alpe d'Ugliano", x: 4662, y: -681, r: 250 },
  { name: "Cava Cattani", x: 3263, y: -768, r: 230 },
  { name: "Solco di Equi", x: 2850, y: 0, r: 420 },
  { name: "Monte Puntone", x: -2371, y: -2956, r: 250 },
  { name: "Passo della Gabellaccia", x: -2529, y: -4225, r: 200 },
  { name: "Canal d'Abbia", x: -1800, y: -4850, r: 200 },
  { name: "Piastriccioni", x: -1450, y: -5700, r: 300 },
  { name: "Cava Lorano", x: -640, y: -5760, r: 260 },
  { name: "Cave del Morlungo", x: 270, y: -5203, r: 310 },
  { name: "Il Boscaccio", x: 1140, y: -5900, r: 350 },
  { name: "Capanne di Navola", x: 3460, y: -5560, r: 350 }
]

/** Populated places only: a `locality` (a named hillside, a field) would claim the village's buildings around it. */
const PLACES: ReadonlySet<string> = new Set(["village", "hamlet"])
/** A building farther than this (m) from every place node is a farmhouse, no village's. */
const REACH = 600
/** Share of a place's buildings its disc covers; the rest are outliers. */
const FIT = 0.9
const RADIUS = { min: 80, max: 400 } // m

/**
 * MONZONE, then a disc per OSM place outside it, in node id order, then LANDMARKS. Each building outside MONZONE
 * goes to the nearest place node within REACH; the disc covers FIT of them (plus 10 m), clamped
 * to RADIUS and rounded to 10 m.
 */
export const fitDistricts = (osm: Osm, buildings: ReadonlyArray<BuildingF>): Array<District> => {
  if (REGION.id === "cesena") return [...osm.nodes.values()].flatMap((node) => {
    const [x, y] = toLocal(node.lat, node.lon)
    const name = node.tags.name
    return name !== undefined && ["city", "suburb", "neighbourhood", "village", "hamlet"].includes(node.tags.place ?? "") && inBounds(x, y)
      ? [{ name, x: r1(x), y: r1(y), r: node.tags.place === "city" ? 1000 : 500 }] : []
  })
  const inMonzone = (x: number, y: number) => MONZONE.some((d) => Math.hypot(x - d.x, y - d.y) <= d.r)
  const places = [...osm.nodes.values()].flatMap((n) => {
    const [x, y] = toLocal(n.lat, n.lon)
    const name = n.tags.name
    return PLACES.has(n.tags.place ?? "") && name !== undefined && inBounds(x, y) && !inMonzone(x, y) ? [{ name, x, y, near: [] as Array<number> }] : []
  })
  for (const b of buildings) {
    const [cx, cy] = centroid(b.outer)
    if (inMonzone(cx, cy)) continue
    let best: (typeof places)[number] | undefined, bestD = REACH
    for (const p of places) {
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (d < bestD) [best, bestD] = [p, d]
    }
    best?.near.push(bestD)
  }
  return [...MONZONE, ...places.map(({ name, x, y, near }) => {
    near.sort((a, b) => a - b)
    const fit = (near[Math.floor(FIT * (near.length - 1))] ?? 0) + 10
    return { name, x: r1(x), y: r1(y), r: Math.round(Math.min(RADIUS.max, Math.max(RADIUS.min, fit)) / 10) * 10 }
  }), ...LANDMARKS]
}
