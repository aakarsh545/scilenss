import { angularMomentum, energy, physicalScale, rebaseState } from "./schwarzschild.js?v=mass-1"

export const MIN_SOLAR_MASSES = 10
export const MAX_SOLAR_MASSES = 1e10
export const MAX_OBJECT_ENERGY_FRACTION = 1e-6

export function validateTestMasses(probes, scale) {
  let total = 0
  for (const probe of probes) {
    if (!(Number.isFinite(probe.massKg) && probe.massKg > 0)) throw new Error("Object mass must be finite and positive.")
    if (!probe.captured) total += probe.massKg * Math.max(1, probe.energy0 ?? 1)
  }
  if (!(total <= scale.massKg * MAX_OBJECT_ENERGY_FRACTION * (1 + 1e-12))) {
    throw new Error("Combined object mass-energy must stay below one millionth of the black-hole mass. Reduce object masses or increase black-hole mass.")
  }
}

export function changeBlackHoleMass(world, previousScale, solarMasses) {
  if (!(Number.isFinite(solarMasses) && solarMasses >= MIN_SOLAR_MASSES && solarMasses <= MAX_SOLAR_MASSES)) {
    throw new Error("Choose a black-hole mass from 10 to 10 billion solar masses.")
  }
  const scale = physicalScale(solarMasses)
  const ratio = previousScale.radiusMeters / scale.radiusMeters
  const probes = world.probes.map(probe => {
    const position = probe.state.slice(0, 3).map(value => value * ratio)
    const captured = probe.captured || Math.hypot(...position) <= 1
    const state = captured ? [...position, 0, 0, 0, 0] : rebaseState(probe.state, ratio)
    return {
      ...probe, state, captured, capturedAt: captured ? 0 : null,
      captureReason: probe.captured ? "previous" : captured ? "mass-change" : null,
      energy0: energy(state), angular0: angularMomentum(state),
      trail: [position.slice()], trailAt: 0, trailCaptured: false,
    }
  })
  validateTestMasses(probes, scale)
  return { scale, ratio, world: { ...world, probes, time: 0, steps: 0, lastError: 0, limited: false } }
}
