/** Maps that can be selected before creating a world. */
export type MapId = "lunigiana" | "cesena"

const maps = {
  lunigiana: {
    id: "lunigiana", name: "Lunigiana",
    subtitle: "Monzone · Equi Terme · Vinca · Gragnola — Valle del Lucido (MS)",
    url: new URL("./sim/map/monzone.bin", import.meta.url)
  },
  cesena: {
    id: "cesena", name: "Cesena", subtitle: "Cesena · Centro urbano · Fiume Savio (FC)",
    url: new URL("./sim/map/cesena.bin", import.meta.url)
  }
} as const satisfies Record<MapId, { readonly id: MapId; readonly name: string; readonly subtitle: string; readonly url: URL }>

/** Resolves a map from the page query, preserving Lunigiana as the default. */
export const mapForSearch = (search: string): (typeof maps)[MapId] => {
  const id = new URLSearchParams(search).get("map") ?? "lunigiana"
  if (id !== "lunigiana" && id !== "cesena") throw new Error(`Unknown map: ${id}. Choose lunigiana or cesena.`)
  return maps[id]
}