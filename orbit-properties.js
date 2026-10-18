// Physics property registry.
// Every catalogue item is listed with a status: state (integrated), input (reference value or stated
// assumption), derived (computed from the modeled physics), or none (not modeled, with the reason).
// Values come only from the Newtonian mutual-gravity state, JPL/IAU reference data, or closed-form
// exterior-spacetime formulas that are reported but never fed back into the motion.

import {
  CATALOG,
  CONST,
  angularMomentumDrift,
  barycenter,
  dominantPartner,
  energyDrift,
  kineticEnergy,
  massDrift,
  momentumDrift,
  orbitAbout,
  potentialEnergy,
  predictRemnant,
  schwarzschildRadius,
  totalAngularMomentum,
  totalEnergy,
  totalMomentum,
} from "./orbit-physics.js"

export const REGISTRY_VERSION = "2"

export const PHYS = Object.freeze({
  HBAR: 1.054571817e-34,
  K_B: 1.380649e-23,
  SIGMA_SB: 5.670374419e-8,
  MU_0: 1.25663706212e-6,
  M_PROTON: 1.67262192369e-27,
  SIGMA_T: 6.6524587321e-29,
  L_SUN: 3.828e26,
  L_BOL_ZERO: 3.0128e28,
})

// Published reference values for unaltered presets. Reported only; none of these enter the force law.
// Sources: NASA Planetary Fact Sheets and JPL phys_par (rotation, obliquity, J2, radii, albedo, mean
// temperature, surface pressure, scale height, dipole), IAU 2015 nominal solar values, IGRF-13 (Earth
// dipole), Juno/Cassini/GRAIL/MESSENGER published k2 and moment-of-inertia factors, ATNF (Crab timing).
// rotationPeriod is sidereal in seconds, negative for retrograde. Field values are dipole moments in A m^2.
export const REFERENCE = Object.freeze({
  mercury: { rotationPeriod: 5067360, obliquity: 0.034, j2: 5.03e-5, meanTemperature: 440, bondAlbedo: 0.068, equatorialRadius: 2440.5e3, polarRadius: 2438.3e3, momentOfInertiaFactor: 0.346, dipoleMoment: 2.8e19, dipoleTilt: 0 },
  venus: { rotationPeriod: -20997360, obliquity: 177.36, j2: 4.458e-6, meanTemperature: 737, bondAlbedo: 0.76, equatorialRadius: 6051.8e3, polarRadius: 6051.8e3, surfacePressure: 9.2e6, scaleHeight: 15.9e3, k2: 0.295, dipoleMoment: 0 },
  earth: { rotationPeriod: 86164.1, obliquity: 23.44, j2: 1.08263e-3, meanTemperature: 288, bondAlbedo: 0.306, equatorialRadius: 6378.137e3, polarRadius: 6356.752e3, surfacePressure: 101325, scaleHeight: 8.5e3, momentOfInertiaFactor: 0.3307, k2: 0.3, dipoleMoment: 7.75e22, dipoleTilt: 9.4 },
  mars: { rotationPeriod: 88642.4, obliquity: 25.19, j2: 1.96045e-3, meanTemperature: 210, bondAlbedo: 0.25, equatorialRadius: 3396.2e3, polarRadius: 3376.2e3, surfacePressure: 636, scaleHeight: 11.1e3, momentOfInertiaFactor: 0.3644, k2: 0.169, dipoleMoment: 0 },
  jupiter: { rotationPeriod: 35730, obliquity: 3.13, j2: 14.736e-3, meanTemperature: 165, bondAlbedo: 0.503, equatorialRadius: 71492e3, polarRadius: 66854e3, momentOfInertiaFactor: 0.254, k2: 0.565, dipoleMoment: 1.57e27, dipoleTilt: 9.6 },
  saturn: { rotationPeriod: 38361.6, obliquity: 26.73, j2: 16.298e-3, meanTemperature: 134, bondAlbedo: 0.342, equatorialRadius: 60268e3, polarRadius: 54364e3, momentOfInertiaFactor: 0.21, k2: 0.39, dipoleMoment: 4.6e25, dipoleTilt: 0 },
  uranus: { rotationPeriod: -62064, obliquity: 97.77, j2: 3.343e-3, meanTemperature: 76, bondAlbedo: 0.3, equatorialRadius: 25559e3, polarRadius: 24973e3, dipoleMoment: 3.8e24, dipoleTilt: 58.6 },
  neptune: { rotationPeriod: 57996, obliquity: 28.32, j2: 3.411e-3, meanTemperature: 72, bondAlbedo: 0.29, equatorialRadius: 24764e3, polarRadius: 24341e3, dipoleMoment: 2.2e24, dipoleTilt: 46.9 },
  moon: { rotationPeriod: 2360592, obliquity: 6.68, j2: 2.033e-4, bondAlbedo: 0.11, equatorialRadius: 1738.1e3, polarRadius: 1736.0e3, momentOfInertiaFactor: 0.3929, k2: 0.0242, dipoleMoment: 0 },
  ceres: { rotationPeriod: 32667, obliquity: 4, bondAlbedo: 0.034, equatorialRadius: 482.1e3, polarRadius: 445.9e3, momentOfInertiaFactor: 0.37 },
  sun: { rotationPeriod: 2192832, obliquity: 7.25, j2: 2.2e-7, effectiveTemperature: 5772, luminosity: PHYS.L_SUN, momentOfInertiaFactor: 0.07 },
  redgiant: { effectiveTemperature: 3600, luminosity: 1.26e5 * PHYS.L_SUN, representative: true },
  whitedwarf: { effectiveTemperature: 25200, luminosity: 0.056 * PHYS.L_SUN, representative: true },
  pulsar: { spinPeriod: 0.0334, spinPeriodDerivative: 4.21e-13, momentOfInertia: 1e38, representative: true },
})

const C = CONST.C
const G = CONST.G
const TAU = 2 * Math.PI
const MEASURED = new Set(["ceres", "moon", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "sun", "sgra"])
const STELLAR = new Set(["star", "giantstar", "whitedwarf"])

function row(name, status, unit, scope, value, note, applies) {
  return { name, status, unit, scope, value, note, applies }
}
const state = (name, unit, scope, value, note, applies) => row(name, "state", unit, scope, value, note, applies)
const input = (name, unit, scope, value, note, applies) => row(name, "input", unit, scope, value, note, applies)
const derived = (name, unit, scope, value, note, applies) => row(name, "derived", unit, scope, value, note, applies)
const none = (names, reason, scope = "body") => names.map((name) => ({ name, status: "none", scope, reason }))

const isBH = (ctx) => ctx.body?.kind === "blackhole"
const notBH = (ctx) => ctx.body && ctx.body.kind !== "blackhole"
const hasOrbit = (ctx) => Boolean(ctx.orbit)
const elliptic = (ctx) => Boolean(ctx.orbit?.elliptic)
const unbound = (ctx) => Boolean(ctx.orbit && !ctx.orbit.bound)
const lighter = (ctx) => Boolean(ctx.orbit && ctx.body.m < ctx.orbit.primaryBody.m)
const twoPlus = (ctx) => ctx.world.bodies.length >= 2

export function lookupPreset(body) {
  return CATALOG.find((preset) => preset.kind === body.kind && Math.abs(preset.gm - body.gm) <= preset.gm * 1e-9) ?? null
}

function potentialAt(body, bodies) {
  let phi = 0
  for (const other of bodies) {
    if (other.id === body.id) continue
    const r = Math.hypot(other.x - body.x, other.y - body.y)
    if (r > 0) phi -= other.gm / r
  }
  return phi
}

function nearest(body, bodies) {
  let best = null
  let bestDistance = Infinity
  for (const other of bodies) {
    if (other.id === body.id) continue
    const r = Math.hypot(other.x - body.x, other.y - body.y)
    if (r < bestDistance) {
      bestDistance = r
      best = other
    }
  }
  return best ? { body: best, distance: bestDistance } : null
}

function jerk(body, bodies) {
  let jx = 0
  let jy = 0
  for (const other of bodies) {
    if (other.id === body.id) continue
    const dx = other.x - body.x
    const dy = other.y - body.y
    const dvx = other.vx - body.vx
    const dvy = other.vy - body.vy
    const r2 = dx * dx + dy * dy
    const r = Math.sqrt(r2)
    if (!(r > 0)) continue
    const r3 = r2 * r
    const rv = dx * dvx + dy * dvy
    jx += other.gm * (dvx / r3 - (3 * rv * dx) / (r3 * r2))
    jy += other.gm * (dvy / r3 - (3 * rv * dy) / (r3 * r2))
  }
  return Math.hypot(jx, jy)
}

// Newtonian tidal tensor at the body from every other body: sum of GM/r^3 (3 n n^T - I).
function tidalEigen(body, bodies) {
  let a = 0
  let b = 0
  let d = 0
  for (const other of bodies) {
    if (other.id === body.id) continue
    const dx = other.x - body.x
    const dy = other.y - body.y
    const r = Math.hypot(dx, dy)
    if (!(r > 0)) continue
    const k = other.gm / (r * r * r)
    const nx = dx / r
    const ny = dy / r
    a += k * (3 * nx * nx - 1)
    b += k * (3 * nx * ny)
    d += k * (3 * ny * ny - 1)
  }
  const mean = (a + d) / 2
  const half = Math.sqrt(((a - d) * (a - d)) / 4 + b * b)
  return { stretch: mean + half, squeeze: mean - half }
}

function surfaceEscape(ctx) {
  return Math.sqrt((2 * ctx.body.gm) / ctx.body.radius)
}

function hillRadius(ctx) {
  const o = ctx.orbit
  const base = o.elliptic ? o.periapsis : o.distance
  return base * Math.cbrt(ctx.body.m / (3 * o.primaryBody.m))
}

// Rigid-body Roche limit for this body about its partner: d = R (2 M / m)^(1/3).
function rocheLimit(ctx) {
  return ctx.body.radius * Math.cbrt((2 * ctx.orbit.primaryBody.m) / ctx.body.m)
}

// Eggleton 1983 Roche-lobe radius, circular-orbit approximation.
function rocheLobe(ctx) {
  const q = ctx.orbit.massRatio
  const q23 = Math.cbrt(q * q)
  return (ctx.orbit.semiMajor * 0.49 * q23) / (0.6 * q23 + Math.log(1 + Math.cbrt(q)))
}

function sibling(ctx) {
  const primary = ctx.orbit.primaryBody
  let best = null
  let gap = Infinity
  for (const other of ctx.world.bodies) {
    if (other.id === ctx.body.id || other.id === primary.id) continue
    if (dominantPartner(other, ctx.world.bodies)?.id !== primary.id) continue
    const orbit = orbitAbout(other, ctx.world.bodies)
    if (!orbit?.elliptic) continue
    const delta = Math.abs(orbit.semiMajor - ctx.orbit.semiMajor)
    if (delta < gap) {
      gap = delta
      best = { body: other, orbit }
    }
  }
  return best
}

const hasSibling = (ctx) => elliptic(ctx) && Boolean(sibling(ctx))

function synodic(ctx) {
  const other = sibling(ctx)
  const t1 = ctx.orbit.period
  const t2 = other.orbit.period
  if (Math.abs(t1 - t2) < 1e-9) return Infinity
  return 1 / Math.abs(1 / t1 - 1 / t2)
}

function periodRatio(ctx) {
  const other = sibling(ctx)
  const ratio = Math.max(ctx.orbit.period, other.orbit.period) / Math.min(ctx.orbit.period, other.orbit.period)
  return `${ratio.toFixed(3)} : 1 with ${other.body.name}`
}

// Gladman 1993: adjacent orbits are Hill stable when separated by more than 2*sqrt(3) mutual Hill radii.
function hillSeparation(ctx) {
  const other = sibling(ctx)
  const a1 = ctx.orbit.semiMajor
  const a2 = other.orbit.semiMajor
  const mutual = Math.cbrt((ctx.body.m + other.body.m) / (3 * ctx.orbit.primaryBody.m)) * ((a1 + a2) / 2)
  const separation = Math.abs(a1 - a2) / mutual
  return `${separation.toFixed(2)} mutual Hill radii from ${other.body.name}${separation > 2 * Math.sqrt(3) ? ", Hill stable" : ", may cross"}`
}

// Peters 1964 quadrupole gravitational-wave power and angular-momentum loss for the osculating pair.
function gwPower(ctx) {
  const o = ctx.orbit
  const m1 = ctx.body.m
  const m2 = o.primaryBody.m
  const e2 = o.eccentricity * o.eccentricity
  const enhancement = 1 + (73 / 24) * e2 + (37 / 96) * e2 * e2
  return ((32 / 5) * G ** 4 * m1 * m1 * m2 * m2 * (m1 + m2) * enhancement) / (C ** 5 * o.semiMajor ** 5 * (1 - e2) ** 3.5)
}

function gwAngularLoss(ctx) {
  const o = ctx.orbit
  const m1 = ctx.body.m
  const m2 = o.primaryBody.m
  const e2 = o.eccentricity * o.eccentricity
  return ((32 / 5) * G ** 3.5 * m1 * m1 * m2 * m2 * Math.sqrt(m1 + m2) * (1 + (7 / 8) * e2)) / (C ** 5 * o.semiMajor ** 3.5 * (1 - e2) ** 2)
}

function fastestFraction(world) {
  let fastest = 0
  for (const body of world.bodies) fastest = Math.max(fastest, Math.hypot(body.vx, body.vy))
  return fastest / C
}

// Reference-data access. A body keeps its reference record only while it is an unaltered preset.
export function referenceFor(body) {
  const preset = body ? lookupPreset(body) : null
  return preset ? REFERENCE[preset.id] ?? null : null
}

const NO_REF = "no published value for this body in the reference table"
const ref = (c, key) => referenceFor(c.body)?.[key]
const hasRef = (key) => (c) => (c.body && ref(c, key) !== undefined ? true : NO_REF)
const hasRefs = (...keys) => (c) => (c.body && keys.every((key) => ref(c, key) !== undefined) ? true : NO_REF)
const refNote = (c, text) => (referenceFor(c.body)?.representative ? `${text}; representative value for this preset, not a measurement` : text)

const spinPeriod = (c) => ref(c, "spinPeriod") ?? ref(c, "rotationPeriod")
const hasSpin = (c) => (c.body && spinPeriod(c) !== undefined ? true : NO_REF)
const spinRate = (c) => TAU / Math.abs(spinPeriod(c))
const equatorialRadius = (c) => ref(c, "equatorialRadius") ?? c.body.radius
const flattening = (c) => (ref(c, "equatorialRadius") - ref(c, "polarRadius")) / ref(c, "equatorialRadius")

function momentOfInertia(c) {
  const direct = ref(c, "momentOfInertia")
  if (direct !== undefined) return direct
  const factor = ref(c, "momentOfInertiaFactor")
  return factor === undefined ? undefined : factor * c.body.m * c.body.radius ** 2
}
const hasInertia = (c) => (c.body && momentOfInertia(c) !== undefined ? true : NO_REF)

// Pulsar dipole estimate for an orthogonal rotator, B = 3.2e19 sqrt(P Pdot) gauss, in tesla.
const pulsarField = (c) => 3.2e15 * Math.sqrt(ref(c, "spinPeriod") * ref(c, "spinPeriodDerivative"))
const hasTiming = hasRefs("spinPeriod", "spinPeriodDerivative")

function surfaceField(c) {
  const moment = ref(c, "dipoleMoment")
  if (moment !== undefined) return (PHYS.MU_0 * moment) / (4 * Math.PI * c.body.radius ** 3)
  if (hasTiming(c) === true) return pulsarField(c)
  return undefined
}
const hasField = (c) => (c.body && surfaceField(c) !== undefined ? true : NO_REF)

// Irradiance at the body from every luminous preset in the scene, W/m^2.
function irradiance(c) {
  let total = 0
  for (const other of c.world.bodies) {
    if (other.id === c.body.id) continue
    const luminosity = referenceFor(other)?.luminosity
    if (!luminosity) continue
    const r = Math.hypot(other.x - c.body.x, other.y - c.body.y)
    if (r > 0) total += luminosity / (4 * Math.PI * r * r)
  }
  return total
}
const irradiated = (c) => (c.body && irradiance(c) > 0 ? true : "no luminous star with a published luminosity in the scene")

function equilibriumTemperature(c) {
  const albedo = ref(c, "bondAlbedo") ?? 0
  return Math.pow((irradiance(c) * (1 - albedo)) / (4 * PHYS.SIGMA_SB), 0.25)
}
const albedoNote = (c) => (ref(c, "bondAlbedo") === undefined ? "fast rotator, Bond albedo assumed 0 (none published here)" : "fast rotator with the published Bond albedo")

function luminousStar(c) {
  return STELLAR.has(c.body?.kind) ? ref(c, "luminosity") : undefined
}
const hasLuminosity = (c) => (c.body && ref(c, "luminosity") !== undefined ? true : NO_REF)

// Half-mass radius about the barycenter and the rms speed in the barycentric frame.
function clusterStats(bodies) {
  const center = barycenter(bodies)
  const ranked = bodies
    .map((body) => ({ m: body.m, r: Math.hypot(body.x - center.x, body.y - center.y), v2: (body.vx - center.vx) ** 2 + (body.vy - center.vy) ** 2 }))
    .sort((a, b) => a.r - b.r)
  let enclosed = 0
  let halfMass = 0
  for (const entry of ranked) {
    enclosed += entry.m
    if (enclosed >= center.mass / 2) {
      halfMass = entry.r
      break
    }
  }
  let sum = 0
  for (const entry of ranked) sum += entry.m * entry.v2
  return { mass: center.mass, count: bodies.length, halfMass, dispersion: Math.sqrt(sum / center.mass) }
}
const cluster = (c) => {
  if (c.world.bodies.length < 3) return "needs at least three bodies"
  const total = barycenter(c.world.bodies).mass
  return c.world.bodies.some((body) => body.m > 0.5 * total) ? "one body holds most of the mass; cluster statistics do not describe a planetary system" : true
}

// Energy of the body relative to the whole scene in the barycentric frame; positive means it leaves.
function systemEnergy(c) {
  const center = barycenter(c.world.bodies)
  const v2 = (c.body.vx - center.vx) ** 2 + (c.body.vy - center.vy) ** 2
  return 0.5 * v2 + potentialAt(c.body, c.world.bodies)
}

// Two-body contact kinematics with the nearest body: speed and angle if the pair fell to contact.
function contact(c) {
  const near = nearest(c.body, c.world.bodies)
  if (!near) return null
  const other = near.body
  const dx = other.x - c.body.x
  const dy = other.y - c.body.y
  const dvx = other.vx - c.body.vx
  const dvy = other.vy - c.body.vy
  const r = near.distance
  const relative = Math.hypot(dvx, dvy)
  const sum = c.body.radius + other.radius
  const mu = c.body.gm + other.gm
  const speed2 = relative * relative + 2 * mu * (1 / sum - 1 / r)
  const speed = speed2 > 0 ? Math.sqrt(speed2) : 0
  const impactParameter = relative > 0 ? Math.abs(dx * dvy - dy * dvx) / relative : 0
  const sine = speed > 0 ? (impactParameter * relative) / (sum * speed) : 0
  const reduced = (c.body.m * other.m) / (c.body.m + other.m)
  return { other, r, relative, dvx, dvy, speed, impactParameter, sine, reduced, remnant: predictRemnant(c.body, other) }
}

// Peters 1964 orbit-averaged decay of the semi-major axis for the osculating pair.
function gwDecay(ctx) {
  const o = ctx.orbit
  const m1 = ctx.body.m
  const m2 = o.primaryBody.m
  const e2 = o.eccentricity * o.eccentricity
  const enhancement = 1 + (73 / 24) * e2 + (37 / 96) * e2 * e2
  return (-(64 / 5) * G ** 3 * m1 * m2 * (m1 + m2) * enhancement) / (C ** 5 * o.semiMajor ** 3 * (1 - e2) ** 3.5)
}

function gwMergerTime(ctx) {
  const o = ctx.orbit
  const m1 = ctx.body.m
  const m2 = o.primaryBody.m
  const e2 = o.eccentricity * o.eccentricity
  return ((5 * C ** 5 * o.semiMajor ** 4) / (256 * G ** 3 * m1 * m2 * (m1 + m2))) * (1 - e2) ** 3.5
}

function chirpMass(ctx) {
  const m1 = ctx.body.m
  const m2 = ctx.orbit.primaryBody.m
  return Math.pow(m1 * m2, 0.6) / Math.pow(m1 + m2, 0.2)
}

const pairIsBH = (c) => (c.orbit && c.body.kind === "blackhole" && c.orbit.primaryBody.kind === "blackhole" ? true : "needs two black holes")
const remnantIsBH = (c) => (c.orbit && predictRemnant(c.body, c.orbit.primaryBody).kind === "blackhole" ? true : "the merger remnant would not be a black hole")
const rocky = (c) => (c.body && ["planet", "moon", "asteroid"].includes(c.body.kind) ? true : "rocky planets and moons only")
const giant = (c) => (c.body?.kind === "giant" ? true : "gas and ice giants only")
const small = (c) => (c.body && ["comet", "asteroid"].includes(c.body.kind) ? true : "small bodies only")
const stellar = (c) => (STELLAR.has(c.body?.kind) ? true : "stars only")
const whiteDwarf = (c) => (c.body?.kind === "whitedwarf" ? true : "white dwarfs only")
const neutron = (c) => (c.body && ["pulsar", "neutron"].includes(c.body.kind) ? true : "neutron stars only")
const bhOnly = (c) => (isBH(c) ? true : "black holes only")
const both = (...tests) => (c) => {
  for (const test of tests) {
    const result = test(c)
    if (result !== true) return result === false ? "not applicable here" : result
  }
  return true
}

function satellites(c) {
  return c.world.bodies.filter((other) => other.id !== c.body.id && dominantPartner(other, c.world.bodies)?.id === c.body.id)
}

function spinOrbit(c) {
  const ratio = c.orbit.period / Math.abs(spinPeriod(c))
  const near = Math.abs(ratio - Math.round(ratio * 2) / 2) < 0.01
  const label = near ? `${(Math.round(ratio * 2) / 2).toFixed(1)} : 1${Math.round(ratio * 2) / 2 === 1 ? ", synchronous" : ""}` : "no simple ratio"
  return `${ratio.toFixed(3)} orbital periods per rotation (${label})`
}

const PLANAR = "planar engine: the simulation has no third axis, so this is undefined rather than zero"
const POINT = "bodies are indivisible point masses with a contact radius; no interior structure"
const NO_ROTATION = "no integrated rotation state; published rotation periods and obliquities appear as reference inputs only"
const NO_GR = "Newtonian dynamics; relativity is not in the equations of motion"
const NO_SKY = "no observer or sky frame; the scene is an abstract inertial plane"
const NO_EVOLUTION = "no stellar evolution or composition model"
const NO_HISTORY = "per-body history is not stored across steps"
const NO_DISSIPATION = "no dissipative forces; orbits change only through mutual gravity and mergers"
const NO_THERMO = "no thermodynamic state; bodies carry mass, radius, position, and velocity only"
const NO_COMPOSITION = "no composition or nuclear model"
const NO_MATERIAL = "no material model; contact is a perfectly inelastic merger of rigid spheres"
const NO_EM = "no electromagnetic model; bodies are neutral and fields are not computed"
const NO_PLASMA = "no plasma or charged-particle model"
const NO_RADIATION = "no radiative transfer; only published luminosities and the irradiance they imply are reported"
const NO_FLUID = "no fluid, gas, or atmosphere model"
const NO_ACCRETION = "no accretion, wind, disk, or jet model"
const NO_INTERNAL = "no interior structure or oscillation model"
const NO_STRUCTURE = "no one-dimensional stellar structure model"
const NO_DISTRIBUTED = "no distributed matter; the scene is a handful of point masses"
const NO_COSMO = "no cosmological framework; the scene is local Newtonian space"
const NO_PARTICLES = "no particle, neutrino, or nuclear-matter model"
const NO_ENV = "no environment model; the scene is an isolated system in a vacuum"
const NO_EVENT = "not an event this engine detects; only contact mergers are events here"
const NO_EMISSION = "no emission or timing model beyond the dipole spin-down formulas"
const NO_MAGNETAR = "no magnetar preset; field decay and bursts need a magnetothermal model"

export const CATALOGUE = [
  {
    id: "1.1",
    title: "Identity, classification, and metadata",
    items: [
      state("Object identifier", "text", "body", (c) => `#${c.body.id}`),
      state("Object name", "text", "body", (c) => c.body.name),
      ...none(["Alternate names and catalog identifiers"], "presets carry a single name"),
      input("Object class", "text", "body", (c) => c.body.kind, "selects the remnant rule on merger; it never changes the force law"),
      ...none(["Subclass"], "one class per body"),
      derived("Physical model type", "text", "body", () => "point mass, Newtonian mutual gravity, inelastic merger"),
      input("Composite-system identifier", "text", "sim", (c) => c.sim.scene ?? "custom"),
      derived("Parent-object identifier", "text", "body", (c) => (c.orbit ? `${c.orbit.primary} (strongest pull)` : "none"), undefined, twoPlus),
      derived("Membership in a binary, multiple system, cluster, or galaxy", "text", "body", (c) => {
        if (!c.orbit) return "isolated"
        return `${c.orbit.bound ? "bound to" : "unbound from"} ${c.orbit.primary} in a ${c.world.bodies.length}-body system`
      }, undefined, twoPlus),
      ...none(["Formation scenario", "Evolutionary stage"], NO_EVOLUTION),
      derived("Physical-model version", "text", "sim", () => `registry ${REGISTRY_VERSION}`),
      input("Data provenance", "text", "body", (c) => lookupPreset(c.body)?.detail ?? "merged or edited body; values follow from conservation laws"),
      input("Measurement source", "text", "sim", () => "JPL/NASA planetary GM and radii, IAU nominal solar values, CODATA 2018 G"),
      derived("Simulation source", "text", "sim", () => "integrated here, velocity Verlet with a free-fall step law"),
      ...none(["Observation epoch"], "mean elements, no observation epoch", "sim"),
      input("Reference epoch", "text", "sim", () => "t = 0 at scene start; planet orbits use J2000 mean elements"),
      ...none(["Discovery date", "Classification confidence", "Measurement confidence"], "uncertainties and discovery metadata are not carried"),
      derived("Model applicability", "text", "body", (c) => {
        const beta = Math.hypot(c.body.vx, c.body.vy) / C
        return beta < 0.05 ? `Newtonian regime, v/c = ${beta.toExponential(2)}` : `v/c = ${beta.toFixed(3)}, relativistic corrections would matter`
      }),
      input("Known versus hypothetical status", "text", "body", (c) => {
        const preset = lookupPreset(c.body)
        if (!preset) return "derived body"
        return MEASURED.has(preset.id) ? "measured object" : "representative object"
      }),
    ],
  },
  {
    id: "1.2",
    title: "Mass and matter",
    items: [
      derived("Rest mass", "kg", "body", (c) => c.body.m, "GM / G with CODATA 2018 G"),
      derived("Inertial mass", "kg", "body", (c) => c.body.m, "equal to gravitational mass; Newtonian equivalence"),
      state("Gravitational mass", "m^3/s^2", "body", (c) => c.body.gm, "GM is the integrated quantity, taken straight from JPL"),
      ...none(["Baryonic mass"], "no composition model"),
      derived("Total mass-energy", "J", "body", (c) => c.body.m * C * C, "m c^2"),
      ...none(["Bound mass", "Unbound mass", "Core mass", "Envelope mass", "Atmospheric mass", "Ejecta mass"], POINT),
      ...none(["Accreted mass"], NO_HISTORY),
      ...none(["Mass-loss rate", "Accretion rate", "Mass-transfer rate"], "mass changes only by whole-body merger"),
      input("Mass distribution", "text", "body", () => "point mass for forces; uniform sphere for radius-based quantities"),
      ...none(["Enclosed mass as a function of radius", "Local mass density"], POINT),
      derived("Mean density", "kg/m^3", "body", (c) => c.body.m / ((4 / 3) * Math.PI * c.body.radius ** 3), "mass over sphere volume", notBH),
      ...none([
        "Central density", "Surface density", "Column density", "Number density", "Particle number", "Baryon number",
        "Electron fraction", "Mean molecular weight", "Chemical abundance fractions", "Isotopic abundances",
        "Elemental abundances", "Metallicity", "Dust-to-gas ratio", "Matter-antimatter content, where relevant",
        "Dark-matter density and distribution, where modeled",
      ], "no composition or interior model"),
    ],
  },
  {
    id: "1.3",
    title: "Size, shape, and spatial structure",
    items: [
      state("Mean radius", "m", "body", (c) => c.body.radius, "contact radius used for collisions; black holes use the Schwarzschild radius"),
      input("Equatorial radius", "m", "body", (c) => ref(c, "equatorialRadius"), "published value; the engine itself uses one spherical contact radius", hasRef("equatorialRadius")),
      input("Polar radius", "m", "body", (c) => ref(c, "polarRadius"), "published value; reported only", hasRef("polarRadius")),
      ...none(["Effective radius", "Core radius"], POINT),
      derived("Surface radius", "m", "body", (c) => c.body.radius, undefined, notBH),
      derived("Photospheric radius", "m", "body", (c) => c.body.radius, "stellar presets use the photospheric radius", (c) => STELLAR.has(c.body?.kind)),
      ...none(["Atmospheric radius"], "no atmosphere model"),
      derived("Roche-lobe radius", "m", "body", rocheLobe, "Eggleton 1983, circular-orbit approximation", elliptic),
      derived("Hill radius", "m", "body", hillRadius, "periapsis x (m / 3M)^(1/3)", lighter),
      derived("Schwarzschild radius, where applicable", "m", "body", (c) => schwarzschildRadius(c.body.gm), "2GM / c^2 for any mass"),
      derived("Gravitational radius", "m", "body", (c) => c.body.gm / (C * C), "GM / c^2"),
      derived("Event-horizon radius, for a specified black-hole solution", "m", "body", (c) => c.body.radius, "Schwarzschild, non-rotating", isBH),
      derived("Innermost stable circular orbit radius, for a specified spacetime and orbit", "m", "body", (c) => 3 * c.body.radius, "3 Rs, Schwarzschild", isBH),
      derived("Photon-sphere radius, where applicable", "m", "body", (c) => 1.5 * c.body.radius, "1.5 Rs, Schwarzschild", isBH),
      derived("Physical diameter", "m", "body", (c) => 2 * c.body.radius),
      derived("Projected diameter", "m", "body", (c) => 2 * c.body.radius, "sphere: same as the physical diameter"),
      derived("Volume", "m^3", "body", (c) => (4 / 3) * Math.PI * c.body.radius ** 3, undefined, notBH),
      derived("Surface area", "m^2", "body", (c) => 4 * Math.PI * c.body.radius ** 2, undefined, notBH),
      derived("Cross-sectional area", "m^2", "body", (c) => Math.PI * c.body.radius ** 2),
      derived("Projected area", "m^2", "body", (c) => Math.PI * c.body.radius ** 2),
      derived("Aspect ratio", "ratio", "body", (c) => ref(c, "equatorialRadius") / ref(c, "polarRadius"), "equatorial over polar radius from the published values; the engine treats the body as a sphere", hasRefs("equatorialRadius", "polarRadius")),
      derived("Flattening", "ratio", "body", flattening, "(a - c) / a from the published radii; reported only", hasRefs("equatorialRadius", "polarRadius")),
      derived("Oblateness", "ratio", "body", flattening, "same as flattening", hasRefs("equatorialRadius", "polarRadius")),
      ...none(["Triaxiality"], "only equatorial and polar radii are carried; no triaxial shapes"),
      derived("Ellipticity", "ratio", "body", flattening, "meridional ellipticity from the published radii", hasRefs("equatorialRadius", "polarRadius")),
      ...none([
        "Shape harmonics", "Topography", "Surface roughness", "Internal layering", "Core-envelope boundary",
        "Radial density profile", "Radial temperature profile", "Radial pressure profile", "Shape as a function of time",
        "Surface deformation", "Gravitationally induced deformation",
      ], POINT),
    ],
  },
  {
    id: "1.4",
    title: "Position, orientation, and motion",
    items: [
      state("x, y, z position", "vec m", "body", (c) => ({ x: c.body.x, y: c.body.y }), "z is fixed at 0; the engine is planar"),
      state("Cartesian position vector", "vec m", "body", (c) => ({ x: c.body.x, y: c.body.y })),
      derived("Radial distance", "m", "body", (c) => c.orbit.distance, "to the strongest partner", hasOrbit),
      derived("Distance to each other body", "text", "body", (c) => {
        const near = nearest(c.body, c.world.bodies)
        return near ? { length: near.distance, label: `nearest: ${near.body.name}` } : "no other body"
      }, undefined, twoPlus),
      derived("Distance to the system barycenter", "m", "body", (c) => {
        const center = barycenter(c.world.bodies)
        return Math.hypot(c.body.x - center.x, c.body.y - center.y)
      }),
      ...none(["Right ascension", "Declination", "Ecliptic longitude and latitude", "Galactic longitude and latitude", "Altitude above a reference surface"], NO_SKY),
      ...none(["Position in a body-fixed frame"], NO_ROTATION),
      state("Position in an inertial frame", "vec m", "body", (c) => ({ x: c.body.x, y: c.body.y })),
      ...none(["Position in a rotating frame"], "no rotating frame is defined"),
      input("Coordinate-system definition", "text", "sim", () => "inertial Cartesian plane, SI meters, y up; barycenter of the scene at the origin when it starts"),
      input("Reference-frame origin", "text", "sim", () => "scene barycenter at t = 0"),
      input("Reference epoch", "text", "sim", () => "t = 0 at scene start"),
      state("v_x, v_y, v_z", "vec m/s", "body", (c) => ({ x: c.body.vx, y: c.body.vy }), "v_z is 0; planar"),
      state("Velocity vector", "vec m/s", "body", (c) => ({ x: c.body.vx, y: c.body.vy })),
      derived("Speed", "m/s", "body", (c) => Math.hypot(c.body.vx, c.body.vy)),
      derived("Radial velocity", "m/s", "body", (c) => c.orbit.radialSpeed, "relative to the strongest partner; positive is outward", hasOrbit),
      derived("Tangential velocity", "m/s", "body", (c) => c.orbit.tangentialSpeed, "relative to the strongest partner; sign is the sense of revolution", hasOrbit),
      derived("Relative velocity", "m/s", "body", (c) => c.orbit.speed, "relative to the strongest partner", hasOrbit),
      derived("Escape speed", "m/s", "body", (c) => c.orbit.escapeSpeed, "sqrt(2 mu / r) from the partner at the current distance", hasOrbit),
      derived("Circular-orbit speed", "m/s", "body", (c) => c.orbit.circularSpeed, "sqrt(mu / r) at the current distance", hasOrbit),
      ...none(["Peculiar velocity", "Proper motion", "Line-of-sight velocity"], NO_SKY),
      state("Acceleration vector", "vec m/s^2", "body", (c) => ({ x: c.body.ax, y: c.body.ay })),
      derived("Radial acceleration", "m/s^2", "body", (c) => {
        const p = c.orbit.primaryBody
        const dx = c.body.x - p.x
        const dy = c.body.y - p.y
        return (c.body.ax * dx + c.body.ay * dy) / c.orbit.distance
      }, "component along the line to the partner; negative is inward", hasOrbit),
      derived("Tangential acceleration", "m/s^2", "body", (c) => {
        const p = c.orbit.primaryBody
        const dx = c.body.x - p.x
        const dy = c.body.y - p.y
        return (dx * c.body.ay - dy * c.body.ax) / c.orbit.distance
      }, "from the other bodies; zero for a pure two-body orbit", hasOrbit),
      derived("Jerk, or time derivative of acceleration", "m/s^3", "body", (c) => jerk(c.body, c.world.bodies), "analytic d(a)/dt from all bodies", twoPlus),
      ...none(["Snap, or second time derivative of acceleration"], "not computed"),
      ...none(["Orientation quaternion", "Rotation matrix", "Euler angles", "Spin axis", "Spin-axis direction"], NO_ROTATION),
      input("Spin-axis inclination", "rad", "body", (c) => (ref(c, "obliquity") * Math.PI) / 180, "published obliquity to the orbit; reported only", hasRef("obliquity")),
      derived("Angular velocity", "rad/s", "body", spinRate, "2 pi over the published rotation period", hasSpin),
      ...none(["Angular acceleration"], NO_ROTATION),
      input("Rotation period", "s", "body", (c) => Math.abs(spinPeriod(c)), (c) => `sidereal${spinPeriod(c) < 0 ? ", retrograde" : ""}; reported only`, hasSpin),
      input("Sidereal rotation period", "s", "body", (c) => Math.abs(spinPeriod(c)), "published value; reported only", hasSpin),
      ...none(["Solar rotation period"], "a solar day needs the body's rotation to be integrated against its orbit"),
      ...none(["Differential rotation profile", "Precession rate", "Nutation", "Libration"], NO_ROTATION),
      derived("Tidal locking state", "text", "body", (c) => {
        const ratio = c.orbit.period / Math.abs(spinPeriod(c))
        return Math.abs(ratio - 1) < 0.01 ? "synchronous: rotation matches the orbit" : `not locked: ${ratio.toFixed(3)} rotations per orbit`
      }, "published rotation compared with the osculating period", both(elliptic, hasSpin)),
      ...none(["Spin-orbit alignment", "Rotational phase"], NO_ROTATION),
    ],
  },
  {
    id: "1.5",
    title: "Time and orbital dynamics",
    items: [
      state("Simulation time", "s", "sim", (c) => c.world.time),
      ...none(["Physical epoch"], "no calendar epoch is attached", "sim"),
      derived("Coordinate time", "s", "sim", (c) => c.world.time, "Newtonian absolute time equals simulation time"),
      ...none(["Proper time, when relevant"], NO_GR),
      ...none(["Time since formation", "Age estimate"], NO_EVOLUTION),
      derived("Orbital period", "s", "body", (c) => c.orbit.period, "osculating two-body period about the strongest partner", elliptic),
      input("Rotation period", "s", "body", (c) => Math.abs(spinPeriod(c)), "published sidereal value; reported only", hasSpin),
      derived("Synodic period", "s", "body", synodic, "with the neighbor orbit nearest in semi-major axis", hasSibling),
      derived("Anomalistic period", "s", "body", (c) => c.orbit.period, "equals the sidereal period in the osculating two-body solution", elliptic),
      ...none(["Draconic period"], PLANAR),
      derived("Sidereal period", "s", "body", (c) => c.orbit.period, undefined, elliptic),
      derived("Mean motion", "rad/s", "body", (c) => c.orbit.meanMotion, undefined, elliptic),
      derived("Orbital frequency", "1/s", "body", (c) => 1 / c.orbit.period, undefined, elliptic),
      derived("Orbital phase", "ratio", "body", (c) => c.orbit.meanAnomaly / TAU, "mean anomaly over 2 pi", elliptic),
      derived("Mean anomaly", "rad", "body", (c) => c.orbit.meanAnomaly, undefined, elliptic),
      derived("True anomaly", "rad", "body", (c) => c.orbit.trueAnomaly, "angle from periapsis in the direction of motion", hasOrbit),
      derived("Eccentric anomaly", "rad", "body", (c) => c.orbit.eccentricAnomaly, undefined, elliptic),
      derived("Semimajor axis", "m", "body", (c) => c.orbit.semiMajor, undefined, elliptic),
      derived("Semiminor axis", "m", "body", (c) => c.orbit.semiMinor, undefined, elliptic),
      derived("Eccentricity", "ratio", "body", (c) => c.orbit.eccentricity, "from the eccentricity vector; above 1 is hyperbolic", hasOrbit),
      ...none(["Inclination", "Longitude of ascending node"], PLANAR),
      derived("Argument of periapsis", "rad", "body", (c) => c.orbit.argPeriapsis, "measured from the +x axis of the simulation plane", hasOrbit),
      derived("Longitude of periapsis", "rad", "body", (c) => c.orbit.argPeriapsis, "same as the argument in a planar frame with the node at 0", hasOrbit),
      derived("Periapsis distance", "m", "body", (c) => c.orbit.periapsis, undefined, hasOrbit),
      derived("Apoapsis distance", "m", "body", (c) => c.orbit.apoapsis, undefined, elliptic),
      derived("Pericenter and apocenter times", "text", "body", (c) => {
        const toPeri = c.orbit.timeToPeriapsis
        const toApo = (toPeri + c.orbit.period / 2) % c.orbit.period
        return { times: [toPeri, toApo], label: "next periapsis, next apoapsis" }
      }, "from the osculating orbit; perturbations shift these", elliptic),
      derived("Orbital angular momentum", "kg m^2/s", "body", (c) => c.orbit.orbitalAngularMomentum, "reduced mass x specific angular momentum", hasOrbit),
      derived("Specific orbital energy", "J/kg", "body", (c) => c.orbit.specificEnergy, "v^2/2 - mu/r; negative is bound", hasOrbit),
      input("Orbital plane", "text", "sim", () => "the simulation plane, z = 0"),
      input("Mutual inclination", "rad", "body", () => 0, "all orbits share one plane"),
      derived("Resonance ratios", "text", "body", periodRatio, "period ratio with the nearest neighbor orbit", hasSibling),
      ...none(["Resonant angles"], "resonant arguments are not tracked"),
      ...none(["Orbital precession", "Apsidal precession", "Nodal precession"], "element history across orbits is not tracked yet"),
      ...none(["Orbital migration rate", "Orbital decay rate", "Orbital expansion rate"], NO_DISSIPATION),
      derived("Capture state", "text", "body", (c) => (c.orbit.bound ? `captured by ${c.orbit.primary}` : "not captured"), undefined, hasOrbit),
      derived("Escape state", "text", "body", (c) => (c.orbit.bound ? "below escape speed" : `escaping ${c.orbit.primary}`), undefined, hasOrbit),
      derived("Bound or unbound state", "text", "body", (c) => (c.orbit.bound ? "bound" : "unbound"), undefined, hasOrbit),
      ...none(["Stability indicators", "Lyapunov exponents, where calculated", "Chaotic diffusion indicators"], "no long-run stability analysis"),
      derived("Close-approach distance", "m", "body", (c) => c.orbit.periapsis, "periapsis of the osculating orbit about the partner", hasOrbit),
      derived("Closest-approach time", "s", "body", (c) => c.orbit.timeToPeriapsis, "time to the next periapsis", elliptic),
      derived("Impact parameter", "m", "body", (c) => c.orbit.impactParameter, "h / v_infinity for the hyperbolic pass", unbound),
      ...none(["Collision probability, where estimated"], "collisions are detected, not forecast statistically"),
      ...none(["Transit and occultation geometry"], NO_SKY),
    ],
  },
  {
    id: "2.1",
    title: "Gravitational sources and interactions",
    items: [
      input("Gravitational constant G", "m^3/(kg s^2)", "sim", () => G, "CODATA 2018"),
      derived("Source mass", "kg", "body", (c) => c.body.m),
      input("Mass distribution", "text", "body", () => "point mass"),
      derived("Pairwise gravitational force", "N", "body", (c) => (G * c.body.m * c.orbit.primaryBody.m) / c.orbit.distance ** 2, "with the strongest partner", hasOrbit),
      derived("Total gravitational force", "N", "body", (c) => c.body.m * Math.hypot(c.body.ax, c.body.ay), "m |a| from all bodies"),
      state("Gravitational acceleration", "m/s^2", "body", (c) => Math.hypot(c.body.ax, c.body.ay), "sum over all other bodies of GM r / r^3"),
      derived("Mutual acceleration", "m/s^2", "body", (c) => c.orbit.mu / c.orbit.distance ** 2, "relative acceleration of the pair, mu / r^2", hasOrbit),
      state("Net acceleration", "m/s^2", "body", (c) => Math.hypot(c.body.ax, c.body.ay)),
      derived("Gravitational potential", "J/kg", "body", (c) => potentialAt(c.body, c.world.bodies), "-sum GM_j / r_j at the body", twoPlus),
      derived("Specific gravitational potential", "J/kg", "body", (c) => potentialAt(c.body, c.world.bodies), undefined, twoPlus),
      derived("Gravitational potential energy", "J", "body", (c) => c.body.m * potentialAt(c.body, c.world.bodies), "m Phi; the system total counts each pair once", twoPlus),
      derived("Gravitational binding energy", "J", "body", (c) => (3 * G * c.body.m * c.body.m) / (5 * c.body.radius), "3GM^2 / 5R, uniform sphere", notBH),
      ...none(["Enclosed mass"], POINT),
      state("Gravitational field vector", "vec m/s^2", "body", (c) => ({ x: c.body.ax, y: c.body.ay })),
      state("Field strength", "m/s^2", "body", (c) => Math.hypot(c.body.ax, c.body.ay)),
      derived("Field gradient", "1/s^2", "body", (c) => tidalEigen(c.body, c.world.bodies).stretch, "largest eigenvalue of the tidal tensor", twoPlus),
      derived("Gravitational tidal tensor", "text", "body", (c) => {
        const eig = tidalEigen(c.body, c.world.bodies)
        return `stretch ${eig.stretch.toExponential(3)} 1/s^2, squeeze ${eig.squeeze.toExponential(3)} 1/s^2`
      }, "eigenvalues of sum GM/r^3 (3nn - I)", twoPlus),
      derived("Tidal acceleration", "m/s^2", "body", (c) => (2 * c.orbit.primaryBody.gm * c.body.radius) / c.orbit.distance ** 3, "2GMR / r^3 across the body from its partner", hasOrbit),
      ...none(["Tidal torque", "Tidal dissipation", "Tidal heating rate", "Tidal deformation"], "rigid point masses; no tidal response"),
      derived("Tidal disruption threshold", "text", "body", (c) => {
        const limit = rocheLimit(c)
        return { length: limit, label: c.orbit.distance < limit ? "inside the rigid Roche limit (no breakup modeled)" : "outside the rigid Roche limit" }
      }, "d = R (2M/m)^(1/3); a crossing is reported, not acted on", (c) => hasOrbit(c) && notBH(c)),
      input("Tidal Love numbers", "ratio", "body", (c) => ref(c, "k2"), "published k2; no tidal response is computed from it", hasRef("k2")),
      ...none(["Gravitational multipole moments", "Higher-order multipole moments", "Higher zonal and tesseral gravity coefficients"], "point masses; only J2 is carried, and only as a reference value"),
      derived("Quadrupole moment", "kg m^2", "body", (c) => ref(c, "j2") * c.body.m * equatorialRadius(c) ** 2, "J2 M a^2 from the published J2; not in the force", hasRef("j2")),
      input("Oblateness coefficient J_2", "ratio", "body", (c) => ref(c, "j2"), "published value; the force law stays point-mass", hasRef("j2")),
      ...none(["Frame-dragging effects", "Gravitomagnetic field, in applicable approximations", "Post-Newtonian corrections", "Relativistic precession"], NO_GR),
      derived("Gravitational time dilation", "ratio", "body", (c) => Math.sqrt(1 - schwarzschildRadius(c.body.gm) / c.body.radius), "surface clock rate relative to infinity, Schwarzschild exterior; reported only", notBH),
      derived("Gravitational redshift", "ratio", "body", (c) => 1 / Math.sqrt(1 - schwarzschildRadius(c.body.gm) / c.body.radius) - 1, "z from the surface to infinity, Schwarzschild exterior; reported only", notBH),
      ...none(["Shapiro time delay", "Gravitational lensing"], "no light paths are traced"),
      derived("Light deflection", "rad", "body", (c) => (4 * c.body.gm) / (C * C * c.body.radius), "4GM / c^2 R for a grazing ray; reported only", notBH),
      ...none(["Geodesic motion", "Spacetime curvature", "Metric tensor", "Stress-energy tensor"], NO_GR),
      derived("Gravitational-wave emission", "W", "body", gwPower, "Peters 1964 quadrupole power for the pair; not applied to the motion", elliptic),
      derived("Gravitational-wave energy flux", "W", "body", gwPower, "same Peters estimate", elliptic),
      derived("Gravitational-wave angular-momentum flux", "kg m^2/s^2", "body", gwAngularLoss, "Peters 1964; not applied to the motion", elliptic),
    ],
  },
  {
    id: "2.2",
    title: "Gravitational diagnostics and system properties",
    items: [
      derived("Total kinetic energy", "J", "system", (c) => kineticEnergy(c.world.bodies)),
      derived("Total potential energy", "J", "system", (c) => potentialEnergy(c.world.bodies), "each pair counted once"),
      derived("Total mechanical energy", "J", "system", (c) => totalEnergy(c.world.bodies)),
      derived("Total angular momentum", "kg m^2/s", "system", (c) => totalAngularMomentum(c.world.bodies), "about the barycenter; the only component in a plane"),
      derived("Total linear momentum", "vec kg m/s", "system", (c) => totalMomentum(c.world.bodies)),
      derived("Center-of-mass position", "vec m", "system", (c) => {
        const b = barycenter(c.world.bodies)
        return { x: b.x, y: b.y }
      }),
      derived("Center-of-mass velocity", "vec m/s", "system", (c) => {
        const b = barycenter(c.world.bodies)
        return { x: b.vx, y: b.vy }
      }),
      derived("Reduced mass", "kg", "body", (c) => c.orbit.reducedMass, "with the strongest partner", hasOrbit),
      derived("Mutual orbital energy", "J", "body", (c) => c.orbit.orbitalEnergy, "reduced mass x specific energy", hasOrbit),
      derived("Binding-energy fraction", "ratio", "system", (c) => {
        const u = potentialEnergy(c.world.bodies)
        return u === 0 ? null : -totalEnergy(c.world.bodies) / Math.abs(u)
      }, "-E / |U|; 1 at rest, 0.5 virialized, below 0 unbound", twoPlus),
      derived("Virial ratio", "ratio", "system", (c) => {
        const u = potentialEnergy(c.world.bodies)
        return u === 0 ? null : (2 * kineticEnergy(c.world.bodies)) / Math.abs(u)
      }, "2K / |U|, instantaneous", twoPlus),
      derived("Virial equilibrium state", "text", "system", (c) => {
        const u = potentialEnergy(c.world.bodies)
        if (u === 0) return "undefined"
        const ratio = (2 * kineticEnergy(c.world.bodies)) / Math.abs(u)
        if (ratio > 0.9 && ratio < 1.1) return "near virial balance at this instant"
        return ratio >= 1.1 ? "kinetic-dominated at this instant" : "potential-dominated at this instant"
      }, "the virial theorem holds on time average, so read this as a snapshot", twoPlus),
      derived("Escape energy", "J", "body", (c) => -c.body.m * potentialAt(c.body, c.world.bodies), "energy to carry the body to rest at infinity", twoPlus),
      ...none(["Jacobi constant in applicable restricted problems"], "no circular restricted three-body frame is set up", "system"),
      derived("Hill stability indicators", "text", "body", hillSeparation, "Gladman 1993 spacing in mutual Hill radii", hasSibling),
      derived("Roche limit", "m", "body", rocheLimit, "rigid-body limit about the strongest partner", (c) => hasOrbit(c) && notBH(c)),
      derived("Roche-lobe overflow condition", "text", "body", (c) => {
        const lobe = rocheLobe(c)
        const fill = c.body.radius / lobe
        return `filling factor ${fill.toExponential(2)}${fill >= 1 ? ", overflowing (no mass transfer modeled)" : ""}`
      }, "radius over Eggleton lobe", (c) => elliptic(c) && notBH(c)),
      derived("Hill sphere", "m", "body", hillRadius, undefined, lighter),
      derived("Lagrange-point locations", "text", "body", (c) => {
        const h = hillRadius(c)
        return `L1 and L2 about ${(h / c.orbit.semiMajor).toExponential(2)} a from ${c.body.name}, L3 opposite the partner, L4 and L5 at 60 degrees`
      }, "small-mass approximation along the current separation", (c) => elliptic(c) && lighter(c)),
      derived("Orbital resonances", "text", "body", periodRatio, undefined, hasSibling),
      ...none(["Energy transfer between orbital, rotational, thermal, and radiative components"], "only orbital energy exists in this model", "system"),
      derived("Numerical energy drift", "ratio", "system", (c) => energyDrift(c.world), "relative to the last spawn, throw, or merger"),
      derived("Numerical momentum drift", "ratio", "system", (c) => momentumDrift(c.world), "|dp| over sum m|v|"),
      derived("Numerical angular-momentum drift", "ratio", "system", (c) => angularMomentumDrift(c.world), "dL over sum m r v about the barycenter"),
    ],
  },
  {
    id: "2.3",
    title: "General-relativistic black-hole properties",
    items: [
      derived("Mass", "kg", "body", (c) => c.body.m, undefined, isBH),
      ...none(["Spin angular momentum", "Spin-axis direction"], "Schwarzschild only; spin is not modeled"),
      input("Dimensionless spin parameter", "ratio", "body", () => 0, "non-rotating assumption", isBH),
      input("Electric charge, if a charged solution is explicitly modeled", "C", "body", () => 0, "uncharged", isBH),
      derived("Gravitational radius", "m", "body", (c) => c.body.gm / (C * C), undefined, isBH),
      derived("Event-horizon geometry", "text", "body", (c) => `sphere of radius ${c.body.radius.toExponential(3)} m`, "Schwarzschild", isBH),
      derived("Horizon area", "m^2", "body", (c) => 4 * Math.PI * c.body.radius ** 2, undefined, isBH),
      input("Horizon angular velocity", "rad/s", "body", () => 0, "non-rotating", isBH),
      derived("Surface gravity of the horizon", "m/s^2", "body", (c) => C ** 4 / (4 * c.body.gm), "kappa = c^4 / 4GM", isBH),
      derived("Black-hole temperature in semiclassical models", "K", "body", (c) => (PHYS.HBAR * C ** 3) / (8 * Math.PI * c.body.gm * PHYS.K_B), "Hawking temperature", isBH),
      derived("Bekenstein–Hawking entropy", "J/K", "body", (c) => (PHYS.K_B * C ** 3 * 4 * Math.PI * c.body.radius ** 2) / (4 * G * PHYS.HBAR), "k c^3 A / 4 G hbar", isBH),
      input("Kerr spin parameter", "ratio", "body", () => 0, "non-rotating", isBH),
      derived("Ergosphere boundary", "text", "body", () => "coincides with the horizon (a = 0)", undefined, isBH),
      derived("Static limit", "text", "body", () => "coincides with the horizon (a = 0)", undefined, isBH),
      derived("Photon-orbit structure", "text", "body", () => "one unstable circular photon orbit at 1.5 Rs", undefined, isBH),
      derived("Innermost stable circular orbit", "m", "body", (c) => 3 * c.body.radius, "3 Rs", isBH),
      derived("Circular photon-orbit radii", "m", "body", (c) => 1.5 * c.body.radius, undefined, isBH),
      input("Frame-dragging frequency", "rad/s", "body", () => 0, "non-rotating", isBH),
      derived("Gravitational redshift", "text", "body", () => "infinite at the horizon; z = 0.225 at the ISCO", undefined, isBH),
      ...none(["Lensing behavior"], "no light paths are traced"),
      derived("Shadow size", "m", "body", (c) => (Math.sqrt(27) * c.body.gm) / (C * C), "shadow radius 3 sqrt(3) GM / c^2", isBH),
      derived("Shadow shape", "text", "body", () => "circular (a = 0)", undefined, isBH),
      derived("Quasinormal-mode frequencies", "1/s", "body", (c) => (0.37367 * C ** 3) / (TAU * c.body.gm), "l = 2, n = 0 Schwarzschild mode", isBH),
      derived("Ringdown damping times", "s", "body", (c) => c.body.gm / (0.08896 * C ** 3), "l = 2, n = 0 Schwarzschild mode", isBH),
      derived("Tidal Love numbers in the appropriate theoretical context", "ratio", "body", () => 0, "vanish for Schwarzschild black holes", isBH),
      ...none(["Accretion rate", "Horizon mass growth rate", "Spin-up or spin-down rate"], "mass changes only by whole-body merger; " + NO_HISTORY),
      derived("Merger remnant mass", "text", "body", () => "sum of both masses; no radiated energy is subtracted", "merger rule", isBH),
      input("Recoil velocity after merger", "m/s", "body", () => 0, "momentum-conserving merger, no gravitational-wave recoil", isBH),
      ...none(["Gravitational-wave ringdown energy"], NO_GR),
    ],
  },
  {
    id: "3.1",
    title: "Temperature, energy, and thermodynamics",
    items: [
      input("Temperature", "K", "body", (c) => ref(c, "effectiveTemperature") ?? ref(c, "meanTemperature"), (c) => refNote(c, "published effective or mean surface temperature; reported only"), (c) => (c.body && (ref(c, "effectiveTemperature") ?? ref(c, "meanTemperature")) !== undefined ? true : NO_REF)),
      input("Effective temperature", "K", "body", (c) => ref(c, "effectiveTemperature"), (c) => refNote(c, "published value; reported only"), hasRef("effectiveTemperature")),
      input("Surface temperature", "K", "body", (c) => ref(c, "meanTemperature"), "published mean surface temperature; reported only", hasRef("meanTemperature")),
      ...none(["Core temperature", "Central temperature", "Local temperature", "Temperature gradient", "Thermal equilibrium state", "Thermal conductivity", "Thermal diffusivity", "Heat capacity", "Specific heat at constant pressure", "Specific heat at constant volume", "Internal energy", "Specific internal energy", "Thermal energy", "Kinetic energy of microscopic motion", "Chemical energy", "Ionization energy", "Latent heat", "Nuclear binding energy"], NO_THERMO),
      derived("Gravitational binding energy", "J", "body", (c) => (3 * G * c.body.m * c.body.m) / (5 * c.body.radius), "3GM^2 / 5R for a uniform sphere", notBH),
      ...none(["Enthalpy", "Helmholtz free energy", "Gibbs free energy", "Entropy", "Entropy density", "Entropy production rate", "Heat flux", "Heat-transfer rate", "Cooling rate", "Heating rate", "Energy generation rate", "Thermal relaxation time", "Thermal timescale", "Cooling timescale", "Thermal equilibrium timescale", "Thermal expansion coefficient", "Compressibility", "Isothermal compressibility", "Adiabatic compressibility", "Thermodynamic phase", "Phase-transition threshold", "Latent heat of transition", "Critical temperature", "Critical pressure", "Critical density"], NO_THERMO),
    ],
  },
  {
    id: "3.2",
    title: "Pressure and equations of state",
    items: [
      ...none(["Pressure"], NO_THERMO),
      derived("Central pressure", "N/m^2", "body", (c) => (3 * G * c.body.m * c.body.m) / (8 * Math.PI * c.body.radius ** 4), "3GM^2 / 8 pi R^4: exact for a uniform sphere and a strict lower bound for any body whose density does not increase outward", notBH),
      ...none(["Surface pressure", "Partial pressure", "Radiation pressure", "Degeneracy pressure", "Electron degeneracy pressure", "Neutron degeneracy pressure", "Gas pressure", "Plasma pressure", "Magnetic pressure", "Dynamic pressure", "Hydrostatic pressure", "Pressure gradient", "Pressure anisotropy", "Equation of state", "Polytropic index", "Polytropic constant", "Adiabatic index", "Isothermal index", "Sound speed", "Relativistic sound speed", "Compressional response", "Bulk modulus", "Shear modulus", "Yield strength", "Tensile strength", "Fracture strength", "Viscosity", "Shear viscosity", "Bulk viscosity", "Kinematic viscosity", "Elastic modulus", "Plastic deformation properties", "Rheological behavior", "Yield criterion"], "no equation of state; white dwarf and neutron star radii follow fixed scaling rules, not a pressure balance"),
    ],
  },
  {
    id: "3.3",
    title: "Chemical and nuclear composition",
    items: [
      ...none(["Elemental composition", "Isotopic composition", "Nuclear species abundances", "Ion abundances", "Molecular abundances", "Atomic abundance fractions", "Molecular abundance fractions", "Ionization fraction", "Recombination fraction", "Electron fraction", "Proton fraction", "Neutron fraction", "Neutron-to-proton ratio", "Mean molecular weight", "Metallicity", "Hydrogen mass fraction", "Helium mass fraction", "Heavy-element mass fraction", "Dust abundance", "Grain-size distribution", "Molecular hydrogen fraction", "Chemical reaction rates", "Nuclear reaction rates", "Fusion rates", "Fission rates, where relevant", "Radioactive decay rates", "Neutron-capture rates", "Photodisintegration rates", "Beta-decay rates", "Neutrino interaction rates", "Nuclear binding energy", "Nuclear statistical equilibrium state", "Chemical equilibrium state", "Reaction-network state", "Nuclear burning timescale", "Fuel depletion rate", "Neutrino emissivity"], NO_COMPOSITION),
    ],
  },
  {
    id: "3.4",
    title: "Material and solid-state properties",
    items: [
      ...none(["Bulk composition", "Mineral composition", "Crystal structure", "Porosity", "Grain size", "Fracture toughness", "Hardness", "Elasticity", "Plasticity", "Yield strength", "Tensile strength", "Compressive strength", "Shear strength", "Cohesion", "Internal friction angle", "Friction coefficient", "Viscosity", "Ductility", "Brittleness", "Thermal expansion", "Thermal conductivity", "Electrical conductivity", "Heat capacity"], NO_MATERIAL),
      input("Reflectivity", "ratio", "body", (c) => ref(c, "bondAlbedo"), "published Bond albedo; reported only", hasRef("bondAlbedo")),
      ...none(["Emissivity", "Absorptivity"], NO_RADIATION),
      input("Albedo", "ratio", "body", (c) => ref(c, "bondAlbedo"), "published Bond albedo; used only for the equilibrium-temperature estimate", hasRef("bondAlbedo")),
      ...none(["Surface roughness", "Permeability", "Compaction behavior", "Sintering rate", "Melting point", "Sublimation temperature", "Boiling point", "Phase-transition pressures", "Ice phase", "Rock rheology", "Mantle creep", "Core solidification rate", "Magma viscosity", "Latent heat of melting", "Latent heat of vaporization"], NO_MATERIAL),
    ],
  },
  {
    id: "4.1",
    title: "Electric properties",
    items: [
      input("Net electric charge", "C", "body", () => 0, "all bodies are assumed neutral"),
      input("Charge density", "C/m^3", "body", () => 0, "neutral assumption"),
      ...none(["Charge distribution", "Electric potential", "Electric field vector", "Electric-field magnitude", "Electric-field gradient", "Electric dipole moment", "Electric quadrupole moment", "Electric current density", "Total current", "Electrical conductivity", "Resistivity", "Permittivity", "Polarization", "Dielectric response", "Plasma frequency", "Debye length", "Charge-separation scale", "Electric potential difference", "Induced electric field", "Electromotive force", "Electrical dissipation rate", "Joule heating rate"], NO_EM),
    ],
  },
  {
    id: "4.2",
    title: "Magnetic properties",
    items: [
      ...none(["Magnetic field vector"], "no field geometry; only a dipole strength is carried"),
      derived("Magnetic-field magnitude", "T", "body", surfaceField, (c) => (ref(c, "dipoleMoment") !== undefined ? "equatorial surface field of the published dipole, mu0 m / 4 pi R^3" : "orthogonal-rotator estimate 3.2e19 sqrt(P Pdot) gauss from the timing values"), hasField),
      derived("Surface magnetic field", "T", "body", surfaceField, "equatorial value at the contact radius; reported only", hasField),
      derived("Polar magnetic field", "T", "body", (c) => 2 * surfaceField(c), "twice the equatorial dipole field", hasField),
      derived("Equatorial magnetic field", "T", "body", surfaceField, undefined, hasField),
      ...none(["Internal magnetic field", "External magnetic field", "Magnetic-field topology"], NO_EM),
      input("Magnetic dipole moment", "A m^2", "body", (c) => ref(c, "dipoleMoment"), "published value; 0 means no intrinsic dipole was detected", hasRef("dipoleMoment")),
      ...none(["Magnetic quadrupole moment", "Higher magnetic multipoles"], "dipole only"),
      input("Magnetic inclination", "rad", "body", (c) => (ref(c, "dipoleTilt") * Math.PI) / 180, "published dipole tilt from the spin axis", hasRef("dipoleTilt")),
      input("Magnetic obliquity", "rad", "body", (c) => (ref(c, "dipoleTilt") * Math.PI) / 180, undefined, hasRef("dipoleTilt")),
      input("Magnetic-axis orientation", "text", "body", (c) => `${ref(c, "dipoleTilt")} degrees from the spin axis; azimuth not carried`, undefined, hasRef("dipoleTilt")),
      ...none(["Magnetic flux", "Magnetic flux density", "Magnetic flux linkage", "Magnetic helicity"], NO_EM),
      derived("Magnetic energy density", "J/m^3", "body", (c) => surfaceField(c) ** 2 / (2 * PHYS.MU_0), "B^2 / 2 mu0 at the equatorial surface", hasField),
      derived("Magnetic pressure", "N/m^2", "body", (c) => surfaceField(c) ** 2 / (2 * PHYS.MU_0), "same as the magnetic energy density", hasField),
      ...none(["Magnetic tension", "Magnetic reconnection rate", "Magnetic diffusivity", "Magnetic Reynolds number", "Plasma beta", "Alfvén speed", "Alfvén timescale", "Magnetospheric radius", "Magnetopause radius", "Magnetospheric structure", "Current-sheet structure", "Magnetic braking torque", "Magnetic torque", "Magnetic-field decay rate", "Magnetic-field generation rate", "Dynamo efficiency", "Magnetic energy dissipation", "Magnetic flare energy"], NO_PLASMA),
    ],
  },
  {
    id: "4.3",
    title: "Charged particles and plasma",
    items: [
      ...none(["Electron number density", "Ion number density", "Proton number density", "Particle species", "Particle mass", "Particle charge", "Particle energy distribution", "Particle momentum distribution", "Bulk plasma velocity", "Thermal velocity distribution", "Plasma temperature", "Ion temperature", "Electron temperature", "Plasma pressure", "Plasma density", "Plasma frequency", "Cyclotron frequency", "Gyrofrequency", "Larmor radius", "Debye length", "Plasma skin depth", "Collision frequency", "Mean free path", "Collisionless damping rate", "Plasma conductivity", "Plasma resistivity", "Plasma viscosity", "Plasma turbulence", "Turbulent power spectrum", "Alfvén waves", "Magnetosonic waves", "Shock speed", "Shock compression ratio", "Mach number", "Alfvén Mach number", "Plasma beta", "Magnetic reconnection rate", "Particle acceleration rate", "Particle escape rate", "Cosmic-ray energy spectrum", "Cosmic-ray flux", "Cosmic-ray pressure", "Synchrotron emissivity", "Bremsstrahlung emissivity", "Inverse-Compton emissivity", "Pair-production rate", "Electron-positron pair density"], NO_PLASMA),
    ],
  },
  {
    id: "5.1",
    title: "Radiation quantities",
    items: [
      input("Luminosity", "W", "body", (c) => ref(c, "luminosity"), (c) => refNote(c, "published bolometric luminosity; reported only, no radiation pressure acts on the motion"), hasLuminosity),
      input("Bolometric luminosity", "W", "body", (c) => ref(c, "luminosity"), undefined, hasLuminosity),
      ...none(["Spectral luminosity", "Specific intensity", "Radiance", "Surface brightness", "Brightness temperature", "Spectral energy distribution", "Spectral flux density"], NO_RADIATION),
      derived("Integrated flux", "W/m^2", "body", irradiance, "irradiance at this body from every luminous star in the scene, L / 4 pi r^2", irradiated),
      ...none(["Photon flux"], "no spectrum; photon counts need one"),
      derived("Radiation energy density", "J/m^3", "body", (c) => irradiance(c) / C, "F / c for the incoming starlight", irradiated),
      derived("Radiation pressure", "N/m^2", "body", (c) => irradiance(c) / C, "F / c on a perfectly absorbing surface; reported only, never applied", irradiated),
      derived("Radiation momentum flux", "N/m^2", "body", (c) => irradiance(c) / C, undefined, irradiated),
      ...none(["Radiation temperature", "Radiation field anisotropy", "Photon number density", "Photon energy distribution", "Photon occupation number", "Radiation emissivity", "Absorption coefficient", "Scattering coefficient", "Opacity", "Optical depth"], NO_RADIATION),
      input("Albedo", "ratio", "body", (c) => ref(c, "bondAlbedo"), "published Bond albedo", hasRef("bondAlbedo")),
      ...none(["Emissivity", "Absorptivity"], NO_RADIATION),
      input("Reflectivity", "ratio", "body", (c) => ref(c, "bondAlbedo"), "Bond albedo", hasRef("bondAlbedo")),
      ...none(["Transmissivity", "Extinction coefficient", "Polarization fraction", "Stokes parameters I, Q, U, V", "Spectral line width", "Line-center wavelength", "Line-center frequency", "Equivalent width", "Line-of-sight absorption"], NO_RADIATION),
      ...none(["Doppler shift"], NO_SKY),
      derived("Gravitational redshift", "ratio", "body", (c) => 1 / Math.sqrt(1 - schwarzschildRadius(c.body.gm) / c.body.radius) - 1, "surface to infinity, Schwarzschild exterior; reported only", notBH),
      ...none(["Relativistic beaming factor"], NO_SKY),
      ...none(["Limb darkening", "Limb brightening", "Radiation diffusion timescale", "Radiative cooling rate", "Radiative heating rate", "Photon escape time"], NO_RADIATION),
    ],
  },
  {
    id: "5.2",
    title: "Emission and absorption mechanisms",
    items: [
      derived("Blackbody emission", "W", "body", (c) => 4 * Math.PI * c.body.radius ** 2 * PHYS.SIGMA_SB * ref(c, "effectiveTemperature") ** 4, "4 pi R^2 sigma T^4 from the published effective temperature; compare with the listed luminosity", hasRef("effectiveTemperature")),
      ...none(["Thermal bremsstrahlung", "Synchrotron emission", "Cyclotron emission", "Inverse-Compton scattering", "Comptonization", "Atomic line emission", "Molecular line emission", "Recombination radiation", "Free-bound emission", "Bound-bound transitions", "Bound-free absorption", "Free-free absorption", "Resonant scattering", "Thomson scattering", "Compton scattering", "Dust thermal emission", "Dust scattering", "Fluorescence", "Maser emission", "Coherent radio emission", "Curvature radiation", "Pair-annihilation radiation"], NO_RADIATION),
      ...none(["Neutrino emission"], NO_PARTICLES),
      derived("Gravitational-wave emission", "W", "body", gwPower, "Peters 1964 quadrupole power for the osculating pair; not applied", elliptic),
    ],
  },
  {
    id: "5.3",
    title: "Spectral and observational properties",
    items: [
      ...none(["Apparent magnitude"], NO_SKY),
      derived("Absolute magnitude", "ratio", "body", (c) => -2.5 * Math.log10(ref(c, "luminosity") / PHYS.L_BOL_ZERO), "bolometric, IAU 2015 zero point 3.0128e28 W", hasLuminosity),
      derived("Bolometric magnitude", "ratio", "body", (c) => -2.5 * Math.log10(ref(c, "luminosity") / PHYS.L_BOL_ZERO), "absolute bolometric magnitude", hasLuminosity),
      ...none(["Color indices", "Color temperature"], NO_RADIATION),
      input("Effective temperature", "K", "body", (c) => ref(c, "effectiveTemperature"), undefined, hasRef("effectiveTemperature")),
      ...none(["Spectral type", "Luminosity class", "Spectral line ratios", "Line-of-sight extinction", "Interstellar extinction", "Reddening", "Polarization angle", "Polarization fraction", "Photometric variability amplitude", "Variability period", "Variability timescale", "Flare amplitude", "Flare duration", "Spectral cutoff energy", "Spectral peak energy", "Photon index", "Radio spectral index", "X-ray spectral index", "Emission-line redshift"], NO_RADIATION),
      ...none(["Cosmological redshift"], NO_COSMO),
      ...none(["Peculiar-velocity contribution to redshift"], NO_SKY),
      derived("Gravitational redshift contribution", "ratio", "body", (c) => 1 / Math.sqrt(1 - schwarzschildRadius(c.body.gm) / c.body.radius) - 1, "surface z, Schwarzschild exterior", notBH),
      ...none(["Observed angular diameter", "Angular separation", "Angular proper motion", "Parallax", "Distance modulus", "Flux variability", "Time delay between emission bands"], NO_SKY),
    ],
  },
  {
    id: "6.1",
    title: "Fluid state",
    items: [
      ...none(["Mass density", "Number density", "Pressure", "Temperature", "Velocity field", "Acceleration field", "Internal energy density", "Total energy density", "Enthalpy density", "Entropy density", "Composition field", "Equation of state", "Sound speed", "Mach number", "Vorticity", "Velocity divergence", "Strain rate", "Shear rate", "Viscous stress tensor", "Pressure tensor", "Heat flux", "Mass flux", "Momentum flux", "Energy flux", "Turbulent velocity", "Turbulent kinetic energy", "Turbulent dissipation rate", "Reynolds number", "Peclet number", "Prandtl number", "Schmidt number", "Knudsen number", "Cooling function", "Heating function", "Radiative loss rate", "Thermal conduction rate", "Diffusion coefficient", "Mixing coefficient"], NO_FLUID),
    ],
  },
  {
    id: "6.2",
    title: "Atmosphere and exosphere",
    items: [
      ...none(["Atmospheric mass", "Atmospheric composition"], NO_FLUID),
      input("Surface pressure", "N/m^2", "body", (c) => ref(c, "surfacePressure"), "published mean surface pressure; reported only", hasRef("surfacePressure")),
      ...none(["Pressure profile", "Temperature profile", "Density profile"], NO_FLUID),
      input("Scale height", "m", "body", (c) => ref(c, "scaleHeight"), "published value; reported only", hasRef("scaleHeight")),
      ...none(["Mean molecular weight", "Humidity, where relevant", "Ionization profile"], NO_FLUID),
      derived("Escape velocity", "m/s", "body", surfaceEscape, "sqrt(2GM / R) at the contact radius", notBH),
      ...none(["Atmospheric escape rate", "Thermal escape rate", "Hydrodynamic escape rate", "Jeans escape parameter", "Exobase altitude", "Exobase temperature", "Atmospheric circulation", "Wind velocity", "Sound speed", "Mach number", "Atmospheric drag coefficient", "Molecular diffusion coefficient", "Eddy diffusion coefficient", "Cloud particle distribution", "Cloud opacity", "Aerosol concentration", "Condensation rate", "Evaporation rate", "Sublimation rate", "Precipitation rate, where relevant", "Greenhouse opacity", "Infrared optical depth"], NO_FLUID),
      derived("Radiative equilibrium temperature", "K", "body", equilibriumTemperature, (c) => `(F (1 - A) / 4 sigma)^(1/4), ${albedoNote(c)}; no greenhouse term`, both(irradiated, notBH)),
      input("Atmospheric albedo", "ratio", "body", (c) => ref(c, "bondAlbedo"), "Bond albedo of the whole body", hasRef("bondAlbedo")),
      ...none(["Thermal emission spectrum", "Atmospheric scale-height variation", "Escape of ionized material", "Stellar-wind interaction", "Magnetospheric shielding"], NO_FLUID),
    ],
  },
  {
    id: "6.3",
    title: "Accretion, winds, and jets",
    items: [
      ...none(["Accretion rate", "Radial inflow velocity", "Angular-momentum transport rate", "Disk surface density", "Disk scale height", "Disk temperature", "Disk viscosity parameter", "Disk aspect ratio", "Disk optical depth", "Disk magnetic field", "Disk luminosity", "Disk radiative efficiency", "Disk truncation radius", "Inner disk radius", "Outer disk radius"], NO_ACCRETION),
      derived("Innermost stable orbit", "m", "body", (c) => 3 * c.body.radius, "3 Rs, Schwarzschild; where a thin disk would end", bhOnly),
      ...none(["Accretion torque", "Wind mass-loss rate", "Wind velocity", "Wind density", "Wind temperature", "Jet mass flux", "Jet power", "Jet kinetic luminosity", "Jet magnetic luminosity", "Jet Lorentz factor", "Jet opening angle", "Jet collimation", "Jet composition", "Jet magnetization", "Jet propagation speed", "Jet termination-shock radius", "Jet variability", "Outflow momentum flux", "Feedback energy", "Feedback coupling efficiency"], NO_ACCRETION),
    ],
  },
  {
    id: "7.1",
    title: "Rotation and spin",
    items: [
      derived("Spin angular momentum", "kg m^2/s", "body", (c) => momentOfInertia(c) * spinRate(c), "I omega from the published inertia factor and rotation period; not part of the dynamics", both(hasInertia, hasSpin)),
      derived("Spin angular velocity", "rad/s", "body", spinRate, "2 pi / P from the published period", hasSpin),
      derived("Spin frequency", "1/s", "body", (c) => 1 / Math.abs(spinPeriod(c)), undefined, hasSpin),
      input("Spin period", "s", "body", (c) => Math.abs(spinPeriod(c)), (c) => refNote(c, `published sidereal rotation period${spinPeriod(c) < 0 ? ", retrograde" : ""}`), hasSpin),
      input("Spin-axis orientation", "text", "body", (c) => `${ref(c, "obliquity")} degrees obliquity to the orbit; the engine has no third axis to place it in`, undefined, hasRef("obliquity")),
      derived("Moment of inertia", "kg m^2", "body", momentOfInertia, (c) => (ref(c, "momentOfInertia") !== undefined ? "canonical value for this class" : `published factor ${ref(c, "momentOfInertiaFactor")} x M R^2`), hasInertia),
      ...none(["Principal moments of inertia", "Inertia tensor"], "one scalar inertia factor only"),
      derived("Rotational kinetic energy", "J", "body", (c) => 0.5 * momentOfInertia(c) * spinRate(c) ** 2, "I omega^2 / 2; not included in the energy budget the integrator tracks", both(hasInertia, hasSpin)),
      derived("Rotational flattening", "ratio", "body", (c) => 1.5 * ref(c, "j2") + (spinRate(c) ** 2 * equatorialRadius(c) ** 3) / (2 * c.body.gm), "first-order hydrostatic relation 3 J2 / 2 + q / 2", both(hasRef("j2"), hasSpin)),
      derived("Centrifugal acceleration", "m/s^2", "body", (c) => spinRate(c) ** 2 * equatorialRadius(c), "omega^2 a at the equator", hasSpin),
      derived("Centrifugal potential", "J/kg", "body", (c) => -0.5 * spinRate(c) ** 2 * equatorialRadius(c) ** 2, "-omega^2 a^2 / 2 at the equator", hasSpin),
      derived("Rotational breakup frequency", "rad/s", "body", (c) => Math.sqrt(c.body.gm / c.body.radius ** 3), "sqrt(GM / R^3), Keplerian limit for a rigid sphere", notBH),
      derived("Critical rotation velocity", "m/s", "body", (c) => Math.sqrt(c.body.gm / c.body.radius), "sqrt(GM / R) at the equator", notBH),
      ...none(["Differential rotation", "Internal angular-velocity profile", "Rotational shear"], NO_INTERNAL),
      derived("Rotational energy", "J", "body", (c) => 0.5 * momentOfInertia(c) * spinRate(c) ** 2, undefined, both(hasInertia, hasSpin)),
      input("Spin-down rate", "ratio", "body", (c) => ref(c, "spinPeriodDerivative"), (c) => refNote(c, "published period derivative dP/dt"), hasRef("spinPeriodDerivative")),
      ...none(["Spin-up rate", "Magnetic braking torque", "Accretion torque", "Tidal torque", "Gravitational-wave spin-down torque", "Precession frequency", "Free precession", "Forced precession", "Nutation", "Wobble angle", "Spin-orbit coupling"], NO_ROTATION),
      derived("Spin-orbit resonance", "text", "body", spinOrbit, "osculating orbital period over the published rotation period", both(elliptic, hasSpin)),
      input("Obliquity", "rad", "body", (c) => (ref(c, "obliquity") * Math.PI) / 180, "published value; reported only", hasRef("obliquity")),
      ...none(["Tidal synchronization timescale", "Rotational damping timescale"], "needs a tidal quality factor; no tidal response is modeled"),
    ],
  },
  {
    id: "7.2",
    title: "Internal waves and instabilities",
    items: [
      ...none(["Buoyancy frequency", "Brunt–Väisälä frequency", "Convective turnover time", "Convective velocity", "Convective energy flux", "Internal gravity-wave amplitude", "Oscillation frequency", "Mode amplitude", "Mode energy", "Mode damping time", "Mode growth rate", "Eigenfrequency", "Eigenfunction", "Acoustic oscillation modes", "Gravity modes", "Rossby modes", "Inertial modes", "Torsional modes", "Radial pulsation modes", "Nonradial pulsation modes", "Instability growth rate", "Thermal instability criterion", "Convective stability criterion", "Rotational instability criterion", "Magnetic instability criterion", "Bar-mode instability", "Shear instability", "Rayleigh–Taylor instability", "Kelvin–Helmholtz instability", "Magnetorotational instability", "Gravitational instability", "Jeans instability"], NO_INTERNAL),
    ],
  },
  {
    id: "8.1",
    title: "General stellar properties",
    items: [
      ...none(["Initial mass"], NO_HISTORY),
      state("Current mass", "kg", "body", (c) => c.body.m, undefined, stellar),
      ...none(["Final remnant mass"], NO_EVOLUTION),
      state("Stellar radius", "m", "body", (c) => c.body.radius, "photospheric radius used as the contact radius", stellar),
      ...none(["Core radius"], NO_STRUCTURE),
      state("Photospheric radius", "m", "body", (c) => c.body.radius, undefined, stellar),
      input("Luminosity", "W", "body", luminousStar, (c) => refNote(c, "published value; reported only"), both(stellar, hasLuminosity)),
      input("Effective temperature", "K", "body", (c) => ref(c, "effectiveTemperature"), (c) => refNote(c, "published value"), both(stellar, hasRef("effectiveTemperature"))),
      ...none(["Central temperature"], NO_STRUCTURE),
      input("Surface temperature", "K", "body", (c) => ref(c, "effectiveTemperature"), "effective temperature", both(stellar, hasRef("effectiveTemperature"))),
      ...none(["Central density"], NO_STRUCTURE),
      derived("Mean density", "kg/m^3", "body", (c) => c.body.m / ((4 / 3) * Math.PI * c.body.radius ** 3), undefined, stellar),
      derived("Surface gravity", "m/s^2", "body", (c) => c.body.gm / c.body.radius ** 2, "GM / R^2", stellar),
      derived("Central pressure", "N/m^2", "body", (c) => (3 * G * c.body.m * c.body.m) / (8 * Math.PI * c.body.radius ** 4), "uniform-sphere value, a strict lower bound for a real star", stellar),
      ...none(["Surface pressure", "Metallicity", "Hydrogen abundance", "Helium abundance", "Heavy-element abundance", "Surface chemical composition", "Core chemical composition"], NO_COMPOSITION),
      ...none(["Age", "Evolutionary stage", "Nuclear fuel abundance", "Nuclear burning rate", "Nuclear luminosity", "Gravitational contraction luminosity", "Neutrino luminosity"], NO_EVOLUTION),
      ...none(["Surface magnetic field", "Internal magnetic field"], "no published stellar dipole in the reference table"),
      input("Spin period", "s", "body", (c) => Math.abs(spinPeriod(c)), "sidereal equatorial rotation", both(stellar, hasSpin)),
      derived("Rotation rate", "rad/s", "body", spinRate, undefined, both(stellar, hasSpin)),
      ...none(["Mass-loss rate", "Wind velocity", "Wind density", "Wind composition", "Mass-transfer rate", "Accretion rate"], NO_ACCRETION),
      ...none(["Convective envelope mass", "Radiative envelope mass", "Core mass", "Convective-core size", "Mixing length", "Opacity", "Equation of state", "Nuclear reaction network", "Convective efficiency", "Overshooting parameter", "Diffusion coefficient", "Mixing timescale"], NO_STRUCTURE),
      derived("Kelvin–Helmholtz timescale", "s", "body", (c) => (G * c.body.m * c.body.m) / (2 * c.body.radius * ref(c, "luminosity")), "GM^2 / 2RL from the published luminosity", both(stellar, hasLuminosity)),
      ...none(["Nuclear timescale"], "needs a burning model; the 0.007 M c^2 estimate is not applied here"),
      derived("Dynamical timescale", "s", "body", (c) => Math.sqrt(c.body.radius ** 3 / c.body.gm), "sqrt(R^3 / GM)", stellar),
      ...none(["Main-sequence lifetime estimate", "Remaining lifetime estimate", "Predicted remnant type"], NO_EVOLUTION),
    ],
  },
  {
    id: "8.2",
    title: "Stellar structure variables",
    items: [
      ...none(["Enclosed mass m(r, t)", "Density rho(r, t)", "Pressure P(r, t)", "Temperature T(r, t)", "Luminosity L(r, t)", "Energy-generation rate", "Energy-transport rate", "Composition fractions X_i(r, t)", "Opacity kappa(r, t)", "Adiabatic gradient", "Radiative gradient", "Convective gradient", "Mean molecular weight", "Local gravitational acceleration", "Local sound speed", "Local entropy", "Local angular velocity", "Local magnetic field, in extended models", "Local neutrino emissivity", "Local nuclear reaction rates"], NO_STRUCTURE),
    ],
  },
  {
    id: "8.3",
    title: "Stellar evolution and transitions",
    items: [
      ...none(["Molecular-cloud collapse", "Protostar formation", "Accretion onto a protostar", "Pre-main-sequence contraction", "Hydrogen burning", "Main-sequence evolution", "Core hydrogen depletion", "Subgiant expansion", "Red giant expansion", "Helium ignition", "Helium burning", "Horizontal-branch evolution", "Asymptotic giant branch evolution", "Shell burning", "Carbon and oxygen core formation", "Stellar winds", "Envelope loss", "Planetary nebula formation", "White-dwarf formation", "Core-collapse supernova", "Electron-capture supernova", "Pair-instability phenomena", "Neutron-star formation", "Black-hole formation", "Fallback accretion", "Binary mass transfer", "Common-envelope evolution"], NO_EVOLUTION, "sim"),
      derived("Stellar merger", "text", "sim", (c) => `modeled as a perfectly inelastic contact merger; remnant class by mass threshold (white dwarf above 1.44 Msun becomes a neutron star, neutron star above 2.5 Msun becomes a black hole); ${c.world.stats?.merges ?? 0} so far`, "mass and momentum conserved; the pair's orbital energy and spin are not tracked into the remnant"),
      ...none(["Tidal disruption"], "Roche crossings are reported in 2.1; no disruption or debris", "sim"),
      derived("Compact-binary inspiral", "text", "sim", () => "reported only: Peters orbital decay and merger time appear in 12.1 and 12.3 but are not applied to the motion"),
    ],
  },
  {
    id: "8.4",
    title: "White dwarfs",
    items: [
      state("Mass", "kg", "body", (c) => c.body.m, undefined, whiteDwarf),
      state("Radius", "m", "body", (c) => c.body.radius, "Sirius B scaled as R proportional to M^(-1/3) after mergers", whiteDwarf),
      ...none(["Core composition", "Carbon-to-oxygen ratio", "Oxygen-to-neon composition, where applicable", "Hydrogen envelope mass", "Helium envelope mass", "Central density", "Central temperature"], NO_COMPOSITION),
      input("Surface temperature", "K", "body", (c) => ref(c, "effectiveTemperature"), (c) => refNote(c, "Sirius B effective temperature"), both(whiteDwarf, hasRef("effectiveTemperature"))),
      input("Luminosity", "W", "body", (c) => ref(c, "luminosity"), (c) => refNote(c, "Sirius B luminosity"), both(whiteDwarf, hasLuminosity)),
      ...none(["Cooling age", "Total age"], NO_HISTORY),
      ...none(["Electron degeneracy state", "Crystallization fraction", "Crystallization-front position", "Latent heat release", "Phase separation"], "no equation of state"),
      ...none(["Spin period", "Magnetic field", "Magnetic inclination"], "no published value for this preset"),
      ...none(["Accretion rate", "Surface accreted-layer composition", "Nuclear ignition conditions", "Rotation-supported mass correction", "Tidal deformation"], NO_ACCRETION),
      derived("Binary orbital period", "s", "body", (c) => c.orbit.period, "osculating period about the strongest partner", both(whiteDwarf, elliptic)),
      derived("Roche-lobe filling factor", "ratio", "body", (c) => c.body.radius / rocheLobe(c), "radius over the Eggleton lobe", both(whiteDwarf, elliptic)),
      derived("Chandrasekhar mass-limit comparison", "ratio", "body", (c) => c.body.m / (1.44 * CONST.GM_SUN / G), "M / 1.44 Msun; a merger that crosses 1 becomes a neutron star under the remnant rule", whiteDwarf),
      ...none(["Cooling luminosity", "Residual nuclear burning rate", "Nova recurrence timescale, where applicable"], NO_EVOLUTION),
    ],
  },
  {
    id: "8.5",
    title: "Neutron stars",
    items: [
      state("Gravitational mass", "kg", "body", (c) => c.body.m, undefined, neutron),
      ...none(["Baryonic mass"], NO_COMPOSITION),
      state("Radius", "m", "body", (c) => c.body.radius, "12 km class value", neutron),
      ...none(["Central density", "Central pressure", "Central temperature", "Equation of state"], "no equation of state; the radius is fixed at 12 km"),
      input("Moment of inertia", "kg m^2", "body", momentOfInertia, "canonical 10^38 kg m^2 used in the spin-down formulas", both(neutron, hasInertia)),
      derived("Compactness", "ratio", "body", (c) => c.body.gm / (c.body.radius * C * C), "GM / R c^2", neutron),
      derived("Surface gravity", "m/s^2", "body", (c) => c.body.gm / c.body.radius ** 2, "Newtonian GM / R^2", neutron),
      derived("Escape velocity", "m/s", "body", surfaceEscape, "Newtonian sqrt(2GM / R)", neutron),
      derived("Gravitational redshift", "ratio", "body", (c) => 1 / Math.sqrt(1 - schwarzschildRadius(c.body.gm) / c.body.radius) - 1, "surface z, Schwarzschild exterior", neutron),
      input("Spin period", "s", "body", (c) => spinPeriod(c), (c) => refNote(c, "Crab pulsar timing (ATNF)"), both(neutron, hasSpin)),
      derived("Spin frequency", "1/s", "body", (c) => 1 / spinPeriod(c), undefined, both(neutron, hasSpin)),
      input("Spin-down rate", "ratio", "body", (c) => ref(c, "spinPeriodDerivative"), "dP/dt", both(neutron, hasRef("spinPeriodDerivative"))),
      ...none(["Spin-up rate"], NO_ACCRETION),
      derived("Magnetic-field strength", "T", "body", pulsarField, "3.2e19 sqrt(P Pdot) gauss, orthogonal rotator with I = 10^45 g cm^2 and R = 10 km", both(neutron, hasTiming)),
      derived("Magnetic dipole moment", "A m^2", "body", (c) => (4 * Math.PI * pulsarField(c) * c.body.radius ** 3) / PHYS.MU_0, "4 pi B R^3 / mu0 from the field estimate", both(neutron, hasTiming)),
      ...none(["Magnetic inclination", "Magnetic obliquity", "Magnetic topology"], "unknown for the preset; the field formula assumes an orthogonal rotator"),
      ...none(["Crust thickness", "Crust composition", "Core composition", "Superfluid fraction", "Superconducting fraction", "Neutron pairing gap", "Proton pairing gap", "Heat capacity", "Thermal conductivity", "Neutrino cooling rate", "Surface temperature", "Hotspot temperatures", "Hotspot areas", "Thermal luminosity", "X-ray luminosity", "Pulsed fraction", "Pulse profile", "Pulse arrival time", "Timing residuals", "Glitch amplitude", "Glitch recovery time", "Glitch activity"], NO_EMISSION),
      ...none(["Braking index"], "needs the second period derivative; the dipole formulas assume n = 3"),
      derived("Spin-down luminosity", "W", "body", (c) => (4 * Math.PI ** 2 * momentOfInertia(c) * ref(c, "spinPeriodDerivative")) / spinPeriod(c) ** 3, "4 pi^2 I Pdot / P^3", both(neutron, hasTiming, hasInertia)),
      ...none(["Magnetospheric particle density", "Pair multiplicity", "Polar-cap geometry", "Radio emission characteristics", "Gamma-ray emission characteristics", "Accretion torque", "Tidal Love number", "Tidal deformability"], NO_EMISSION),
      derived("Binary orbital parameters", "text", "body", (c) => `a ${(c.orbit.semiMajor / 1000).toExponential(3)} km, e ${c.orbit.eccentricity.toFixed(4)}, P ${(c.orbit.period / 86400).toFixed(3)} days about ${c.orbit.primary}`, "osculating elements", both(neutron, elliptic)),
      derived("Merger threshold", "text", "body", (c) => `remnant becomes a black hole above 2.5 Msun (TOV rule); this body is ${(c.body.m / (CONST.GM_SUN / G)).toFixed(2)} Msun`, undefined, neutron),
      derived("Post-merger stability", "text", "body", (c) => {
        const pair = contact(c)
        return `with ${pair.other.name}: ${pair.remnant.kind}, ${(pair.remnant.mass / (CONST.GM_SUN / G)).toFixed(2)} Msun, radius ${(pair.remnant.radius / 1000).toFixed(1)} km`
      }, "remnant rule applied to the nearest body; no radiated mass", both(neutron, twoPlus)),
    ],
  },
  {
    id: "8.6",
    title: "Pulsars and magnetars",
    items: [
      input("Pulse period", "s", "body", (c) => spinPeriod(c), (c) => refNote(c, "Crab pulsar P from ATNF"), both(neutron, hasTiming)),
      derived("Pulse frequency", "1/s", "body", (c) => 1 / spinPeriod(c), undefined, both(neutron, hasTiming)),
      input("Period derivative", "ratio", "body", (c) => ref(c, "spinPeriodDerivative"), "dP/dt, dimensionless", both(neutron, hasTiming)),
      derived("Frequency derivative", "1/s^2", "body", (c) => -ref(c, "spinPeriodDerivative") / spinPeriod(c) ** 2, "-Pdot / P^2", both(neutron, hasTiming)),
      derived("Spin-down luminosity", "W", "body", (c) => (4 * Math.PI ** 2 * momentOfInertia(c) * ref(c, "spinPeriodDerivative")) / spinPeriod(c) ** 3, "4 pi^2 I Pdot / P^3", both(neutron, hasTiming, hasInertia)),
      derived("Characteristic age estimate", "s", "body", (c) => spinPeriod(c) / (2 * ref(c, "spinPeriodDerivative")), "P / 2 Pdot, assumes braking index 3 and a short birth period", both(neutron, hasTiming)),
      derived("Magnetic-field estimate", "T", "body", pulsarField, "3.2e19 sqrt(P Pdot) gauss", both(neutron, hasTiming)),
      ...none(["Magnetic inclination", "Pulse width", "Pulse phase", "Pulse profile", "Pulse-to-pulse variability", "Pulse arrival times", "Timing residuals"], NO_EMISSION),
      ...none(["Braking index"], "needs the second derivative; assumed 3"),
      ...none(["Glitch epoch", "Glitch magnitude", "Glitch recovery parameters", "Dispersion measure", "Rotation measure", "Faraday rotation", "Radio luminosity", "Radio spectrum", "Gamma-ray luminosity", "X-ray luminosity", "Pulse polarization", "Radio beaming fraction", "Beam geometry", "Polar-cap size", "Magnetospheric current", "Pair-production rate", "Plasma multiplicity"], NO_EMISSION),
      derived("Spin-down torque", "N m", "body", (c) => (-TAU * momentOfInertia(c) * ref(c, "spinPeriodDerivative")) / spinPeriod(c) ** 2, "I d(omega)/dt = -2 pi I Pdot / P^2", both(neutron, hasTiming, hasInertia)),
      ...none(["Magnetic obliquity", "Magnetospheric emission efficiency"], NO_EMISSION),
      ...none(["Surface magnetic-field strength", "Internal magnetic-field strength", "Magnetic-field decay", "Magnetic energy reservoir", "Persistent X-ray luminosity", "Burst energy", "Burst duration", "Burst recurrence", "Giant-flare energy", "Crustal stress", "Crustal failure threshold", "Magnetic reconnection rate", "Thermal response to magnetic heating", "Spin-down torque variability"], NO_MAGNETAR),
    ],
  },
  {
    id: "8.7",
    title: "Black-hole formation and evolution",
    items: [
      ...none(["Progenitor mass", "Progenitor metallicity", "Core mass", "Core composition", "Core temperature", "Core density", "Electron fraction", "Nuclear reaction history", "Neutrino luminosity", "Neutrino energy spectrum", "Collapse timescale", "Shock formation", "Shock propagation", "Shock revival conditions", "Envelope binding energy", "Mass ejected", "Fallback mass"], "no core-collapse model; black holes appear as presets or as merger remnants above 2.5 Msun"),
      derived("Final remnant mass", "text", "body", (c) => {
        const pair = contact(c)
        return `${(pair.remnant.mass / (CONST.GM_SUN / G)).toExponential(3)} Msun if it merges with ${pair.other.name}; no radiated mass is subtracted`
      }, "merger rule, not collapse", both(bhOnly, twoPlus)),
      ...none(["Natal kick velocity"], "no supernova model"),
      input("Final spin", "ratio", "body", () => 0, "Schwarzschild; spin is not modeled", bhOnly),
      ...none(["Spin-axis direction"], PLANAR),
      ...none(["Magnetic-field evolution in the surrounding matter"], NO_PLASMA),
      derived("Gravitational-wave emission", "W", "body", gwPower, "Peters 1964 for the osculating pair; reported only", both(bhOnly, elliptic)),
      derived("Black-hole ringdown", "1/s", "body", (c) => (0.37367 * C ** 3) / (TAU * c.body.gm), "l = 2, n = 0 Schwarzschild frequency for this mass", bhOnly),
      derived("Merger remnant properties", "text", "body", (c) => {
        const pair = contact(c)
        return `${pair.remnant.kind}, ${(pair.remnant.mass / (CONST.GM_SUN / G)).toExponential(3)} Msun, horizon ${(pair.remnant.radius / 1000).toExponential(3)} km, with ${pair.other.name}`
      }, "remnant rule applied to the nearest body", both(bhOnly, twoPlus)),
      ...none(["Accretion-driven mass growth", "Accretion-driven spin evolution"], NO_ACCRETION),
      derived("Hawking temperature and evaporation rate in applicable theoretical models", "text", "body", (c) => {
        const temperature = (PHYS.HBAR * C ** 3) / (8 * Math.PI * c.body.gm * PHYS.K_B)
        const lifetime = (5120 * Math.PI * G * G * c.body.m ** 3) / (PHYS.HBAR * C ** 4)
        return `T = ${temperature.toExponential(3)} K, evaporation time ${(lifetime / 31557600).toExponential(3)} years (photons only)`
      }, "semiclassical, isolated hole; reported only", bhOnly),
    ],
  },
  {
    id: "8.8",
    title: "Quasars and active galactic nuclei",
    items: [
      state("Central black-hole mass", "kg", "body", (c) => c.body.m, undefined, bhOnly),
      input("Black-hole spin", "ratio", "body", () => 0, "Schwarzschild", bhOnly),
      ...none(["Accretion rate"], NO_ACCRETION),
      derived("Eddington luminosity", "W", "body", (c) => (4 * Math.PI * c.body.gm * PHYS.M_PROTON * C) / PHYS.SIGMA_T, "4 pi G M m_p c / sigma_T for ionized hydrogen", (c) => (isBH(c) || STELLAR.has(c.body?.kind) ? true : "black holes and stars only")),
      ...none(["Eddington ratio", "Bolometric luminosity", "Radiative efficiency", "Accretion-disk temperature profile", "Disk surface density", "Disk thickness", "Disk viscosity", "Disk magnetic field", "Disk inclination", "Inner disk radius", "Outer disk radius", "Corona temperature", "Coronal optical depth", "X-ray luminosity", "Radio luminosity", "Ultraviolet luminosity", "Optical luminosity", "Infrared luminosity", "Emission-line widths", "Emission-line ratios", "Broad-line region radius", "Narrow-line region properties", "Outflow velocity", "Wind mass-loss rate", "Jet power", "Jet Lorentz factor", "Jet opening angle", "Jet magnetic field", "Jet particle distribution", "Jet orientation", "Doppler boosting", "Variability timescale", "Flare amplitude", "Accretion-disk instability timescales"], NO_ACCRETION),
      ...none(["Host-galaxy stellar mass", "Host-galaxy morphology", "Black-hole growth rate", "Feedback energy", "Feedback coupling efficiency"], NO_DISTRIBUTED),
      ...none(["Cosmological redshift"], NO_COSMO),
    ],
  },
  {
    id: "9.1",
    title: "Rocky planets and moons",
    items: [
      state("Mass", "kg", "body", (c) => c.body.m, undefined, rocky),
      state("Mean radius", "m", "body", (c) => c.body.radius, undefined, rocky),
      input("Equatorial radius", "m", "body", (c) => ref(c, "equatorialRadius"), "published; reported only", both(rocky, hasRef("equatorialRadius"))),
      input("Polar radius", "m", "body", (c) => ref(c, "polarRadius"), "published; reported only", both(rocky, hasRef("polarRadius"))),
      derived("Volume", "m^3", "body", (c) => (4 / 3) * Math.PI * c.body.radius ** 3, undefined, rocky),
      derived("Mean density", "kg/m^3", "body", (c) => c.body.m / ((4 / 3) * Math.PI * c.body.radius ** 3), undefined, rocky),
      derived("Moment of inertia", "kg m^2", "body", momentOfInertia, (c) => `published factor ${ref(c, "momentOfInertiaFactor")} x M R^2`, both(rocky, hasInertia)),
      derived("Surface gravity", "m/s^2", "body", (c) => c.body.gm / c.body.radius ** 2, "GM / R^2 at the mean radius", rocky),
      derived("Central pressure", "N/m^2", "body", (c) => (3 * G * c.body.m * c.body.m) / (8 * Math.PI * c.body.radius ** 4), "uniform-sphere lower bound; real cores are denser", rocky),
      ...none(["Core mass fraction", "Core radius", "Mantle thickness", "Crust thickness", "Core composition", "Mantle composition", "Crust composition", "Internal temperature profile", "Internal pressure profile", "Internal density profile", "Heat flow", "Radiogenic heat production", "Primordial heat", "Core solidification rate", "Mantle convection rate", "Mantle viscosity", "Elastic modulus", "Seismic velocity", "Seismic attenuation", "Seismic activity", "Volcanic activity", "Surface tectonic activity", "Surface age distribution", "Impact crater distribution", "Topographic relief", "Surface roughness", "Surface porosity"], POINT),
      input("Surface albedo", "ratio", "body", (c) => ref(c, "bondAlbedo"), "Bond albedo", both(rocky, hasRef("bondAlbedo"))),
      ...none(["Thermal inertia", "Surface emissivity"], NO_THERMO),
      input("Surface temperature", "K", "body", (c) => ref(c, "meanTemperature"), "published mean", both(rocky, hasRef("meanTemperature"))),
      ...none(["Day-night temperature difference"], NO_THERMO),
      input("Rotation period", "s", "body", (c) => Math.abs(spinPeriod(c)), (c) => `sidereal${spinPeriod(c) < 0 ? ", retrograde" : ""}`, both(rocky, hasSpin)),
      input("Axial tilt", "rad", "body", (c) => (ref(c, "obliquity") * Math.PI) / 180, undefined, both(rocky, hasRef("obliquity"))),
      ...none(["Precession rate", "Nutation"], NO_ROTATION),
      derived("Orbital eccentricity", "ratio", "body", (c) => c.orbit.eccentricity, "osculating", both(rocky, hasOrbit)),
      input("Orbital inclination", "rad", "body", () => 0, "all orbits share the simulation plane", both(rocky, hasOrbit)),
      input("Obliquity", "rad", "body", (c) => (ref(c, "obliquity") * Math.PI) / 180, "published; reported only", both(rocky, hasRef("obliquity"))),
      ...none(["Tidal response"], "rigid bodies"),
      input("Tidal Love number", "ratio", "body", (c) => ref(c, "k2"), "published k2; no response is computed", both(rocky, hasRef("k2"))),
      ...none(["Tidal dissipation factor", "Tidal heating rate"], NO_DISSIPATION),
      input("Magnetic dipole moment", "A m^2", "body", (c) => ref(c, "dipoleMoment"), "published; 0 means no detected intrinsic dipole", both(rocky, hasRef("dipoleMoment"))),
      derived("Magnetic-field strength", "T", "body", surfaceField, "equatorial surface dipole field", both(rocky, hasField)),
      ...none(["Magnetic-field topology", "Magnetopause radius", "Magnetotail structure", "Internal dynamo state"], NO_PLASMA),
      ...none(["Atmospheric mass", "Atmospheric composition", "Escape rate"], NO_FLUID),
      derived("Satellite system", "text", "body", (c) => {
        const moons = satellites(c)
        return moons.length ? `${moons.length}: ${moons.map((moon) => moon.name).join(", ")}` : "none in the scene"
      }, "bodies whose strongest pull is this one", both(rocky, twoPlus)),
      ...none(["Ring system"], "no ring model"),
      derived("Roche-lobe filling factor", "ratio", "body", (c) => c.body.radius / rocheLobe(c), undefined, both(rocky, elliptic)),
    ],
  },
  {
    id: "9.2",
    title: "Gas giants and ice giants",
    items: [
      state("Total mass", "kg", "body", (c) => c.body.m, undefined, giant),
      input("Equatorial radius", "m", "body", (c) => ref(c, "equatorialRadius"), "published 1-bar radius; the engine uses the volumetric mean radius", both(giant, hasRef("equatorialRadius"))),
      input("Polar radius", "m", "body", (c) => ref(c, "polarRadius"), undefined, both(giant, hasRef("polarRadius"))),
      derived("Mean density", "kg/m^3", "body", (c) => c.body.m / ((4 / 3) * Math.PI * c.body.radius ** 3), undefined, giant),
      ...none(["Atmospheric metallicity", "Hydrogen abundance", "Helium abundance", "Heavy-element abundance", "Core mass", "Core composition", "Core size", "Deep interior temperature", "Deep interior pressure", "Interior equation of state", "Metallic hydrogen fraction", "Helium-rain region", "Ice and volatile fractions", "Internal heat flux", "Intrinsic luminosity"], POINT),
      derived("Equilibrium temperature", "K", "body", equilibriumTemperature, (c) => `${albedoNote(c)}; no internal heat`, both(giant, irradiated)),
      ...none(["Atmospheric temperature profile", "Atmospheric pressure profile", "Cloud composition", "Cloud-top pressure", "Wind velocity field", "Zonal jet structure", "Differential rotation", "Atmospheric circulation", "Atmospheric opacity", "Atmospheric radiative timescale"], NO_FLUID),
      derived("Magnetic-field strength", "T", "body", surfaceField, "equatorial surface dipole field at the mean radius", both(giant, hasField)),
      ...none(["Magnetic multipole structure"], "dipole only"),
      input("Magnetic-axis inclination", "rad", "body", (c) => (ref(c, "dipoleTilt") * Math.PI) / 180, "published dipole tilt", both(giant, hasRef("dipoleTilt"))),
      ...none(["Magnetosphere size", "Auroral power"], NO_PLASMA),
      ...none(["Ring mass", "Ring particle-size distribution", "Ring optical depth"], "no ring model"),
      derived("Satellite system", "text", "body", (c) => {
        const moons = satellites(c)
        return moons.length ? `${moons.length}: ${moons.map((moon) => moon.name).join(", ")}` : "none in the scene"
      }, undefined, both(giant, twoPlus)),
      ...none(["Tidal dissipation"], NO_DISSIPATION),
      input("Gravitational harmonics", "text", "body", (c) => `J2 = ${ref(c, "j2").toExponential(4)}; higher harmonics not carried`, "published; not in the force law", both(giant, hasRef("j2"))),
      derived("Oblateness", "ratio", "body", flattening, "from the published radii", both(giant, hasRefs("equatorialRadius", "polarRadius"))),
      derived("Moment of inertia", "kg m^2", "body", momentOfInertia, (c) => `published factor ${ref(c, "momentOfInertiaFactor")} x M R^2`, both(giant, hasInertia)),
    ],
  },
  {
    id: "9.3",
    title: "Asteroids, comets, and small bodies",
    items: [
      state("Mass", "kg", "body", (c) => c.body.m, undefined, small),
      input("Shape", "text", "body", (c) => `oblate spheroid, a ${(ref(c, "equatorialRadius") / 1000).toFixed(1)} km, c ${(ref(c, "polarRadius") / 1000).toFixed(1)} km (published); the engine uses one mean radius`, undefined, both(small, hasRefs("equatorialRadius", "polarRadius"))),
      input("Principal dimensions", "text", "body", (c) => `${(2 * ref(c, "equatorialRadius") / 1000).toFixed(0)} x ${(2 * ref(c, "equatorialRadius") / 1000).toFixed(0)} x ${(2 * ref(c, "polarRadius") / 1000).toFixed(0)} km`, undefined, both(small, hasRefs("equatorialRadius", "polarRadius"))),
      derived("Bulk density", "kg/m^3", "body", (c) => c.body.m / ((4 / 3) * Math.PI * c.body.radius ** 3), "mass over the mean-radius sphere", small),
      ...none(["Porosity"], NO_MATERIAL),
      input("Spin period", "s", "body", (c) => Math.abs(spinPeriod(c)), "published", both(small, hasSpin)),
      ...none(["Spin-axis orientation", "Tumbling state"], NO_ROTATION),
      ...none(["Surface composition", "Spectral class"], NO_COMPOSITION),
      input("Albedo", "ratio", "body", (c) => ref(c, "bondAlbedo"), "Bond albedo", both(small, hasRef("bondAlbedo"))),
      ...none(["Thermal inertia", "Surface roughness", "Cohesion", "Tensile strength", "Friction angle", "Internal structure", "Regolith depth", "Boulders and grain-size distribution", "Fracture network"], NO_MATERIAL),
      ...none(["Impact history"], NO_HISTORY),
      derived("Orbital elements", "text", "body", (c) => `a ${(c.orbit.semiMajor / CONST.AU).toFixed(4)} AU, e ${c.orbit.eccentricity.toFixed(4)}, periapsis argument ${((c.orbit.argPeriapsis * 180) / Math.PI).toFixed(2)} deg about ${c.orbit.primary}`, "osculating; hyperbolic a is negative", both(small, hasOrbit)),
      derived("Rotation-orbit resonance", "text", "body", spinOrbit, undefined, both(small, elliptic, hasSpin)),
      ...none(["Yarkovsky acceleration", "YORP torque"], "needs thermal emission and spin; reported radiation pressure is the only light-force quantity"),
      derived("Solar-radiation pressure", "N", "body", (c) => (irradiance(c) / C) * Math.PI * c.body.radius ** 2, "F pi R^2 / c on an absorbing disk; reported only, never applied", both(small, irradiated)),
      ...none(["Outgassing acceleration", "Mass-loss rate", "Volatile inventory", "Sublimation rate", "Gas production rate", "Dust production rate", "Dust particle-size distribution", "Coma density", "Coma expansion velocity", "Tail orientation", "Tail particle distribution", "Activity onset distance", "Nucleus temperature", "Thermal conductivity", "Thermal diffusivity"], "no cometary activity model"),
      ...none(["Cratering strength", "Fragmentation threshold"], NO_MATERIAL),
      ...none(["Collision probability"], "collisions are detected, not forecast statistically"),
      ...none(["Catastrophic disruption threshold"], NO_MATERIAL),
    ],
  },
  {
    id: "9.4",
    title: "Planetary rings and debris disks",
    items: [
      ...none(["Total mass", "Radial surface-density profile", "Vertical thickness", "Particle-size distribution", "Particle composition", "Particle eccentricity distribution", "Particle inclination distribution", "Optical depth", "Ring temperature", "Albedo", "Ring opacity", "Collisional frequency", "Collision velocity distribution", "Viscosity", "Self-gravity", "Resonance structure", "Density waves", "Spiral waves", "Shepherd-moon perturbations", "Particle fragmentation rate", "Accretion rate", "Radial spreading rate", "Poynting–Robertson drag", "Radiation pressure", "Dust production rate", "Debris replenishment rate", "Disk luminosity", "Spectral energy distribution"], "no ring or disk model; every body is a single point mass"),
    ],
  },
  {
    id: "10.1",
    title: "Molecular clouds and nebulae",
    items: [
      ...none(["Total gas mass", "Dust mass", "Volume", "Shape", "Density field", "Temperature field", "Pressure field", "Velocity field", "Turbulent velocity dispersion", "Turbulent power spectrum", "Chemical composition", "Molecular abundance", "Ionization fraction", "Magnetic-field vector field", "Magnetic-field topology", "Magnetic flux", "Magnetic energy", "Gravitational potential", "Virial parameter", "Jeans mass", "Jeans length", "Free-fall time", "Sound-crossing time", "Turbulent-crossing time", "Cooling time", "Heating rate", "Cooling rate", "Radiation field", "Optical depth", "Dust opacity", "Dust-to-gas ratio", "Molecular line emissivity", "Dust emissivity", "Shock velocity", "Shock compression", "Outflow velocity", "Mass inflow rate", "Star-formation rate", "Fragmentation scale", "Protostellar accretion rate", "Radiation pressure", "Magnetic support", "Turbulent support", "Gravitational instability", "Feedback energy", "Ionization-front velocity", "Photoevaporation rate"], NO_DISTRIBUTED, "sim"),
    ],
  },
  {
    id: "10.2",
    title: "Star formation and feedback",
    items: [
      ...none(["Initial mass function", "Stellar birth mass distribution", "Star-formation efficiency", "Core mass function", "Protostellar mass", "Protostellar radius", "Accretion rate", "Accretion luminosity", "Angular-momentum transport", "Disk mass", "Disk temperature", "Outflow mass flux", "Outflow momentum flux", "Magnetic braking", "Radiation pressure", "Ionizing photon rate", "Photoionization heating", "Stellar-wind power", "Supernova energy injection", "Supernova ejecta mass", "Chemical enrichment rate", "Metal mixing rate", "Gas recycling rate", "Cloud dispersal timescale"], NO_DISTRIBUTED, "sim"),
    ],
  },
  {
    id: "11.1",
    title: "Star clusters",
    items: [
      derived("Total mass", "kg", "system", (c) => clusterStats(c.world.bodies).mass, "the scene treated as a cluster of N point masses", cluster),
      ...none(["Stellar mass function"], "too few members for a distribution", "system"),
      derived("Number of members", "count", "system", (c) => c.world.bodies.length, undefined, cluster),
      derived("Mass distribution", "text", "system", (c) => {
        const masses = c.world.bodies.map((body) => body.m)
        return `${Math.min(...masses).toExponential(3)} to ${Math.max(...masses).toExponential(3)} kg`
      }, undefined, cluster),
      ...none(["Density profile", "Velocity-dispersion profile", "Velocity anisotropy", "Core radius"], "no smooth profile for a handful of bodies", "system"),
      derived("Half-mass radius", "m", "system", (c) => clusterStats(c.world.bodies).halfMass, "radius about the barycenter enclosing half the mass", cluster),
      ...none(["Half-light radius"], NO_RADIATION, "system"),
      ...none(["Tidal radius"], NO_ENV, "system"),
      derived("Escape speed", "m/s", "system", (c) => {
        const stats = clusterStats(c.world.bodies)
        return Math.sqrt((2 * G * stats.mass) / stats.halfMass)
      }, "sqrt(2GM / r_half), point-mass approximation", cluster),
      derived("Crossing time", "s", "system", (c) => {
        const stats = clusterStats(c.world.bodies)
        return stats.halfMass / stats.dispersion
      }, "r_half over the mass-weighted rms speed", cluster),
      derived("Relaxation time", "s", "system", (c) => {
        const stats = clusterStats(c.world.bodies)
        return ((0.1 * stats.count) / Math.log(stats.count)) * (stats.halfMass / stats.dispersion)
      }, "Spitzer estimate 0.1 N / ln N crossing times; indicative only for small N", cluster),
      ...none(["Evaporation time", "Mass segregation", "Binary fraction", "Stellar collision rate", "Stellar merger rate", "Central density", "Core-collapse time"], "statistical cluster quantities need many members", "system"),
      derived("Gravitational potential", "J", "system", (c) => potentialEnergy(c.world.bodies), "total potential energy, each pair once", cluster),
      ...none(["Orbital distribution", "Tidal stripping rate", "Cluster rotation", "Escape fraction", "Remnant population", "Dark-matter content, where applicable"], "statistical cluster quantities need many members", "system"),
    ],
  },
  {
    id: "11.2",
    title: "Galaxies",
    items: [
      ...none(["Total mass", "Stellar mass", "Gas mass", "Dust mass", "Dark-matter mass", "Baryonic mass", "Mass profile", "Density profile", "Gravitational potential", "Rotation curve", "Circular velocity", "Velocity-dispersion profile", "Stellar velocity anisotropy", "Angular momentum", "Spin parameter", "Bulge mass", "Disk mass", "Disk scale length", "Disk thickness", "Halo mass", "Halo concentration", "Halo spin", "Halo density profile", "Central black-hole mass", "Star-formation rate", "Stellar age distribution", "Stellar metallicity distribution", "Gas metallicity", "Gas temperature", "Gas density", "Gas inflow rate", "Gas outflow rate", "Merger history", "Tidal features", "Bar strength", "Spiral structure", "Pattern speed", "Central gas concentration", "Dust attenuation", "Total luminosity", "Spectral energy distribution", "Galaxy morphology", "Environment", "Satellite population", "Feedback energy", "Black-hole accretion rate", "Cosmic-ray pressure, where modeled"], NO_DISTRIBUTED, "sim"),
    ],
  },
  {
    id: "11.3",
    title: "Galaxy clusters and the cosmic web",
    items: [
      ...none(["Total gravitating mass", "Baryonic mass", "Dark-matter distribution", "Gas mass", "Hot-gas temperature", "Gas density profile", "Pressure profile", "Entropy profile", "X-ray luminosity", "Gravitational lensing mass", "Velocity dispersion", "Cluster radius", "Virial radius", "Merger history", "Shock heating", "Turbulent pressure support", "Magnetic-field strength", "Cosmic-ray population", "Cooling-flow rate", "Feedback power", "Substructure mass", "Filament density", "Filament velocity", "Intergalactic gas temperature", "Baryon fraction", "Large-scale expansion", "Density contrast", "Peculiar velocity field"], NO_COSMO, "sim"),
    ],
  },
  {
    id: "12.1",
    title: "Binary-system properties",
    items: [
      derived("Component masses", "text", "body", (c) => `${c.body.m.toExponential(4)} kg and ${c.orbit.primaryBody.m.toExponential(4)} kg (${c.orbit.primary})`, "this body and its strongest partner", hasOrbit),
      derived("Component radii", "text", "body", (c) => `${c.body.radius.toExponential(4)} m and ${c.orbit.primaryBody.radius.toExponential(4)} m`, undefined, hasOrbit),
      derived("Mass ratio", "ratio", "body", (c) => c.orbit.massRatio, "m / M, this body over the partner", hasOrbit),
      derived("Total mass", "kg", "body", (c) => c.body.m + c.orbit.primaryBody.m, undefined, hasOrbit),
      derived("Reduced mass", "kg", "body", (c) => c.orbit.reducedMass, undefined, hasOrbit),
      derived("Barycenter position", "vec m", "body", (c) => {
        const b = barycenter([c.body, c.orbit.primaryBody])
        return { x: b.x, y: b.y }
      }, "of the pair", hasOrbit),
      derived("Barycenter velocity", "vec m/s", "body", (c) => {
        const b = barycenter([c.body, c.orbit.primaryBody])
        return { x: b.vx, y: b.vy }
      }, "of the pair", hasOrbit),
      derived("Semimajor axis", "m", "body", (c) => c.orbit.semiMajor, "osculating", elliptic),
      derived("Eccentricity", "ratio", "body", (c) => c.orbit.eccentricity, undefined, hasOrbit),
      input("Inclination", "rad", "body", () => 0, "single simulation plane", hasOrbit),
      derived("Orbital period", "s", "body", (c) => c.orbit.period, undefined, elliptic),
      derived("Orbital phase", "ratio", "body", (c) => c.orbit.meanAnomaly / TAU, "mean anomaly over 2 pi", elliptic),
      derived("Argument of periapsis", "rad", "body", (c) => c.orbit.argPeriapsis, "from the +x axis", hasOrbit),
      ...none(["Longitude of ascending node"], PLANAR),
      derived("Orbital angular momentum", "kg m^2/s", "body", (c) => c.orbit.orbitalAngularMomentum, undefined, hasOrbit),
      derived("Orbital energy", "J", "body", (c) => c.orbit.orbitalEnergy, undefined, hasOrbit),
      derived("Pericenter distance", "m", "body", (c) => c.orbit.periapsis, undefined, hasOrbit),
      derived("Apoapsis distance", "m", "body", (c) => c.orbit.apoapsis, undefined, elliptic),
      derived("Roche-lobe radii", "text", "body", (c) => {
        const mine = rocheLobe(c)
        const q = 1 / c.orbit.massRatio
        const q23 = Math.cbrt(q * q)
        const theirs = (c.orbit.semiMajor * 0.49 * q23) / (0.6 * q23 + Math.log(1 + Math.cbrt(q)))
        return `${mine.toExponential(4)} m (${c.body.name}), ${theirs.toExponential(4)} m (${c.orbit.primary})`
      }, "Eggleton 1983 for both components", elliptic),
      derived("Roche-lobe filling factors", "text", "body", (c) => {
        const mine = c.body.radius / rocheLobe(c)
        const q = 1 / c.orbit.massRatio
        const q23 = Math.cbrt(q * q)
        const theirs = c.orbit.primaryBody.radius / ((c.orbit.semiMajor * 0.49 * q23) / (0.6 * q23 + Math.log(1 + Math.cbrt(q))))
        return `${mine.toExponential(3)} (${c.body.name}), ${theirs.toExponential(3)} (${c.orbit.primary})${Math.max(mine, theirs) >= 1 ? "; a lobe is overflowing, no transfer modeled" : ""}`
      }, undefined, elliptic),
      derived("Tidal synchronization state", "text", "body", (c) => {
        const ratio = c.orbit.period / Math.abs(spinPeriod(c))
        return Math.abs(ratio - 1) < 0.01 ? "synchronous" : `not synchronous, ${ratio.toFixed(3)} rotations per orbit`
      }, "published rotation against the osculating period", both(elliptic, hasSpin)),
      ...none(["Spin-orbit alignment"], NO_ROTATION),
      ...none(["Mass-transfer rate", "Accretion rate", "Angular-momentum transfer rate"], NO_ACCRETION),
      ...none(["Tidal heating rate"], NO_DISSIPATION),
      derived("Orbital decay rate", "m/s", "body", gwDecay, "Peters 1964 da/dt from gravitational waves; reported only, never applied", elliptic),
      derived("Gravitational-wave frequency", "1/s", "body", (c) => 2 / c.orbit.period, "twice the orbital frequency, dominant harmonic", elliptic),
      derived("Gravitational-wave luminosity", "W", "body", gwPower, "Peters 1964", elliptic),
      derived("Merger time estimate", "s", "body", gwMergerTime, "Peters circular-orbit time scaled by (1 - e^2)^(7/2); gravitational waves only, not applied", elliptic),
      derived("Post-merger remnant properties", "text", "body", (c) => {
        const remnant = predictRemnant(c.body, c.orbit.primaryBody)
        return `${remnant.kind} "${remnant.name}", ${remnant.mass.toExponential(4)} kg, radius ${remnant.radius.toExponential(4)} m`
      }, "remnant rule for this pair if they touch", hasOrbit),
    ],
  },
  {
    id: "12.2",
    title: "Collision and merger parameters",
    items: [
      derived("Impact speed", "m/s", "body", (c) => contact(c).speed, (c) => `relative speed at contact with ${contact(c).other.name} if the pair fell to contact from the current state, by energy conservation`, twoPlus),
      derived("Relative velocity vector", "vec m/s", "body", (c) => {
        const pair = contact(c)
        return { x: pair.dvx, y: pair.dvy }
      }, "nearest body minus this body", twoPlus),
      derived("Impact parameter", "m", "body", (c) => contact(c).impactParameter, "|r x v| / |v| for the nearest body", twoPlus),
      derived("Impact angle", "text", "body", (c) => {
        const pair = contact(c)
        if (pair.sine > 1) return "no contact on the current two-body path"
        return `${((Math.asin(pair.sine) * 180) / Math.PI).toFixed(1)} degrees from the vertical`
      }, "angular-momentum conservation for a two-body approach", twoPlus),
      input("Contact geometry", "text", "body", () => "two rigid spheres touching at the sum of their radii"),
      derived("Mass ratio", "ratio", "body", (c) => c.body.m / contact(c).other.m, "this body over the nearest body", twoPlus),
      derived("Density ratio", "ratio", "body", (c) => {
        const other = contact(c).other
        return (c.body.m / c.body.radius ** 3) / (other.m / other.radius ** 3)
      }, undefined, (c) => (twoPlus(c) && notBH(c) && contact(c).other.kind !== "blackhole" ? true : "needs two bodies with material radii")),
      derived("Radius ratio", "ratio", "body", (c) => c.body.radius / contact(c).other.radius, undefined, twoPlus),
      derived("Center-of-mass velocity", "vec m/s", "body", (c) => {
        const b = barycenter([c.body, contact(c).other])
        return { x: b.vx, y: b.vy }
      }, "of the pair", twoPlus),
      derived("Total momentum", "vec kg m/s", "body", (c) => totalMomentum([c.body, contact(c).other]), "of the pair", twoPlus),
      derived("Total kinetic energy", "J", "body", (c) => kineticEnergy([c.body, contact(c).other]), "of the pair in the inertial frame", twoPlus),
      derived("Impact kinetic energy", "J", "body", (c) => {
        const pair = contact(c)
        return 0.5 * pair.reduced * pair.speed ** 2
      }, "mu v_contact^2 / 2, the energy the merger would dissipate", twoPlus),
      derived("Gravitational binding energy", "J", "body", (c) => {
        const remnant = contact(c).remnant
        return (3 * G * remnant.mass * remnant.mass) / (5 * remnant.radius)
      }, "3GM^2 / 5R of the merged remnant, uniform sphere", (c) => (twoPlus(c) && contact(c).remnant.kind !== "blackhole" ? true : "the remnant would be a black hole")),
      derived("Specific impact energy", "J/kg", "body", (c) => {
        const pair = contact(c)
        return (0.5 * pair.reduced * pair.speed ** 2) / (c.body.m + pair.other.m)
      }, "Q = mu v^2 / 2 M_total; compare with the catastrophic-disruption threshold the model does not have", twoPlus),
      ...none(["Material strength", "Porosity", "Equation of state", "Shock speed", "Shock pressure", "Peak temperature", "Vaporized fraction", "Melt fraction", "Fragmentation threshold"], NO_MATERIAL),
      derived("Largest-remnant mass", "kg", "body", (c) => contact(c).remnant.mass, "the whole pair; the merger keeps all mass", twoPlus),
      input("Ejecta mass", "kg", "body", () => 0, "perfect merger, nothing escapes"),
      ...none(["Ejecta velocity distribution"], NO_MATERIAL),
      input("Momentum-transfer efficiency", "ratio", "body", () => 1, "momentum is fully conserved into the remnant"),
      derived("Energy-dissipation fraction", "ratio", "body", (c) => {
        const pair = contact(c)
        const total = kineticEnergy([c.body, pair.other])
        return total > 0 ? (0.5 * pair.reduced * pair.speed ** 2) / total : null
      }, "center-of-mass kinetic energy at contact over the pair's inertial kinetic energy; all of it is lost in the merger", twoPlus),
      ...none(["Spin imparted by impact"], "the pair's orbital angular momentum about its barycenter is dropped at merger; no spin state receives it"),
      input("Angular momentum of ejecta", "kg m^2/s", "body", () => 0, "no ejecta"),
      ...none(["Debris distribution"], NO_MATERIAL),
      input("Remnant shape", "text", "body", () => "sphere with the combined volume, or the compact-remnant radius rule"),
      ...none(["Reaccumulation timescale"], NO_MATERIAL),
    ],
  },
  {
    id: "12.3",
    title: "Gravitational-wave sources",
    items: [
      derived("Component masses", "text", "body", (c) => `${c.body.m.toExponential(4)} kg and ${c.orbit.primaryBody.m.toExponential(4)} kg`, undefined, elliptic),
      ...none(["Component spins", "Spin-orbit misalignment"], NO_ROTATION),
      derived("Orbital eccentricity", "ratio", "body", (c) => c.orbit.eccentricity, undefined, elliptic),
      ...none(["Orbital inclination"], NO_SKY),
      derived("Orbital frequency", "1/s", "body", (c) => 1 / c.orbit.period, undefined, elliptic),
      derived("Inspiral rate", "m/s", "body", gwDecay, "Peters da/dt; reported only", elliptic),
      derived("Chirp mass", "kg", "body", chirpMass, "(m1 m2)^(3/5) / (m1 + m2)^(1/5)", elliptic),
      ...none(["Gravitational-wave strain"], NO_SKY),
      derived("Gravitational-wave frequency", "1/s", "body", (c) => 2 / c.orbit.period, "dominant harmonic", elliptic),
      derived("Frequency derivative", "1/s^2", "body", (c) => {
        const f = 2 / c.orbit.period
        const scale = (G * chirpMass(c)) / C ** 3
        return (96 / 5) * Math.PI ** (8 / 3) * scale ** (5 / 3) * f ** (11 / 3)
      }, "leading-order chirp, circular orbit", elliptic),
      ...none(["Inspiral phase", "Waveform amplitude", "Polarization", "Luminosity distance"], NO_SKY),
      derived("Orbital energy loss", "W", "body", gwPower, "Peters 1964", elliptic),
      derived("Angular-momentum loss", "kg m^2/s^2", "body", gwAngularLoss, "Peters 1964", elliptic),
      ...none(["Tidal deformability"], "no equation of state"),
      derived("Merger frequency", "1/s", "body", (c) => C ** 3 / (Math.pow(6, 1.5) * Math.PI * (c.body.gm + c.orbit.primaryBody.gm)), "Schwarzschild ISCO gravitational-wave frequency for the total mass", pairIsBH),
      ...none(["Remnant mass", "Remnant spin", "Recoil velocity"], "radiated mass, spin, and kicks are not modeled; the merger keeps the full mass"),
      derived("Ringdown frequency", "1/s", "body", (c) => (0.37367 * C ** 3) / (TAU * (c.body.gm + c.orbit.primaryBody.gm)), "l = 2, n = 0 Schwarzschild mode of the combined mass", remnantIsBH),
      derived("Ringdown damping time", "s", "body", (c) => (c.body.gm + c.orbit.primaryBody.gm) / (0.08896 * C ** 3), undefined, remnantIsBH),
      ...none(["Energy radiated"], NO_GR),
      ...none(["Signal-to-noise ratio, for a specified detector", "Detector-frame parameters", "Source-frame parameters", "Parameter-estimation uncertainties"], NO_SKY),
    ],
  },
  {
    id: "13",
    title: "The surrounding environment and external influences",
    items: [
      input("External gravitational field", "text", "sim", () => "none; only the bodies in the scene attract each other"),
      ...none(["Galactic tidal field", "Stellar radiation field", "Background radiation field", "Solar wind", "Stellar wind", "Interstellar medium density", "Interstellar medium temperature", "Interstellar magnetic field", "Ambient plasma density", "Ambient plasma velocity", "Gas drag", "Aerodynamic drag"], NO_ENV, "sim"),
      derived("Radiation pressure", "N/m^2", "body", (c) => irradiance(c) / C, "from luminous stars in the scene; reported only", irradiated),
      ...none(["Poynting–Robertson drag", "Magnetic Lorentz force", "Electric force", "Charged-particle drag", "Dynamical friction", "Tidal heating", "Atmospheric drag", "Mass accretion from surroundings", "Environmental stripping", "External torque", "Cosmic-ray flux", "Neutrino flux", "Photon flux", "Ambient pressure", "Shock-front passage", "Nearby supernova exposure", "Tidal encounter with another system", "Radiation exposure", "External heating rate", "External cooling rate"], NO_ENV, "sim"),
    ],
  },
  {
    id: "14",
    title: "Cosmology and the universe itself",
    items: [
      ...none(["Cosmological scale factor", "Hubble parameter", "Hubble constant", "Expansion rate", "Deceleration parameter", "Cosmological redshift", "Proper distance", "Comoving distance", "Luminosity distance", "Angular-diameter distance", "Lookback time", "Cosmic age", "Critical density", "Matter density parameter", "Radiation density parameter", "Dark-energy density parameter", "Curvature density parameter", "Equation-of-state parameter for dark energy", "Density perturbation amplitude", "Matter power spectrum", "Primordial spectral index", "Structure growth rate", "Growth factor", "Peculiar velocity", "Cosmic microwave background temperature", "Recombination epoch", "Reionization history", "Cosmic baryon fraction", "Dark-matter distribution", "Large-scale density field", "Cosmic-web structure", "Gravitational-lensing convergence", "Gravitational-lensing shear"], NO_COSMO, "sim"),
    ],
  },
  {
    id: "15.1",
    title: "Particle properties",
    items: [
      ...none(["Rest mass", "Electric charge", "Spin", "Magnetic moment", "Lepton number", "Baryon number", "Flavor", "Particle-antiparticle identity", "Energy", "Momentum", "Velocity", "Lorentz factor", "Phase-space distribution", "Number density", "Chemical potential", "Temperature, for a thermal population", "Polarization", "Interaction cross sections", "Decay rate", "Mean lifetime", "Mean free path", "Collision frequency", "Production rate", "Annihilation rate", "Scattering rate", "Diffusion coefficient", "Energy-loss rate", "Escape rate"], NO_PARTICLES, "sim"),
    ],
  },
  {
    id: "15.2",
    title: "Neutrinos",
    items: [
      ...none(["Neutrino species", "Neutrino energy spectrum", "Neutrino luminosity", "Neutrino flux", "Neutrino number density", "Neutrino temperature, when meaningful", "Neutrino angular distribution", "Flavor fractions", "Flavor oscillation parameters", "Neutrino interaction rates", "Neutrino opacity", "Neutrino mean free path", "Neutrino heating rate", "Neutrino cooling rate", "Neutrino energy deposition", "Neutrino momentum deposition", "Neutrino emission timescale", "Neutrino transport regime"], NO_PARTICLES, "sim"),
    ],
  },
  {
    id: "15.3",
    title: "Nuclear matter and extreme states",
    items: [
      ...none(["Baryon density", "Neutron fraction", "Proton fraction", "Electron fraction", "Nuclear saturation density", "Nuclear symmetry energy", "Nuclear incompressibility", "Effective nucleon mass", "Chemical potentials", "Pressure-density relation", "Energy-density relation", "Sound speed", "Pairing gaps", "Superfluid transition temperature", "Superconducting transition temperature", "Nuclear reaction rates", "Nuclear binding energy", "Phase-transition pressure", "Phase-transition density", "Latent heat", "Hyperon fraction", "Quark fraction", "Deconfinement threshold", "Quark-matter equation of state", "Color-superconducting phase parameters, where modeled", "Bulk viscosity", "Shear viscosity", "Thermal conductivity", "Neutrino emissivity", "Tidal deformability"], NO_PARTICLES, "sim"),
    ],
  },
  {
    id: "16.1",
    title: "Gravitational events",
    items: [
      derived("Close approach", "text", "body", (c) => `next periapsis ${c.orbit.periapsis.toExponential(4)} m from ${c.orbit.primary} in ${(c.orbit.timeToPeriapsis / 86400).toFixed(2)} days`, "from the osculating orbit", elliptic),
      derived("Flyby", "text", "body", (c) => `hyperbolic pass of ${c.orbit.primary}: periapsis ${c.orbit.periapsis.toExponential(4)} m, v_infinity ${c.orbit.vInfinity.toExponential(3)} m/s`, undefined, unbound),
      derived("Gravitational capture", "text", "body", (c) => (c.orbit.bound ? `bound to ${c.orbit.primary}` : `not bound to ${c.orbit.primary}`), "state, not a logged transition", hasOrbit),
      derived("Escape", "text", "body", (c) => {
        const energy = systemEnergy(c)
        return energy > 0 ? `leaving the system: specific energy ${energy.toExponential(3)} J/kg in the barycentric frame` : `bound to the system: specific energy ${energy.toExponential(3)} J/kg`
      }, "energy relative to every body in the scene", twoPlus),
      ...none(["Orbital resonance crossing", "Resonance capture"], NO_EVENT),
      derived("Orbital instability", "text", "body", hillSeparation, "Gladman 1993 Hill criterion against the nearest neighbor orbit", hasSibling),
      derived("Collision", "text", "sim", (c) => `${c.world.stats?.merges ?? 0} contact collisions so far; detected by overlap of true radii every substep`),
      derived("Merger", "text", "sim", (c) => `${c.world.stats?.merges ?? 0} perfectly inelastic mergers so far`),
      ...none(["Tidal disruption"], "Roche crossings are reported, not acted on"),
      derived("Roche-lobe overflow", "text", "body", (c) => {
        const fill = c.body.radius / rocheLobe(c)
        return fill >= 1 ? `overflowing, filling factor ${fill.toFixed(3)}; no mass transfer modeled` : `not overflowing, filling factor ${fill.toExponential(3)}`
      }, "condition only", both(elliptic, notBH)),
      ...none(["Tidal synchronization", "Orbital migration", "Orbital decay"], NO_DISSIPATION),
      derived("Three-body ejection", "text", "body", (c) => (systemEnergy(c) > 0 ? "on an escaping path from the system" : "still bound to the system"), "barycentric energy sign; needs three or more bodies", (c) => (c.world.bodies.length >= 3 ? true : "needs at least three bodies")),
      derived("Gravitational slingshot", "text", "body", (c) => `deflection ${((2 * Math.asin(1 / c.orbit.eccentricity) * 180) / Math.PI).toFixed(1)} degrees in the frame of ${c.orbit.primary}`, "two-body hyperbolic turning angle 2 asin(1/e)", unbound),
      ...none(["Binary hardening"], NO_EVENT),
      ...none(["Gravitational-wave inspiral"], "reported in 12.1 and 12.3 but not applied; no inspiral happens"),
      derived("Black-hole merger", "text", "sim", () => "a contact merger involving a black hole, or a neutron-star merger above 2.5 Msun, yields a Schwarzschild black hole with the summed mass"),
      derived("Neutron-star merger", "text", "sim", () => "neutron stars merge into a 12 km neutron star, or a black hole above 2.5 Msun; no ejecta or kilonova"),
      ...none(["Gravitational recoil"], NO_GR),
    ],
  },
  {
    id: "16.2",
    title: "Stellar events",
    items: [
      ...none(["Core ignition", "Nuclear fuel exhaustion", "Helium flash", "Shell flash", "Thermal pulse", "Stellar flare", "Coronal mass ejection", "Stellar-wind eruption", "Mass-transfer onset", "Common-envelope onset", "Nova eruption", "Supernova explosion", "Electron-capture collapse", "Pair-instability event", "Core collapse"], NO_EVOLUTION, "sim"),
      derived("Remnant formation", "text", "sim", () => "only through contact mergers: white dwarf above 1.44 Msun becomes a neutron star, neutron star above 2.5 Msun becomes a black hole"),
      ...none(["Fallback accretion", "White-dwarf cooling transition", "Neutron-star glitch", "Magnetar burst", "Pulsar spin-up", "Pulsar spin-down"], NO_EVOLUTION, "sim"),
    ],
  },
  {
    id: "16.3",
    title: "Planetary and small-body events",
    items: [
      derived("Impact", "text", "sim", (c) => `${c.world.stats?.merges ?? 0} impacts so far, each a perfectly inelastic merger at contact of true radii`),
      ...none(["Cratering", "Catastrophic disruption", "Fragmentation", "Gravitational reaccumulation"], NO_MATERIAL, "sim"),
      ...none(["Atmospheric entry", "Ablation"], NO_FLUID, "sim"),
      ...none(["Tidal heating"], NO_DISSIPATION, "sim"),
      ...none(["Volcanic eruption", "Cryovolcanic eruption"], POINT, "sim"),
      ...none(["Atmospheric escape", "Runaway greenhouse, in an appropriate climate model", "Runaway ice-albedo transition"], NO_FLUID, "sim"),
      ...none(["Ring formation", "Ring disruption"], "no ring model", "sim"),
      derived("Satellite capture", "text", "body", (c) => (c.orbit.bound ? `currently bound to ${c.orbit.primary}` : `currently unbound from ${c.orbit.primary}`), "state only; captures are not logged as events", hasOrbit),
      derived("Satellite ejection", "text", "body", (c) => (systemEnergy(c) > 0 ? "escaping the system" : "bound to the system"), "state only", twoPlus),
      derived("Roche-limit crossing", "text", "body", (c) => {
        const limit = rocheLimit(c)
        return c.orbit.distance < limit ? `inside the rigid Roche limit (${limit.toExponential(3)} m); no breakup modeled` : `outside the rigid Roche limit (${limit.toExponential(3)} m)`
      }, "condition only", both(hasOrbit, notBH)),
      derived("Tidal locking", "text", "body", (c) => {
        const ratio = c.orbit.period / Math.abs(spinPeriod(c))
        return Math.abs(ratio - 1) < 0.01 ? "locked (published rotation equals the orbit)" : "not locked"
      }, "from reference rotation; no tidal evolution", both(elliptic, hasSpin)),
      ...none(["Resonance capture"], NO_EVENT, "sim"),
      ...none(["Cometary outburst", "Sublimation onset", "Outgassing change"], "no cometary activity model", "sim"),
    ],
  },
  {
    id: "16.4",
    title: "Galactic and environmental events",
    items: [
      ...none(["Galaxy encounter", "Galaxy merger", "Tidal stripping", "Ram-pressure stripping", "Starburst", "Active galactic nucleus activation", "Accretion-disk state transition", "Jet launch", "Jet disruption", "Stellar feedback episode", "Supernova-driven shock", "Star-cluster core collapse", "Black-hole binary formation", "Black-hole binary hardening", "Gas inflow", "Gas outflow", "Gravitational-wave recoil", "Environmental quenching"], NO_DISTRIBUTED, "sim"),
    ],
  },
  {
    id: "17.1",
    title: "Numerical integration",
    items: [
      input("Integrator type", "text", "sim", () => "velocity Verlet, kick-drift-kick, symplectic"),
      input("Integration order", "count", "sim", () => 2),
      input("Fixed or adaptive step size", "text", "sim", () => "adaptive, one shared step for all bodies"),
      derived("Current step size", "s", "sim", (c) => c.world.stats.lastStep || null),
      derived("Minimum step size", "s", "sim", (c) => (Number.isFinite(c.world.stats.minStep) ? c.world.stats.minStep : null), "smallest substep so far"),
      derived("Maximum step size", "s", "sim", (c) => c.sim.timeScale / Math.max(c.sim.frameRate, 1), "one frame of playback"),
      ...none(["Absolute error tolerance", "Relative error tolerance", "Local truncation error estimate", "Global error estimate"], "no local error estimator; the step follows the free-fall time, and energy drift is reported separately", "sim"),
      input("Error-control method", "text", "sim", () => "step = 0.003 x min over pairs of sqrt(r^3 / mu), plus a closing-speed limit near contact"),
      derived("Force-evaluation count", "count", "sim", (c) => c.world.stats.forceEvals),
      derived("Integration-step count", "count", "sim", (c) => c.world.stats.steps),
      input("Rejected-step count", "count", "sim", () => 0, "no step rejection"),
      derived("Convergence status", "text", "sim", (c) => (c.world.limited ? "step cap reached, simulated time held back this frame" : "within the step budget")),
      input("Floating-point precision", "text", "sim", () => "IEEE 754 binary64"),
      input("Coordinate formulation", "text", "sim", () => "Cartesian inertial, SI"),
      ...none(["Interpolation method"], "bodies are drawn at the end of the last substep", "sim"),
      input("Dense-output capability", "text", "sim", () => "forecast samples for the throw preview only"),
      ...none(["Event-location tolerance"], "collisions are resolved at the end of a substep, no root finding", "sim"),
      input("Collision-detection tolerance", "text", "sim", () => "overlap of true radii, checked every substep"),
      input("Force approximation", "text", "sim", () => "direct summation over all pairs"),
      input("Softening length, if intentionally used", "m", "sim", () => 0, "none"),
      input("Tree-opening criterion, if a tree method is used", "text", "sim", () => "not applicable, direct N^2"),
      input("Parallelization settings", "text", "sim", () => "single thread"),
      input("Determinism settings", "text", "sim", () => "deterministic; no random numbers in the physics"),
      input("Random seed, when stochastic models are used", "text", "sim", () => "not applicable"),
    ],
  },
  {
    id: "17.2",
    title: "Physical-model configuration",
    items: [
      input("Active force models", "text", "sim", () => "Newtonian point-mass gravity"),
      input("Active radiation models", "text", "sim", () => "none"),
      input("Active collision models", "text", "sim", () => "perfectly inelastic merger on contact of true radii; momentum and mass conserved"),
      input("Active stellar-evolution model", "text", "sim", () => "none; remnant kind rules only (Chandrasekhar 1.44 Msun, TOV 2.5 Msun)"),
      input("Active equation of state", "text", "sim", () => "none; white dwarf R proportional to M^(-1/3) from Sirius B, neutron star 12 km"),
      input("Active relativistic approximation", "text", "sim", () => "none in the dynamics; exterior Schwarzschild quantities are reported only"),
      input("Active tidal model", "text", "sim", () => "none"),
      input("Active material-strength model", "text", "sim", () => "none"),
      input("Active atmosphere model", "text", "sim", () => "none"),
      input("Active particle-transport model", "text", "sim", () => "none"),
      input("External-field configuration", "text", "sim", () => "none"),
      input("Boundary conditions", "text", "sim", () => "open, unbounded plane"),
      derived("Initial conditions", "text", "sim", (c) => c.sim.scene ?? "custom"),
      ...none(["Initial-state uncertainties"], "uncertainties are not carried", "sim"),
      input("Model assumptions", "text", "sim", () => "point masses, rigid spheres for contact, planar motion, Newtonian gravity, instantaneous merger"),
      input("Parameter sources", "text", "sim", () => "JPL/NASA GM and radii, IAU nominal solar GM and radius, CODATA 2018 G, J2000 mean elements"),
      input("Model-validity domain", "text", "sim", () => "v much less than c, separations much larger than the Schwarzschild radius, no tidal or fluid behavior"),
      derived("Model version", "text", "sim", () => `registry ${REGISTRY_VERSION}`),
      input("Model limitations", "text", "sim", () => "no relativity, tides, rotation, radiation, drag, fragmentation, or stellar evolution"),
      derived("Approximation flags", "text", "sim", (c) => {
        const flags = ["planar", "point-mass", "newtonian", "inelastic-merger"]
        if (fastestFraction(c.world) > 0.05) flags.push("relativistic-speeds-present")
        return flags.join(", ")
      }),
    ],
  },
  {
    id: "17.3",
    title: "Scientific validation",
    items: [
      derived("Total-energy drift", "ratio", "system", (c) => energyDrift(c.world)),
      derived("Momentum drift", "ratio", "system", (c) => momentumDrift(c.world)),
      derived("Angular-momentum drift", "ratio", "system", (c) => angularMomentumDrift(c.world)),
      derived("Mass conservation error", "ratio", "system", (c) => massDrift(c.world), "zero by construction; mergers add masses exactly"),
      ...none(["Charge conservation error, where applicable"], "no charge", "system"),
      ...none(["Constraint violations"], "no constraints beyond the equations of motion", "system"),
      input("Reference-solution error", "text", "sim", () => "node tests: Earth period and ellipse, figure-eight closure, Jupiter deflection, impact merger"),
      input("Trajectory convergence", "text", "sim", () => "Sun-Earth closure agrees within 2e-4 at 20 days/s and 1 yr/s playback"),
      ...none(["Event-time convergence", "Collision-outcome convergence", "Sensitivity to integration tolerance", "Sensitivity to initial conditions", "Sensitivity to physical parameters", "Uncertainty propagation"], "no ensemble or tolerance sweep is run", "sim"),
      derived("Numerical stability", "text", "sim", (c) => `${c.world.stats.capHits} frames held for accuracy so far`),
      input("Reproducibility", "text", "sim", () => "deterministic from a saved snapshot"),
      derived("Run metadata", "text", "sim", (c) => `${c.world.stats.steps} steps, ${c.world.stats.forceEvals} force evaluations, ${c.world.bodies.length} bodies`),
      input("Output precision", "text", "sim", () => "binary64 internally; display values are rounded"),
      derived("Solver warnings", "text", "sim", (c) => (c.world.limited ? "step cap reached this frame" : "none")),
      derived("Model-validity warnings", "text", "sim", (c) => {
        const beta = fastestFraction(c.world)
        return beta > 0.05 ? `fastest body at ${beta.toFixed(3)} c; Newtonian model is outside its domain` : "none"
      }),
    ],
  },
  {
    id: "17.4",
    title: "Playback and visualization",
    items: [
      state("Physical simulation time", "s", "sim", (c) => c.world.time),
      derived("Wall-clock time", "s", "sim", (c) => c.sim.wallSeconds),
      derived("Playback rate", "text", "sim", (c) => `${c.sim.timeScale.toExponential(3)} simulated seconds per real second`),
      derived("Integration step size", "s", "sim", (c) => c.world.stats.lastStep || null),
      derived("Render-frame rate", "1/s", "sim", (c) => c.sim.frameRate),
      input("Display interpolation interval", "text", "sim", () => "none"),
      derived("Camera position", "vec m", "sim", (c) => ({ x: c.sim.camera.x, y: c.sim.camera.y })),
      input("Camera orientation", "text", "sim", () => "fixed, looking down on the plane"),
      input("Camera projection", "text", "sim", () => "orthographic"),
      derived("Viewport dimensions", "text", "sim", (c) => `${c.sim.viewport.w} x ${c.sim.viewport.h} px`),
      derived("World-to-screen scale", "m/px", "sim", (c) => c.sim.camera.mpp),
      input("Physical-radius-to-display-radius mapping", "text", "sim", () => "true radius when at least 2 px; otherwise a 3.2 px marker (black holes 4.5 px). Collisions always use true radii"),
      input("Trail history length", "count", "sim", () => 720, "samples per body"),
      input("Trail sampling interval", "text", "sim", () => "a new sample after 0.35 px of on-screen motion"),
      input("Displayed coordinate frame", "text", "sim", () => "inertial; the camera pans, bodies do not re-center"),
      input("Label positions", "text", "sim", () => "to the right of each body"),
      derived("Visible-body set", "text", "sim", (c) => {
        const names = c.world.bodies.map((body) => body.name)
        if (!names.length) return "empty scene"
        return names.length > 8 ? `${names.slice(0, 8).join(", ")} and ${names.length - 8} more` : names.join(", ")
      }),
      derived("Object selection", "text", "sim", (c) => c.body?.name ?? "none"),
      ...none(["Time-history range"], "no rewind; states are not stored", "sim"),
      input("Diagnostic sampling interval", "text", "sim", () => "every rendered frame"),
    ],
  },
  {
    id: "18",
    title: "Data model",
    items: [
      derived("Core state", "text", "sim", () => "per body: id, name, class, GM, contact radius, x, y, vx, vy in SI; z is absent because the engine is planar"),
      input("Model parameters", "text", "sim", () => "G (CODATA 2018), c, preset GM and radii (JPL/IAU), remnant thresholds 1.44 and 2.5 Msun, step law 0.003 x free-fall time"),
      ...none(["Model state"], "no evolving internal variables; bodies have no interior, so nothing attaches between steps", "sim"),
      derived("Derived state", "text", "sim", () => "acceleration from the last force evaluation, osculating two-body elements, and every derived row of this registry"),
      ...none(["Observables"], NO_SKY, "sim"),
      derived("Diagnostics", "text", "sim", (c) => `energy, momentum, angular-momentum, and mass drift since the last reset; ${c.world.stats?.steps ?? 0} steps and ${c.world.stats?.forceEvals ?? 0} force evaluations`),
      derived("Events", "text", "sim", (c) => `contact mergers only, ${c.world.stats?.merges ?? 0} so far, each logged with parents, remnant, and position`),
      input("Units", "text", "sim", () => "SI internally; the display formats to AU, km, days, and solar or Earth masses"),
      derived("Separation of playback from physics", "text", "sim", (c) => `playback ${c.sim.timeScale.toExponential(2)} s/s is a view setting; the integrator chooses its own substeps (${c.world.stats?.frameSubsteps ?? 0} last frame)`),
      derived("Separation of display radius from physical radius", "text", "sim", () => "bodies smaller than 2 px draw as markers; collisions always use the true contact radius"),
      ...none(["Typed per-model schemas", "Spatial fields, meshes, or profiles"], "a single body record; no attached model state exists yet to type", "sim"),
      derived("Registry versioning", "text", "sim", () => `registry ${REGISTRY_VERSION}; every row carries status, unit, scope, applicability, and a reason when not modeled`),
    ],
  },
  {
    id: "19",
    title: "Model families",
    items: [
      derived("Universal mechanics", "text", "sim", () => "represented: mass, position, velocity, momentum, angular momentum, and mutual gravity between every pair, integrated"),
      derived("Orbital dynamics", "text", "sim", () => "represented: osculating elements, perturbations through direct N-body integration, close encounters, Hill stability; resonances only as period ratios, no resonant angles"),
      ...none(["Extended-body gravity"], "point masses; J2 and k2 are listed from reference data but never enter the force", "sim"),
      ...none(["Thermodynamics"], "reference temperatures and a uniform-sphere central pressure bound only; no energy, entropy, or equation of state", "sim"),
      ...none(["Solid materials"], NO_MATERIAL, "sim"),
      ...none(["Fluids and plasmas"], NO_FLUID, "sim"),
      ...none(["Radiation"], "published luminosities, the irradiance and radiation pressure they imply, and blackbody checks only; no transfer, spectra, or forces", "sim"),
      ...none(["Stellar evolution"], NO_EVOLUTION, "sim"),
      derived("Compact objects", "text", "sim", () => "partly represented: exterior Schwarzschild quantities for black holes, remnant mass thresholds at merger, white dwarf radius scaling, canonical neutron-star radius, Crab-like pulsar spin-down formulas; no interiors, spin, or emission"),
      ...none(["Accretion and jets"], NO_ACCRETION, "sim"),
      ...none(["Planetary physics"], "reference rotation, obliquity, J2, albedo, temperature, pressure, and dipole values are listed; no interiors, atmospheres, geology, or tidal evolution", "sim"),
      ...none(["Galaxies and cosmology"], NO_DISTRIBUTED, "sim"),
      derived("Events", "text", "sim", () => "partly represented: contact collisions become perfectly inelastic mergers with remnant rules; bound/unbound, Roche, and escape conditions are reported as states, not logged transitions"),
      derived("Scientific verification", "text", "sim", () => "represented: live energy, momentum, angular-momentum, and mass drift; node tests against Kepler's law, the Earth ellipse, figure-eight closure, Jupiter deflection, and published reference values"),
    ],
  },
]

export function coverage() {
  const counts = { state: 0, input: 0, derived: 0, none: 0, total: 0 }
  for (const section of CATALOGUE) {
    for (const item of section.items) {
      counts[item.status] += 1
      counts.total += 1
    }
  }
  return counts
}

function safe(fn, ctx) {
  try {
    const value = fn(ctx)
    if (typeof value === "number" && !Number.isFinite(value)) return value === Infinity ? Infinity : null
    return value
  } catch {
    return null
  }
}

// Evaluate every catalogue row for the given context.
// ctx: { body, world, orbit, sim: { scene, timeScale, frameRate, wallSeconds, camera, viewport } }
export function evaluate(ctx) {
  const context = { ...ctx, orbit: ctx.orbit ?? (ctx.body && ctx.world.bodies.length > 1 ? orbitAbout(ctx.body, ctx.world.bodies) : null) }
  return CATALOGUE.map((section) => ({
    id: section.id,
    title: section.title,
    rows: section.items.map((item) => {
      if (item.status === "none") return { ...item, value: null, shown: false }
      const needsBody = item.scope === "body"
      if (needsBody && !context.body) return { ...item, value: null, shown: false, waiting: "select a body" }
      const applicable = item.applies ? item.applies(context) : true
      if (applicable !== true) return { ...item, value: null, shown: false, waiting: typeof applicable === "string" ? applicable : "not applicable here" }
      const note = typeof item.note === "function" ? safe(item.note, context) : item.note
      return { ...item, note, value: safe(item.value, context), shown: true }
    }),
  }))
}
