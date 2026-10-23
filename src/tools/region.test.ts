import assert from "node:assert/strict"
import { test } from "node:test"

import { regionFromArgs } from "./region.ts"

test("the default build keeps the pinned Lunigiana map", () => {
  const region = regionFromArgs([])
  assert.equal(region.id, "lunigiana")
  assert.equal(region.file, "monzone")
  assert.deepEqual(region.origin, { lat: 44.16175, lon: 10.13 })
})

test("Cesena is a separate city-centre map", () => {
  const region = regionFromArgs(["--region", "cesena"])
  assert.equal(region.file, "cesena")
  assert.ok(region.origin.lat > 44.13 && region.origin.lat < 44.15)
  assert.ok(region.origin.lon > 12.23 && region.origin.lon < 12.26)
  assert.equal(region.bounds.maxX - region.bounds.minX, 4000)
  assert.equal(region.bounds.maxY - region.bounds.minY, 4000)
})

test("unknown regions and incomplete arguments fail before a fetch or build", () => {
  assert.throws(() => regionFromArgs(["--region", "unknown"]), /region/)
  assert.throws(() => regionFromArgs(["--region"]), /region/)
})