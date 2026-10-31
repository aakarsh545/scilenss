import { CONST } from "./orbit-physics.js"

// Exact Schwarzschild metric in ingoing PG coordinates; r_s = c = 1.
// Derivation and sources: RELATIVITY.md. These are independent massive test particles.
export const MAX_PROBES = 48
export const MIN_LAUNCH_RADIUS = 1.05
export const MAX_LOCAL_SPEED = 0.95
const DEFAULT_STEP = 0.05
export const SOLAR_MASS_KG = CONST.GM_SUN / CONST.G
export const EARTH_MASS_KG = CONST.GM_EARTH / CONST.G

export function physicalScale(solarMasses = 4.154e6) {
  if (!(Number.isFinite(solarMasses) && solarMasses > 0)) throw new Error("Black-hole mass must be finite and positive.")
  const radiusMeters = 2 * solarMasses * CONST.GM_SUN / CONST.C ** 2
  const massKg = solarMasses * SOLAR_MASS_KG
  if (!Number.isFinite(radiusMeters) || !Number.isFinite(massKg)) throw new Error("Black-hole mass is too large.")
  return { solarMasses, massKg, radiusMeters, seconds: radiusMeters / CONST.C }
}

function geometry(state) {
  const radius = Math.hypot(state[0], state[1], state[2])
  if (!(radius > 0) || !Number.isFinite(radius)) throw new Error("Invalid geodesic position.")
  const normal = state.slice(0, 3).map(value => value / radius)
  const radial = state[3] * normal[0] + state[4] * normal[1] + state[5] * normal[2]
  return { radius, normal, radial, flow: 1 / Math.sqrt(radius), gamma: Math.hypot(1, state[3], state[4], state[5]) }
}

export function energy(state) {
  const { radius, normal, radial, flow, gamma } = geometry(state)
  if (radial < 0) return gamma - flow * radial
  const transverse = normal.reduce((sum, value, i) => sum + (state[i + 3] - radial * value) ** 2, 0)
  // Rationalize the subtraction, including at the horizon.
  return (1 + transverse + ((radius - 1) / radius) * radial ** 2) / (gamma + flow * radial)
}

export function angularMomentum(state) {
  const [x, y, z, px, py, pz] = state
  return [y * pz - z * py, z * px - x * pz, x * py - y * px]
}

export function localVelocity(state) {
  const { radius, normal, radial, flow, gamma } = geometry(state)
  if (radius <= 1) throw new Error("A hovering observer cannot exist at or inside the horizon.")
  const conserved = energy(state)
  const radialSpeed = (radial - flow * gamma) / conserved
  const tangentScale = Math.sqrt((radius - 1) / radius) / conserved
  return normal.map((value, i) => radialSpeed * value + (state[i + 3] - radial * value) * tangentScale)
}

export function derivative(state) {
  const { radius, normal, radial, flow, gamma } = geometry(state)
  const position = normal.map((value, i) => state[i + 3] / gamma - flow * value)
  const momentum = normal.map((value, i) => (flow / radius) * (state[i + 3] - 1.5 * radial * value))
  return [...position, ...momentum, 1 / gamma]
}

export function stateFromLocalVelocity(position, velocity) {
  if (![position, velocity].every(vector => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite))) {
    throw new Error("A probe needs a finite 3D position and local velocity.")
  }
  const radius = Math.hypot(...position)
  if (!(radius > 1)) throw new Error("A local hovering state requires r > 1; new launches start outside 1.05 horizon radii.")
  const speed = Math.hypot(...velocity)
  if (!(speed < 1)) throw new Error("Massive probes require speed below c; new launches are limited to 0.95c.")
  const normal = position.map(value => value / radius)
  const radial = velocity.reduce((sum, value, i) => sum + value * normal[i], 0)
  const gamma = 1 / Math.sqrt(1 - speed ** 2)
  const radialMomentum = (radial + 1 / Math.sqrt(radius)) / Math.sqrt((radius - 1) / radius)
  const momentum = velocity.map((value, i) => gamma * (value + (radialMomentum - radial) * normal[i]))
  return [...position, ...momentum, 0]
}

export function createProbe(position, velocity, name = "Probe", massKg = 1) {
  if (!(Number.isFinite(massKg) && massKg > 0)) throw new Error("Object mass must be finite and positive.")
  const state = stateFromLocalVelocity(position, velocity)
  if (Math.hypot(...position) < MIN_LAUNCH_RADIUS) throw new Error("Launch outside 1.05 horizon radii.")
  if (Math.hypot(...velocity) > MAX_LOCAL_SPEED + 1e-14) throw new Error("Launch at or below 0.95c in the local hovering frame.")
  return {
    id: 0, name, massKg, state, captured: false, capturedAt: null,
    energy0: energy(state), angular0: angularMomentum(state),
    trail: [position.slice()], trailAt: 0,
  }
}

export function rebaseState(state, radiusRatio) {
  if (!(Number.isFinite(radiusRatio) && radiusRatio > 0)) throw new Error("Invalid mass scale ratio.")
  const { radius, normal, radial, flow, gamma } = geometry(state)
  const nextRadius = radius * radiusRatio
  if (!(radius > 1 && nextRadius >= 1.0001)) {
    throw new Error("An object would sit too close to the new horizon for a reliable mass change. Choose a slightly different mass.")
  }
  const oldRoot = Math.sqrt((radius - 1) / radius)
  const nextRoot = Math.sqrt((nextRadius - 1) / nextRadius)
  const localGamma = energy(state) / oldRoot
  const localRadial = (radial - flow * gamma) / oldRoot
  const nextRadial = (localRadial + localGamma / Math.sqrt(nextRadius)) / nextRoot
  const momentum = normal.map((value, i) => state[i + 3] - radial * value + nextRadial * value)
  const next = [...state.slice(0, 3).map(value => value * radiusRatio), ...momentum, 0]
  if (!next.every(Number.isFinite)) throw new Error("The mass change produced a non-finite state.")
  return next
}

export function circularProbe(radius, inclination = 0, phase = 0, massKg = 1) {
  if (!(radius > 1.5)) throw new Error("A timelike circular orbit requires r > 1.5 horizon radii.")
  const position = [radius * Math.cos(phase), radius * Math.sin(phase) * Math.cos(inclination), radius * Math.sin(phase) * Math.sin(inclination)]
  const speed = 1 / Math.sqrt(2 * (radius - 1))
  const velocity = [-speed * Math.sin(phase), speed * Math.cos(phase) * Math.cos(inclination), speed * Math.cos(phase) * Math.sin(inclination)]
  return createProbe(position, velocity, "Probe", massKg)
}

export function createSimulation(probes = []) {
  const world = { probes: [], time: 0, nextId: 1, limited: false, steps: 0, lastError: 0 }
  for (const probe of probes) addProbe(world, probe)
  return world
}

export function addProbe(world, probe) {
  if (world.probes.length >= MAX_PROBES) throw new Error("The scene holds 48 probes. Clear it before launching more.")
  probe.id = world.nextId++
  world.probes.push(probe)
  return probe
}

function rk4(state, step) {
  const stage = (slope, amount) => state.map((value, i) => value + amount * slope[i])
  const a = derivative(state)
  const b = derivative(stage(a, step / 2))
  const c = derivative(stage(b, step / 2))
  const d = derivative(stage(c, step))
  return state.map((value, i) => value + step * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6)
}

function twoHalfSteps(state, step) {
  return rk4(rk4(state, step / 2), step / 2)
}

function trialStep(state, step, tolerance) {
  const coarse = rk4(state, step)
  const fine = twoHalfSteps(state, step)
  if (!fine.every(Number.isFinite)) throw new Error("The geodesic solver produced a non-finite state.")
  const error = Math.max(...fine.map((value, i) => Math.abs(value - coarse[i]) / (15 * (1e-11 + tolerance * Math.max(1, Math.abs(value), Math.abs(state[i]))))))
  return { state: fine, error }
}

function horizonEvent(state, step) {
  let low = 0
  let high = step
  for (let iteration = 0; iteration < 38; iteration += 1) {
    const middle = (low + high) / 2
    const candidate = twoHalfSteps(state, middle)
    if (Math.hypot(...candidate.slice(0, 3)) > 1) low = middle
    else high = middle
  }
  return { elapsed: high, state: twoHalfSteps(state, high) }
}

export function integrate(world, duration, { maxSteps = 512, maxStep = DEFAULT_STEP, tolerance = 1e-9 } = {}) {
  if (!Number.isFinite(duration) || duration < 0) throw new Error("Integration time must be finite and non-negative.")
  if (!(maxStep > 0 && maxStep <= 0.1) || !Number.isInteger(maxSteps) || maxSteps < 1 || !(tolerance > 0 && Number.isFinite(tolerance))) {
    throw new Error("Invalid geodesic integration limits.")
  }
  let advanced = 0
  let step = duration
  let attempts = 0
  world.limited = false
  while (advanced < duration && attempts < maxSteps) {
    const active = world.probes.filter(probe => !probe.captured)
    if (!active.length) { advanced = duration; break }
    // Keep the strong-field cap; far from the hole, bound fractional spatial travel.
    const cap = maxStep * Math.max(1, Math.min(...active.map(probe => Math.hypot(...probe.state.slice(0, 3)))) / 20)
    const interval = Math.min(step, cap, duration - advanced)
    if (interval < 1e-10) break
    const trials = active.map(probe => trialStep(probe.state, interval, tolerance))
    const error = Math.max(...trials.map(trial => trial.error))
    attempts += 1
    if (!Number.isFinite(error)) throw new Error("The geodesic error estimate is not finite.")
    if (error > 1) { step = interval * Math.max(0.2, 0.8 * error ** -0.2); continue }
    active.forEach((probe, i) => {
      const candidate = trials[i].state
      if (Math.hypot(...candidate.slice(0, 3)) <= 1) {
        const event = horizonEvent(probe.state, interval)
        probe.state = event.state
        probe.captured = true
        probe.capturedAt = world.time + advanced + event.elapsed
      } else probe.state = candidate
    })
    advanced += interval
    world.steps += 1
    world.lastError = error
    step = interval * Math.min(2, Math.max(1, 0.9 * Math.max(error, 1e-12) ** -0.2))
  }
  world.time += advanced
  world.limited = duration - advanced > 1e-9
  return advanced
}
