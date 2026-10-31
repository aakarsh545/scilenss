import assert from "node:assert/strict"
import { createCamera, cameraBasis, panCamera, project, rotateCamera, zoomCamera } from "./orbit-camera.js"
import { circularPlacement } from "./orbit-placement.js"
import { createProbe, createSimulation, integrate } from "./schwarzschild.js"

const viewport = { width: 826, height: 827 }
for (const radius of [3.2, 6, 10]) {
  for (const angles of [[0, 0], [1.2, 0.6], [-2, -0.8]]) {
    const camera = createCamera()
    rotateCamera(camera, ...angles)
    panCamera(camera, 45, -30)
    zoomCamera(camera, 0.7, 520, 340, viewport)
    const right = cameraBasis(camera).right
    const point = project(right.map(value => value * radius), camera, viewport)
    const placement = circularPlacement(point, camera, viewport)
    assert.ok(placement.valid)
    assert.ok(Math.abs(placement.radius - radius) < 1e-12)
    const probe = createProbe(placement.position, placement.velocity)
    const world = createSimulation([probe])
    const period = 2 * Math.PI * Math.sqrt(2 * radius ** 3)
    for (let sample = 0; sample < 60; sample++) {
      const duration = 4 * period / 60
      const advanced = integrate(world, duration, { maxSteps: 2000 })
      assert.ok(Math.abs(advanced - duration) < 1e-9)
      assert.equal(probe.captured, false, `r=${radius} stays outside the horizon`)
      assert.ok(Math.abs(Math.hypot(...probe.state.slice(0, 3)) - radius) < 3e-6, `r=${radius} stays circular through four periods`)
    }
  }
}
const camera = createCamera()
assert.equal(circularPlacement({ x: 413, y: 413.5 }, camera, viewport).valid, false)
assert.equal(circularPlacement({ x: 413 + 2 / camera.scale, y: 413.5 }, camera, viewport).valid, false)
console.log("Orbit placement stays circular through four periods at three radii and three camera poses")
