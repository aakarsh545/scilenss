import assert from "node:assert/strict"
import { circularProbe, createProbe, energy, angularMomentum, derivative, integrate, createSimulation, localVelocity, physicalScale } from "./schwarzschild.js"

const norm = (v) => Math.hypot(...v)
const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} vs ${expected}`)

const isco = circularProbe(3)
close(energy(isco.state), Math.sqrt(8 / 9), 1e-13, "ISCO specific energy")
close(norm(angularMomentum(isco.state)), Math.sqrt(3), 1e-13, "ISCO angular momentum")
close(derivative(isco.state)[6], Math.sqrt(0.5), 1e-13, "ISCO proper clock rate")
assert.throws(() => circularProbe(1.5), /circular/)
assert.throws(() => createProbe([1.01, 0, 0], [0, 0, 0]), /1\.05/)
assert.throws(() => createProbe([4, 0, 0], [1, 0, 0]), /0\.95/)

for (const velocity of [[0, 0.2, 0], [-0.6, 0.3, 0.1], [0.9, 0, 0]]) {
  const probe = createProbe([4, 0, 0], velocity)
  const restored = localVelocity(probe.state)
  velocity.forEach((value, i) => close(restored[i], value, 1e-12, "local velocity round trip"))
}

const circular = circularProbe(8)
const initialEnergy = energy(circular.state)
const initialAngular = norm(angularMomentum(circular.state))
const period = 2 * Math.PI / Math.sqrt(0.5 / 8 ** 3)
const circleWorld = createSimulation([circular])
integrate(circleWorld, 4 * period, { maxSteps: 100000 })
close(norm(circular.state.slice(0, 3)), 8, 2e-7, "circular radius after four orbits")
close(circular.state[0], 8, 2e-6, "circular phase closes")
close(circular.state[1], 0, 2e-6, "circular phase closes in y")
close(energy(circular.state), initialEnergy, 2e-9, "specific energy conserved")
close(norm(angularMomentum(circular.state)), initialAngular, 2e-8, "angular momentum conserved")
close(circular.state[6] / circleWorld.time, Math.sqrt(1 - 1.5 / 8), 2e-9, "circular proper clock rate")

const falling = createProbe([4, 0, 0], [-0.5, 0, 0])
falling.state.slice(3, 6).forEach(value => close(value, 0, 1e-13, "freefall rain-frame momentum"))
const fallWorld = createSimulation([falling])
integrate(fallWorld, 6, { maxSteps: 10000 })
assert.ok(falling.captured, "ingoing probe crosses the horizon")
close(norm(falling.state.slice(0, 3)), 1, 2e-10, "horizon event located")
close(falling.capturedAt, (2 / 3) * (4 ** 1.5 - 1), 2e-7, "analytic PG horizon-crossing time")
close(falling.state[6], falling.capturedAt, 2e-7, "rain observer proper time equals PG time")

const a = circularProbe(6)
const b = circularProbe(6, Math.PI / 2)
const rotatedWorld = createSimulation([a, b])
integrate(rotatedWorld, 40, { maxSteps: 10000 })
close(a.state[0], b.state[0], 1e-9, "inclination preserves x motion")
close(a.state[1], b.state[2], 1e-9, "3D rotational covariance")
close(b.state[1], 0, 1e-9, "inclined orbit remains in its plane")

const bounded = createSimulation([circularProbe(8)])
const consumed = integrate(bounded, 100, { maxSteps: 2 })
assert.ok(consumed > 0 && consumed <= 0.1, "step cap bounds time actually integrated")
close(bounded.time, consumed, 1e-15, "world clock uses consumed time")
assert.ok(bounded.limited)
assert.throws(() => integrate(bounded, -1), /time/)
assert.ok(physicalScale().radiusMeters > 1e10 && physicalScale().seconds > 40)

close(energy([1 + Number.EPSILON, 0, 0, 2 ** 53, 0, 0, 0]), 1, 1e-12, "rationalized energy avoids horizon cancellation")
const released = createProbe([2, 0, 0], [0, 0, 0])
close(released.state[3], 1, 1e-14, "hovering rest is not rain-frame rest")
close(derivative(released.state)[0], 0, 1e-14, "released hovering probe starts at coordinate rest")
close(derivative(released.state)[6], 1 / Math.sqrt(2), 1e-14, "hovering proper clock rate")
integrate(createSimulation([released]), 0.001)
close(2 * (released.state[0] - 2) / 0.001 ** 2, -1 / 16, 1e-4, "hovering-release coordinate acceleration")

function phaseError(maxStep) {
  const probe = circularProbe(3.2)
  const simulation = createSimulation([probe])
  integrate(simulation, 400, { maxSteps: 100000, maxStep, tolerance: 1e-4 })
  const angle = 400 * Math.sqrt(0.5 / 3.2 ** 3)
  return Math.hypot(probe.state[0] - 3.2 * Math.cos(angle), probe.state[1] - 3.2 * Math.sin(angle))
}
const coarseError = phaseError(0.1)
const fineError = phaseError(0.05)
assert.ok(fineError < coarseError / 5 && fineError < 1e-6, `finite-duration trajectory converges: ${coarseError} -> ${fineError}`)

const eccentric = createProbe([8, 0, 0], [0, 1 / Math.sqrt(18), 0])
close(energy(eccentric.state) ** 2, 63 / 68, 1e-13, "eccentric analytic energy")
close(norm(angularMomentum(eccentric.state)) ** 2, 64 / 17, 1e-13, "eccentric analytic angular momentum")
const eccentricWorld = createSimulation([eccentric])
let previousAngle = 0
let totalAngle = 0
let previousRadial = 0
let apocenterAngle = null
let minimumRadius = 8
for (let step = 0; step < 10000 && apocenterAngle == null; step += 1) {
  integrate(eccentricWorld, 0.1)
  const state = eccentric.state
  const angle = Math.atan2(state[1], state[0])
  const delta = Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle))
  const radial = derivative(state).slice(0, 3).reduce((sum, value, i) => sum + value * state[i], 0) / norm(state.slice(0, 3))
  if (previousRadial > 0 && radial <= 0) apocenterAngle = totalAngle + delta * previousRadial / (previousRadial - radial)
  totalAngle += delta
  previousAngle = angle
  previousRadial = radial
  minimumRadius = Math.min(minimumRadius, norm(state.slice(0, 3)))
}
assert.notEqual(apocenterAngle, null, "eccentric probe completes a radial cycle")
close(minimumRadius, 4, 2e-5, "strong-field periapsis")
close(apocenterAngle, 9.5360440582, 2e-5, "strong-field azimuth per radial cycle")

for (const angular of [1.99, 2.01]) {
  const radius = 10
  const f = 1 - 1 / radius
  const inward = -Math.sqrt(1 - f * (1 + angular ** 2 / radius ** 2))
  const probe = createProbe([radius, 0, 0], [inward, angular * Math.sqrt(f) / radius, 0])
  const simulation = createSimulation([probe])
  let closest = radius
  for (let step = 0; step < 2000; step += 1) {
    integrate(simulation, 0.2)
    closest = Math.min(closest, norm(probe.state.slice(0, 3)))
  }
  assert.equal(probe.captured, angular < 2, "marginal-bound capture threshold at L = 2")
  if (angular > 2) close(closest, 2.2213010932, 2e-4, "scattering turning radius")
}
console.log("All Schwarzschild geodesic checks passed")
