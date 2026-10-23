// Downloads the OSM extract the map build reads: `data/raw/lunigiana.osm.gz`.
// Run: node src/tools/fetch-osm.ts  (pnpm fetch-osm).
// The OSM API 0.6 `/map` call is limited to 50 000 nodes, so the play area plus MARGIN is fetched
// in TILES × TILES pieces. Every multipolygon relation with an AREA_KEYS tag (land use, natural,
// building, leisure, amenity) is then fetched whole (`/relation/<id>/full`), because most of a
// forest's member ways lie outside the play area. Elements are merged by id and written sorted
// (nodes, ways, relations, each by id), so the same OSM data always gives the same file.
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

import { BOUNDS, fromLocal } from "./geometry.ts"
import { REGION } from "./region.ts"

const API = "https://api.openstreetmap.org/api/0.6"
const OUT = join(import.meta.dirname, `../../data/raw/${REGION.id}.osm.gz`)
const MARGIN = 100 // m beyond the play area: ways crossing the edge come whole anyway
const TILES = 4
const AREA_KEYS = ["landuse", "natural", "building", "leisure", "amenity"]

const get = async (url: string): Promise<string> => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "gta-lunigiana map build" } })
    if (res.ok) return res.text()
    if (attempt === 4) throw new Error(`${url}: HTTP ${res.status}`)
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
  }
}

/** Element XML by kind and numeric id. */
const elements = { node: new Map<number, string>(), way: new Map<number, string>(), relation: new Map<number, string>() }
const absorb = (xml: string): Array<{ readonly id: number; readonly xml: string }> => {
  const relations: Array<{ id: number; xml: string }> = []
  for (const m of xml.matchAll(/<(node|way|relation)\s[^>]*?\bid="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g)) {
    const kind = m[1] as keyof typeof elements, id = Number(m[2])
    elements[kind].set(id, m[0])
    if (kind === "relation") relations.push({ id, xml: m[0] })
  }
  return relations
}

const [s, w] = fromLocal(BOUNDS.minX - MARGIN, BOUNDS.minY - MARGIN), [n, e] = fromLocal(BOUNDS.maxX + MARGIN, BOUNDS.maxY + MARGIN)
for (let i = 0; i < TILES; i++) for (let j = 0; j < TILES; j++) {
  const bbox = [w + ((e - w) * i) / TILES, s + ((n - s) * j) / TILES, w + ((e - w) * (i + 1)) / TILES, s + ((n - s) * (j + 1)) / TILES].map((v) => v.toFixed(6))
  absorb(await get(`${API}/map?bbox=${bbox.join(",")}`))
  console.log(`tile ${i},${j}: ${elements.node.size} nodes, ${elements.way.size} ways`)
}
const areaRelation = (xml: string) => /<tag k="type" v="multipolygon"\s*\/>/.test(xml) && AREA_KEYS.some((k) => xml.includes(`<tag k="${k}"`))
for (const { id } of [...elements.relation.entries()].map(([id, xml]) => ({ id, xml })).filter((r) => areaRelation(r.xml))) {
  absorb(await get(`${API}/relation/${id}/full`))
  console.log(`relation ${id}: ${elements.node.size} nodes, ${elements.way.size} ways`)
}
const sorted = (m: Map<number, string>) => [...m].sort((a, b) => a[0] - b[0]).map(([, xml]) => `  ${xml.trim()}`)
const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="gta-lunigiana fetch-osm">', ...sorted(elements.node), ...sorted(elements.way), ...sorted(elements.relation), "</osm>", ""].join("\n")
writeFileSync(OUT, gzipSync(xml, { level: 9 }))
console.log({ nodes: elements.node.size, ways: elements.way.size, relations: elements.relation.size, bytes: xml.length })
