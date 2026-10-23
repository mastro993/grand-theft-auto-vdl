import assert from "node:assert/strict"
import { test } from "node:test"

import { mapForSearch } from "./maps.ts"

test("Lunigiana remains the default map", () => {
  assert.equal(mapForSearch("?seed=42").id, "lunigiana")
  assert.ok(mapForSearch("").url.pathname.endsWith("monzone.bin"))
})

test("Cesena selects a separate bundled map and title", () => {
  const map = mapForSearch("?map=cesena&seed=42")
  assert.equal(map.name, "Cesena")
  assert.ok(map.url.pathname.endsWith("cesena.bin"))
})

test("unknown maps produce a useful error instead of silently loading the wrong city", () => {
  assert.throws(() => mapForSearch("?map=missing"), /Unknown map/)
})