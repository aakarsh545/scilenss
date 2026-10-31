import assert from "node:assert/strict"
import { changeBlackHoleMass, validateTestMasses, MAX_OBJECT_ENERGY_FRACTION } from "./blackhole-mass.js"
import { createProbe, createSimulation, physicalScale, energy, angularMomentum, localVelocity, integrate, rebaseState } from "./schwarzschild.js"
import { createCamera, project, panCamera, zoomCamera, rescaleCamera } from "./orbit-camera.js"

const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} vs ${b}`)
const oldScale = physicalScale()
const twice = physicalScale(oldScale.solarMasses * 2)
for (const key of ["massKg", "radiusMeters", "seconds"]) near(twice[key], oldScale[key] * 2)
assert.throws(() => physicalScale(0), /mass/i)
assert.throws(() => createProbe([5, 0, 0], [0, 0, 0], "Invalid", 0), /mass/i)

const probe = createProbe([3, 4, 0], [0.2, -0.3, 0.1], "Heavy", 1e20)
const world = createSimulation([probe])
integrate(world, 0.1)
const before = structuredClone(world)
const oldVelocity = localVelocity(probe.state)
const changed = changeBlackHoleMass(world, oldScale, oldScale.solarMasses / 2)
const mapped = changed.world.probes[0]
assert.deepEqual(world, before, "mass change constructs a new world before committing")
for (let i = 0; i < 3; i++) {
  near(mapped.state[i] * changed.scale.radiusMeters, probe.state[i] * oldScale.radiusMeters)
  near(localVelocity(mapped.state)[i], oldVelocity[i])
  near(angularMomentum(mapped.state)[i] * changed.scale.radiusMeters, angularMomentum(probe.state)[i] * oldScale.radiusMeters)
}
const oldRadius = Math.hypot(...probe.state.slice(0, 3))
near(energy(mapped.state) / energy(probe.state), Math.sqrt((1 - 1 / (oldRadius * 2)) / (1 - 1 / oldRadius)))
assert.equal(changed.world.time, 0)
assert.equal(mapped.state[6], 0)
assert.equal(mapped.massKg, probe.massKg)
assert.equal(mapped.id, probe.id)
assert.equal(mapped.trail.length, 1)
const restored = changeBlackHoleMass(changed.world, changed.scale, oldScale.solarMasses).world.probes[0]
restored.state.slice(0, 6).forEach((value, i) => near(value, probe.state[i]))

const boundary = createSimulation([createProbe([5, 0, 0], [0, 0.2, 0], "Boundary", 1)])
const boundaryBefore = structuredClone(boundary)
assert.throws(() => changeBlackHoleMass(boundary, oldScale, oldScale.solarMasses * 5 / 1.00005), /close.*horizon/)
assert.deepEqual(boundary, boundaryBefore)
const engulfed = changeBlackHoleMass(boundary, oldScale, oldScale.solarMasses * 6)
assert.equal(engulfed.world.probes[0].captured, true)
assert.equal(engulfed.world.probes[0].captureReason, "mass-change")
const historical = changeBlackHoleMass(engulfed.world, engulfed.scale, oldScale.solarMasses / 10)
assert.equal(historical.world.probes[0].captured, true)
assert.equal(historical.world.probes[0].captureReason, "previous")
assert.ok(Math.hypot(...historical.world.probes[0].state.slice(0, 3)) > 1)

const nearHorizon = [1 + Number.EPSILON, 0, 0, 0, 0, 0, 0]
assert.equal(Math.hypot(...localVelocity(nearHorizon)), 1, "regression exercises rounded-to-c local speed")
const tetradMapped = rebaseState(nearHorizon, 2)
assert.ok(tetradMapped.every(Number.isFinite))
near(tetradMapped[3], -2.7797401624e7, 1e-10)
const energetic = createProbe([5, 0, 0], [0, 0, 0], "Relativistic", oldScale.massKg * MAX_OBJECT_ENERGY_FRACTION / 2)
energetic.state = nearHorizon.slice()
energetic.energy0 = energy(energetic.state)
const energeticWorld = createSimulation([energetic])
const energeticBefore = structuredClone(energeticWorld)
assert.throws(() => changeBlackHoleMass(energeticWorld, oldScale, oldScale.solarMasses / 2), /mass-energy/)
assert.deepEqual(energeticWorld, energeticBefore)
assert.throws(() => validateTestMasses([{ massKg: oldScale.massKg * 1e-6, energy0: 2 }], oldScale), /mass-energy/)
assert.throws(() => validateTestMasses([{ massKg: oldScale.massKg * 0.6e-6 }, { massKg: oldScale.massKg * 0.6e-6 }], oldScale), /mass-energy/)

const light = createProbe([6, 0, 0], [0, 0.3, 0], "Light", 1)
const heavy = createProbe([6, 0, 0], [0, 0.3, 0], "Heavy", 1e20)
integrate(createSimulation([light, heavy]), 40, { maxSteps: 10000 })
assert.deepEqual(light.state, heavy.state, "rest mass does not alter a test-particle geodesic")
near((heavy.massKg * energy(heavy.state)) / (light.massKg * energy(light.state)), 1e20)

const rain = createProbe([1e6, 0, 0], [-0.001, 0, 0])
const rainWorld = createSimulation([rain])
integrate(rainWorld, 1e5)
assert.equal(rainWorld.limited, false, "weak-field steps fit the normal budget")
near(rain.state[0], (1e9 - 1.5e5) ** (2 / 3), 1e-12)
near(rain.state[6], 1e5, 1e-13)
near(energy(rain.state), 1)
function farInfall(maxStep, tolerance) {
  const falling = createProbe([1e6, 0, 0], [-0.95, 0, 0])
  const fallingWorld = createSimulation([falling])
  integrate(fallingWorld, 1e5, { maxStep, tolerance })
  assert.equal(fallingWorld.limited, false)
  return falling.state
}
const coarse = farInfall(0.05, 1e-9)
const fine = farInfall(0.025, 1e-11)
coarse.forEach((value, i) => near(value, fine[i], 1e-10))
function crossing(maxStep, tolerance) {
  const falling = createProbe([1000, 0, 0], [-0.95, 0, 0])
  const simulation = createSimulation([falling])
  integrate(simulation, 1400, { maxStep, tolerance, maxSteps: 100000 })
  assert.equal(falling.captured, true)
  return falling
}
const crossingCoarse = crossing(0.05, 1e-9)
const crossingFine = crossing(0.025, 1e-11)
near(crossingCoarse.capturedAt, crossingFine.capturedAt, 1e-10)
near(crossingCoarse.state[6], crossingFine.state[6], 1e-10)
const closeRain = createProbe([1.2, 0, 0], [-1 / Math.sqrt(1.2), 0, 0])
const farRain = createProbe([1e6, 0, 0], [-0.001, 0, 0])
const mixed = createSimulation([closeRain, farRain])
integrate(mixed, 20)
assert.equal(closeRain.captured, true)
assert.equal(mixed.time, 20)
near(farRain.state[0], (1e9 - 30) ** (2 / 3), 1e-12)

const camera = createCamera()
const viewport = { width: 826, height: 827 }
panCamera(camera, 40, -20)
const viewBefore = project(probe.state.slice(0, 3), camera, viewport)
rescaleCamera(camera, changed.ratio)
const viewAfter = project(mapped.state.slice(0, 3), camera, viewport)
near(viewBefore.x, viewAfter.x)
near(viewBefore.y, viewAfter.y)
rescaleCamera(camera, 4.154e6 / 10)
const scaleBeforeZoom = camera.scale
zoomCamera(camera, 0.9, 413, 413.5, viewport)
near(camera.scale, scaleBeforeZoom * 0.9)
camera.scale = 0.04
zoomCamera(camera, 0.9, 413, 413.5, viewport)
near(camera.scale, 0.036, 1e-12)
console.log("Mass units, physical-state preservation, capture semantics, transactional limits, far-field accuracy, and camera rescaling passed")
