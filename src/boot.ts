/**
 * Browser entry: turns the title card into a loading screen, downloads the map with byte progress
 * (gunzipping it as it arrives), hands it to the sim, then imports the game a few modules at a time
 * so the bar moves between the heavy ones. `main.ts` builds the rest and opens the card once the
 * first frame is drawn. Any failure stays on the card with a retry.
 *
 * @module boot
 */
import { loadFailed, loading, step } from "./hud/title.ts"
import { mapForSearch } from "./maps.ts"
import { provideMap } from "./sim/map/packed.ts"

/** Share of the bar the download fills; the build steps share the rest. */
const DOWNLOAD = 0.6
const mb = (bytes: number) => (bytes / 1e6).toFixed(1)

/**
 * The map file gunzipped, counting the bytes against Content-Length as they arrive (only bytes
 * when the host sends none; when it compresses the file again, the two differ slightly: clamped).
 */
const download = async (url: URL): Promise<Uint8Array> => {
  const response = await fetch(url)
  if (!response.ok || response.body === null) throw new Error(`${url.pathname}: HTTP ${response.status}`)
  const total = Number(response.headers.get("content-length") ?? 0)
  let received = 0
  const count = new TransformStream<Uint8Array<ArrayBuffer>, BufferSource>({
    transform(chunk, out) {
      received += chunk.byteLength
      const detail = total > 0 ? `${mb(Math.min(received, total))} / ${mb(total)} MB` : `${mb(received)} MB`
      loading(document, "Downloading map", total > 0 ? DOWNLOAD * Math.min(1, received / total) : 0, detail)
      out.enqueue(chunk)
    }
  })
  return new Uint8Array(await new Response(response.body.pipeThrough(count).pipeThrough(new DecompressionStream("gzip"))).arrayBuffer())
}

try {
  const map = mapForSearch(location.search)
  document.title = `Grand Theft Auto: ${map.name}`
  document.getElementById("title-place")!.textContent = map.name
  document.getElementById("title-subtitle")!.textContent = map.subtitle
  if (map.id === "cesena") for (const credit of document.querySelectorAll(".credits, .fine")) credit.textContent = "Map data © OpenStreetMap contributors (ODbL) · Terrain: Regione Emilia-Romagna, DTM 5x5 - ultima edizione (CC BY 4.0)"
  for (const link of document.querySelectorAll<HTMLAnchorElement>("#map-choice a")) {
    const url = new URL(link.href)
    const seed = new URLSearchParams(location.search).get("seed")
    if (seed !== null) url.searchParams.set("seed", seed)
    link.href = url.href
    if (url.searchParams.get("map") === map.id) link.setAttribute("aria-current", "page")
  }
  loading(document, "Downloading map", 0)
  provideMap(await download(map.url))
  // Each import evaluates only what the earlier ones left: the map and its collision grids, then
  // the traffic lanes every vehicle model can use, then the rest of the game.
  await step(document, "Decoding map", DOWNLOAD)
  await import("./sim/map/index.ts")
  await step(document, "Planning traffic", 0.68)
  await import("./sim/route.ts")
  await step(document, "Loading the game", 0.74)
  await import("./main.ts")
} catch (error) {
  loadFailed(document, error)
}
