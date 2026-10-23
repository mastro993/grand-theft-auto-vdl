import type { MapId } from "../maps.ts"

/** A separately built play area; survey inputs are never shared between regions. */
export interface Region {
  readonly id: MapId
  readonly file: string
  readonly origin: { readonly lat: number; readonly lon: number }
  readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
}

const regions: ReadonlyArray<Region> = [
  {
    id: "lunigiana", file: "monzone",
    origin: { lat: 44.16175, lon: 10.13 },
    bounds: { minX: -2900, minY: -6100, maxX: 4900, maxY: 3900 }
  },
  {
    id: "cesena", file: "cesena",
    origin: { lat: 44.1391, lon: 12.2429 },
    bounds: { minX: -2000, minY: -2000, maxX: 2000, maxY: 2000 }
  }
]

/** Selects a known region, defaulting to the original map; invalid input fails before I/O. */
export const regionFromArgs = (args: ReadonlyArray<string>): Region => {
  const index = args.indexOf("--region")
  const id = index < 0 ? "lunigiana" : args[index + 1]
  const region = regions.find((candidate) => candidate.id === id)
  if (region === undefined) throw new Error(`Unknown or missing region: ${id ?? "--region requires a name"}`)
  return region
}

/** Build region for this Node invocation, fixed before the geometry modules load. */
export const REGION = regionFromArgs(globalThis.process?.argv?.slice(2) ?? [])