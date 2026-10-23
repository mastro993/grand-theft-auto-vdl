import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { gunzipSync } from "node:zlib"

import { decodeMap, provideMap } from "../sim/map/packed.ts"
import { pointInRing, segDist2 } from "./geometry.ts"
import { clearance } from "./spawns.ts"

const map = decodeMap(gunzipSync(readFileSync(new URL("../sim/map/cesena.bin", import.meta.url))))

test("Cesena contains the real city, station, historic centre and connected streets", () => {
  assert.equal(map.origin.lon, 12.2429)
  assert.ok(map.districts.some((district) => district.name === "Cesena"))
  assert.ok(map.districts.every((district) => !/Monzone|Sagro|Equi/.test(district.name)))
  assert.ok(map.pois.some((poi) => poi.name === "Cesena" && poi.kind === "railway=station"))
  assert.ok(map.roads.some((road) => /Mazzini/.test(road.name ?? "")))
  assert.ok(map.buildings.some((building) => /Malatestiana/.test(building.name ?? "")))
  assert.ok(map.graph.traffic.length > 0 && map.graph.walk.length > 0)
})

test("Cesena starts on clear ground in the centre with cars to steal", () => {
  const { x, y } = map.spawns.player
  const trees = Array.from(map.trees)
  assert.ok(Math.hypot(x, y) < 200)
  const containing = map.buildings.find((building) => pointInRing(x, y, building.outer) && !(building.holes ?? []).some((hole) => pointInRing(x, y, hole)))
  assert.equal(containing, undefined, `Player starts inside building ${containing?.id}`)
  const walk = clearance(Array.from(map.walls.walk), trees)
  assert.ok(walk.circle(x, y, 1.2))
  assert.ok(clearance(Array.from(map.walls.drive), trees).circle(x, y, 1.2))
  const reachesStreet = map.roads.some((road) => {
    if (!["tertiary", "unclassified", "residential", "service"].includes(road.cls)) return false
    for (let index = 0; index + 3 < road.pts.length; index += 2) {
      const ax = road.pts[index]!, ay = road.pts[index + 1]!, bx = road.pts[index + 2]!, by = road.pts[index + 3]!
      const { d2, t } = segDist2(x, y, ax, ay, bx, by)
      if (d2 > (road.w / 2 + 1.1) ** 2) continue
      const steps = Math.ceil(Math.sqrt(d2) / 0.5)
      if (Array.from({ length: steps + 1 }, (_, step) => {
        const fraction = steps === 0 ? 0 : step / steps
        return walk.circle(x + (ax + (bx - ax) * t - x) * fraction, y + (ay + (by - ay) * t - y) * fraction, 1.2)
      }).every(Boolean)) return true
    }
    return false
  })
  assert.ok(reachesStreet, "Player must have an unobstructed walking route to the street")
  assert.ok(map.spawns.parked.some((car) => Math.hypot(car.x - x, car.y - y) < 150))
})

test("the Savio uses its mapped riverbanks rather than the mountain-stream default", () => {
  const savio = map.water.filter((water) => /Savio/.test(water.name ?? ""))
  assert.ok(savio.length > 0)
  assert.ok(savio.every((water) => water.w > 8 && water.w <= 120))
})

test("Cesena boots the existing simulation, populates it and replays walking deterministically", async () => {
  provideMap(gunzipSync(readFileSync(new URL("../sim/map/cesena.bin", import.meta.url))))
  const { start } = await import("../sim/testing.ts")
  const run = () => {
    const simulation = start([{ frame: 0, press: ["up"] }, { frame: 120, release: ["up"] }])
    simulation.run(180)
    const player = simulation.view()
    return { player, world: simulation.world() }
  }
  const first = run()
  assert.ok(first.player !== undefined)
  assert.ok(Math.hypot(first.player.pose.x - map.spawns.player.x, first.player.pose.y - map.spawns.player.y) > 1)
  assert.ok(first.world.vehicles.length > 0)
  assert.deepEqual(run(), first)
})