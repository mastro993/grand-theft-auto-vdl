import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { BOUNDS, fromLocal } from "./geometry.ts"
import { REGION } from "./region.ts"

if (REGION.id !== "cesena") throw new Error("fetch-rer requires --region cesena")

const metadataUrl = "https://geoportale.regione.emilia-romagna.it/++api++/catalogo/dati-cartografici/altimetria/layer-2"
const request = async (url: string) => {
  const response = await fetch(url, { headers: { "User-Agent": "gta-lunigiana" }, signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`Terrain source: HTTP ${response.status}`)
  return response
}
const metadata: unknown = await (await request(metadataUrl)).json()
if (typeof metadata !== "object" || metadata === null || !("license_type" in metadata) || typeof metadata.license_type !== "string" || !metadata.license_type.startsWith("CC BY 4.0 ")) throw new Error("Terrain licence must be verified as CC BY 4.0")

const margin = 64
const [south, west] = fromLocal(BOUNDS.minX - margin, BOUNDS.minY - margin)
const [north, east] = fromLocal(BOUNDS.maxX + margin, BOUNDS.maxY + margin)
const url = new URL("https://servizigis.regione.emilia-romagna.it/wcs/dtm5x5")
url.search = new URLSearchParams({
  service: "WCS", version: "1.0.0", request: "GetCoverage", coverage: "DTM5X5_RDN32_RMD",
  crs: "EPSG:4326", response_crs: "EPSG:4326", bbox: [west, south, east, north].join(","),
  width: String(Math.ceil((BOUNDS.maxX - BOUNDS.minX + 2 * margin) / 5)),
  height: String(Math.ceil((BOUNDS.maxY - BOUNDS.minY + 2 * margin) / 5)), format: "GeoTIFF", interpolation: "bilinear"
}).toString()
const bytes = new Uint8Array(await (await request(url.href)).arrayBuffer())
if (!((bytes[0] === 73 && bytes[1] === 73) || (bytes[0] === 77 && bytes[1] === 77))) throw new Error(`WCS did not return TIFF: ${new TextDecoder().decode(bytes.subarray(0, 300))}`)
const dir = join(import.meta.dirname, "../../data/raw/cesena")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "dtm.tif"), bytes)
writeFileSync(join(dir, "source.json"), JSON.stringify({
  source: "Regione Emilia-Romagna, DTM 5x5 - ultima edizione",
  licence: metadata.license_type, metadata: metadataUrl, request: url.href,
  sha256: createHash("sha256").update(bytes).digest("hex")
}, null, 2) + "\n")
console.log(`Pinned Cesena DTM: ${bytes.length} bytes`)