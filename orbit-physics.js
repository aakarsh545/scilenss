// Newtonian N-body gravity in SI units.
// Every body accelerates every other body. GM values are JPL / NASA planetary constants.
// Playback time and the integration step are separate: each frame takes as many Verlet substeps as the free-fall time requires.
// ponytail: Newtonian mutual gravity only; add Einstein-Infeld-Hoffmann terms when a regression can check Mercury's 43 arcsecond/century perihelion advance.
// ponytail: one shared adaptive timestep, 500 substeps per call; split timesteps when the accuracy hold stays on during ordinary solar-system time scales.
// ponytail: planar motion. Inclination stays out until the camera can show the third axis.

export const CONST = Object.freeze({
  G: 6.6743e-11,
  C: 299792458,
  AU: 149597870700,
  GM_SUN: 1.32712440018e20,
  GM_EARTH: 3.986004418e14,
  R_SUN: 6.957e8,
})

const ETA = 0.003
const SOLAR_MASS = CONST.GM_SUN / CONST.G
const CHANDRASEKHAR = 1.44 * SOLAR_MASS
const TOV_LIMIT = 2.5 * SOLAR_MASS
const SIRIUS_B_MASS = 1.018 * SOLAR_MASS
const SIRIUS_B_RADIUS = 0.0084 * CONST.R_SUN

export const MAX_BODIES = 48

const KIND_COLOR = {
  blackhole: "#c8c2b8",
  neutron: "#d5dce3",
  pulsar: "#edf2f4",
  whitedwarf: "#d5e4f2",
}

export const CATALOG = [
  { id: "comet", name: "Comet", kind: "comet", gm: 2.2e14 * CONST.G, radius: 5500, color: "#d7d0c4", detail: "Halley-like nucleus, 2.2 × 10^14 kg" },
  { id: "ceres", name: "Ceres", kind: "asteroid", gm: 6.26284e10, radius: 469730, color: "#a3988c", detail: "Dwarf planet, GM 6.263 × 10^10 m³/s²" },
  { id: "moon", name: "Moon", kind: "moon", gm: 4.902800066e12, radius: 1.7374e6, color: "#d2cdc4", detail: "Earth's moon" },
  { id: "mercury", name: "Mercury", kind: "planet", gm: 2.2032e13, radius: 2.4397e6, color: "#b5b0a6", detail: "Mean radius 2,440 km" },
  { id: "venus", name: "Venus", kind: "planet", gm: 3.24858592e14, radius: 6.0518e6, color: "#e1d2a8", detail: "Mean radius 6,052 km" },
  { id: "earth", name: "Earth", kind: "planet", gm: CONST.GM_EARTH, radius: 6.371e6, color: "#6e93c4", detail: "GM 3.986004418 × 10^14 m³/s²" },
  { id: "mars", name: "Mars", kind: "planet", gm: 4.2828375214e13, radius: 3.3895e6, color: "#c46b4a", detail: "Mean radius 3,390 km" },
  { id: "jupiter", name: "Jupiter", kind: "giant", gm: 1.26686534e17, radius: 6.9911e7, color: "#d2b07a", detail: "Volumetric mean radius 69,911 km" },
  { id: "saturn", name: "Saturn", kind: "giant", gm: 3.7931187e16, radius: 5.8232e7, color: "#e4d0a4", detail: "Volumetric mean radius 58,232 km" },
  { id: "uranus", name: "Uranus", kind: "giant", gm: 5.7945564e15, radius: 2.5362e7, color: "#b7ddd4", detail: "Volumetric mean radius 25,362 km" },
  { id: "neptune", name: "Neptune", kind: "giant", gm: 6.8351e15, radius: 2.4622e7, color: "#6d8eb5", detail: "Volumetric mean radius 24,622 km" },
  { id: "sun", name: "Sun", kind: "star", gm: CONST.GM_SUN, radius: CONST.R_SUN, color: "#f2c14e", detail: "IAU nominal solar GM" },
  { id: "redgiant", name: "Red giant", kind: "giantstar", gm: 18 * CONST.GM_SUN, radius: 764 * CONST.R_SUN, color: "#e36a45", detail: "Betelgeuse-like, 18 suns, 764 solar radii" },
  { id: "whitedwarf", name: "White dwarf", kind: "whitedwarf", gm: 1.018 * CONST.GM_SUN, radius: SIRIUS_B_RADIUS, color: "#d5e4f2", detail: "Sirius B-like, 1.018 suns" },
  { id: "pulsar", name: "Pulsar", kind: "pulsar", gm: 1.4 * CONST.GM_SUN, radius: 12000, color: "#edf2f4", detail: "Canonical neutron star, 1.4 suns, 12 km" },
  { id: "blackhole", name: "Black hole", kind: "blackhole", gm: 10 * CONST.GM_SUN, radius: 0, color: "#c8c2b8", detail: "10 solar masses, horizon at the Schwarzschild radius" },
  { id: "sgra", name: "Sgr A*", kind: "blackhole", gm: 4.154e6 * CONST.GM_SUN, radius: 0, color: "#c8c2b8", detail: "Sagittarius A*, 4.154 million suns (GRAVITY 2019)" },
]

const BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]))

export const SCENARIOS = [
  { id: "smash", name: "Smash Earth", detail: "Earth fills the view. Fling a comet or a moon into it." },
  { id: "sun-earth", name: "Sun and Earth", detail: "Earth's mean ellipse, eccentricity 0.0167. Mutual gravity integrates it." },
  { id: "inner", name: "Inner planets", detail: "Mercury through Mars on their mean ellipses" },
  { id: "solar", name: "Solar system", detail: "Eight planets on mean ellipses. Mutual gravity then perturbs them." },
  { id: "earth-moon", name: "Earth and Moon", detail: "Circular check case at the Moon's mean distance" },
  { id: "binary", name: "Binary stars", detail: "Two suns, 2 AU apart" },
  { id: "figure-eight", name: "Figure-eight", detail: "Chenciner-Montgomery three-sun choreography, scaled to 1 AU" },
  { id: "assist", name: "Jupiter assist", detail: "A comet overtaking Jupiter on a close pass" },
  { id: "flyby", name: "Black hole flyby", detail: "A sun on an unbound pass by a 10 solar mass black hole" },
  { id: "impact", name: "Planetary impact", detail: "Two Earths on a head-on course" },
  { id: "empty", name: "Empty", detail: "Clear field" },
]

export function createWorld() {
  return {
    bodies: [],
    time: 0,
    nextId: 1,
    merges: [],
    limited: false,
    energyAnchor: null,
    momentumAnchor: null,
    angularAnchor: null,
    massAnchor: null,
    stats: { steps: 0, forceEvals: 0, lastStep: 0, minStep: Infinity, frameSubsteps: 0, capHits: 0, merges: 0 },
  }
}

export function schwarzschildRadius(gm) {
  return (2 * gm) / (CONST.C * CONST.C)
}

export function createBody(presetId, props = {}) {
  const preset = BY_ID.get(presetId)
  if (!preset) throw new Error(`Unknown body: ${presetId}`)
  const gm = props.gm ?? preset.gm
  const kind = props.kind ?? preset.kind
  return {
    id: 0,
    name: props.name ?? preset.name,
    kind,
    gm,
    m: gm / CONST.G,
    radius: kind === "blackhole" ? schwarzschildRadius(gm) : (props.radius ?? preset.radius),
    x: props.x ?? 0,
    y: props.y ?? 0,
    vx: props.vx ?? 0,
    vy: props.vy ?? 0,
    ax: 0,
    ay: 0,
    color: props.color ?? preset.color,
    trail: [],
    justMerged: false,
  }
}

function uniqueName(bodies, base) {
  if (!bodies.some((body) => body.name === base)) return base
  let index = 2
  while (bodies.some((body) => body.name === `${base} ${index}`)) index += 1
  return `${base} ${index}`
}

export function addBody(world, body) {
  if (world.bodies.length >= MAX_BODIES) return null
  body.id = world.nextId++
  body.name = uniqueName(world.bodies, body.name)
  body.trail = body.trail ?? []
  world.bodies.push(body)
  computeAccelerations(world.bodies)
  rebaselineEnergy(world)
  return body
}

export function removeBody(world, id) {
  world.bodies = world.bodies.filter((body) => body.id !== id)
  computeAccelerations(world.bodies)
  rebaselineEnergy(world)
}

export function setVelocity(world, id, vx, vy) {
  const body = world.bodies.find((entry) => entry.id === id)
  if (!body) return
  body.vx = vx
  body.vy = vy
  rebaselineEnergy(world)
}

export function totalEnergy(bodies) {
  let energy = 0
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i]
    energy += 0.5 * a.m * (a.vx * a.vx + a.vy * a.vy)
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j]
      const distance = Math.hypot(b.x - a.x, b.y - a.y)
      if (distance > 0) energy -= (a.m * b.gm) / distance
    }
  }
  return energy
}

export function kineticEnergy(bodies) {
  let energy = 0
  for (const body of bodies) energy += 0.5 * body.m * (body.vx * body.vx + body.vy * body.vy)
  return energy
}

export function potentialEnergy(bodies) {
  return totalEnergy(bodies) - kineticEnergy(bodies)
}

export function barycenter(bodies) {
  let mass = 0
  let x = 0
  let y = 0
  let vx = 0
  let vy = 0
  for (const body of bodies) {
    mass += body.m
    x += body.m * body.x
    y += body.m * body.y
    vx += body.m * body.vx
    vy += body.m * body.vy
  }
  if (mass === 0) return { mass: 0, x: 0, y: 0, vx: 0, vy: 0 }
  return { mass, x: x / mass, y: y / mass, vx: vx / mass, vy: vy / mass }
}

export function totalMomentum(bodies) {
  let px = 0
  let py = 0
  for (const body of bodies) {
    px += body.m * body.vx
    py += body.m * body.vy
  }
  return { x: px, y: py }
}

// z component of angular momentum about the barycenter; the only component in a planar system.
export function totalAngularMomentum(bodies) {
  const center = barycenter(bodies)
  let total = 0
  for (const body of bodies) {
    total += body.m * ((body.x - center.x) * (body.vy - center.vy) - (body.y - center.y) * (body.vx - center.vx))
  }
  return total
}

function momentumScale(bodies) {
  let scale = 0
  for (const body of bodies) scale += body.m * Math.hypot(body.vx, body.vy)
  return Math.max(scale, 1)
}

function angularScale(bodies) {
  const center = barycenter(bodies)
  let scale = 0
  for (const body of bodies) {
    scale += body.m * Math.hypot(body.x - center.x, body.y - center.y) * Math.hypot(body.vx - center.vx, body.vy - center.vy)
  }
  return Math.max(scale, 1)
}

export function rebaselineEnergy(world) {
  world.energyAnchor = totalEnergy(world.bodies)
  world.momentumAnchor = totalMomentum(world.bodies)
  world.angularAnchor = totalAngularMomentum(world.bodies)
  world.massAnchor = world.bodies.reduce((sum, body) => sum + body.m, 0)
}

export function energyDrift(world) {
  if (world.energyAnchor == null) return null
  const energy = totalEnergy(world.bodies)
  const scale = Math.max(Math.abs(world.energyAnchor), 1)
  return (energy - world.energyAnchor) / scale
}

export function momentumDrift(world) {
  if (!world.momentumAnchor) return null
  const now = totalMomentum(world.bodies)
  return Math.hypot(now.x - world.momentumAnchor.x, now.y - world.momentumAnchor.y) / momentumScale(world.bodies)
}

export function angularMomentumDrift(world) {
  if (world.angularAnchor == null) return null
  return (totalAngularMomentum(world.bodies) - world.angularAnchor) / angularScale(world.bodies)
}

export function massDrift(world) {
  if (world.massAnchor == null) return null
  const mass = world.bodies.reduce((sum, body) => sum + body.m, 0)
  return (mass - world.massAnchor) / Math.max(world.massAnchor, 1)
}

const BODY_KINDS = new Set([
  "comet",
  "asteroid",
  "moon",
  "planet",
  "giant",
  "star",
  "giantstar",
  "whitedwarf",
  "pulsar",
  "neutron",
  "blackhole",
])

function finiteIn(value, min, max) {
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

function normalizeBody(raw, index) {
  const label = `Body ${index + 1}`
  if (!raw || typeof raw !== "object") throw new Error(`${label} is missing.`)
  if (!BODY_KINDS.has(raw.kind)) throw new Error(`${label} has an unknown kind.`)
  const gm = finiteIn(raw.gm, 1, 1e12 * CONST.GM_SUN)
  if (gm == null) throw new Error(`${label} has an unusable mass.`)
  const radius = raw.kind === "blackhole" ? schwarzschildRadius(gm) : finiteIn(raw.radius, 0, 1e15)
  if (radius == null) throw new Error(`${label} has an unusable radius.`)
  const x = finiteIn(raw.x, -1e20, 1e20)
  const y = finiteIn(raw.y, -1e20, 1e20)
  const vx = finiteIn(raw.vx, -CONST.C, CONST.C)
  const vy = finiteIn(raw.vy, -CONST.C, CONST.C)
  if (x == null || y == null) throw new Error(`${label} is too far from the origin.`)
  if (vx == null || vy == null) throw new Error(`${label} is faster than light.`)
  const name = String(raw.name ?? "Body").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80) || "Body"
  const color = /^#[0-9a-fA-F]{6}$/.test(String(raw.color ?? "")) ? String(raw.color) : "#d7d0c4"
  return { name, kind: raw.kind, gm, radius, x, y, vx, vy, color }
}

export function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.bodies)) {
    throw new Error("A project needs a list of bodies.")
  }
  if (raw.bodies.length > MAX_BODIES) throw new Error(`A project holds at most ${MAX_BODIES} bodies.`)
  const bodies = raw.bodies.map(normalizeBody)
  const time = finiteIn(raw.time ?? 0, 0, 1e15)
  const timeScale = finiteIn(raw.timeScale, 1, 365.25 * 86400)
  const camera = raw.camera ?? {}
  const cameraX = finiteIn(camera.x, -1e20, 1e20)
  const cameraY = finiteIn(camera.y, -1e20, 1e20)
  const cameraMpp = finiteIn(camera.mpp, 200, 1e15)
  if (time == null) throw new Error("Project time is not a usable number.")
  if (timeScale == null) throw new Error("Project time scale is out of range.")
  if (cameraX == null || cameraY == null || cameraMpp == null) throw new Error("Project camera is out of range.")
  const requestedId = Number.isInteger(raw.nextId) && raw.nextId > 0 && raw.nextId < 1_000_000 ? raw.nextId : bodies.length + 1
  return {
    time,
    nextId: Math.max(requestedId, bodies.length + 1),
    timeScale,
    camera: { x: cameraX, y: cameraY, mpp: cameraMpp },
    bodies,
  }
}

export function worldFromSnapshot(raw) {
  const snapshot = normalizeSnapshot(raw)
  const world = createWorld()
  world.time = snapshot.time
  world.nextId = snapshot.nextId
  world.bodies = snapshot.bodies.map((body, index) => ({
    ...body,
    id: index + 1,
    m: body.gm / CONST.G,
    ax: 0,
    ay: 0,
    trail: [],
    justMerged: false,
  }))
  computeAccelerations(world.bodies)
  rebaselineEnergy(world)
  return {
    world,
    view: { timeScale: snapshot.timeScale, camera: snapshot.camera },
  }
}

export function shiftToBarycenter(bodies) {
  let mass = 0
  let x = 0
  let y = 0
  let vx = 0
  let vy = 0
  for (const body of bodies) {
    mass += body.m
    x += body.m * body.x
    y += body.m * body.y
    vx += body.m * body.vx
    vy += body.m * body.vy
  }
  if (mass === 0) return
  x /= mass
  y /= mass
  vx /= mass
  vy /= mass
  for (const body of bodies) {
    body.x -= x
    body.y -= y
    body.vx -= vx
    body.vy -= vy
  }
}

// Mean Keplerian elements, J2000-style. These are initial conditions, not a Horizons ephemeris.
const PLANETS = [
  ["mercury", 0.38709893, 0.20563069, 0.5],
  ["venus", 0.72333199, 0.00677323, 1.8],
  ["earth", 1.00000011, 0.01671022, 2.6],
  ["mars", 1.52366231, 0.09341233, 4.1],
  ["jupiter", 5.20336301, 0.04839266, 0.7],
  ["saturn", 9.53707032, 0.0541506, 2.5],
  ["uranus", 19.19126393, 0.04716771, 4.4],
  ["neptune", 30.06896348, 0.00858587, 5.6],
]
const EARTH_AXIS = 1.00000011 * CONST.AU
const EARTH_ECCENTRICITY = 0.01671022

function keplerRelative(mu, semiMajor, eccentricity, anomaly) {
  const p = semiMajor * (1 - eccentricity * eccentricity)
  const radius = p / (1 + eccentricity * Math.cos(anomaly))
  const angular = Math.sqrt(mu * p)
  const radial = (mu / angular) * eccentricity * Math.sin(anomaly)
  const tangential = (mu / angular) * (1 + eccentricity * Math.cos(anomaly))
  const cos = Math.cos(anomaly)
  const sin = Math.sin(anomaly)
  return {
    x: radius * cos,
    y: radius * sin,
    vx: radial * cos - tangential * sin,
    vy: radial * sin + tangential * cos,
  }
}

export function applyTwoBody(primary, secondary, semiMajor, eccentricity = 0, anomaly = 0) {
  const rel = keplerRelative(primary.gm + secondary.gm, semiMajor, eccentricity, anomaly)
  const mass = primary.m + secondary.m
  const secondaryShare = secondary.m / mass
  const primaryShare = primary.m / mass
  primary.x = -rel.x * secondaryShare
  primary.y = -rel.y * secondaryShare
  primary.vx = -rel.vx * secondaryShare
  primary.vy = -rel.vy * secondaryShare
  secondary.x = rel.x * primaryShare
  secondary.y = rel.y * primaryShare
  secondary.vx = rel.vx * primaryShare
  secondary.vy = rel.vy * primaryShare
}

function addPlanet(world, id, au, eccentricity, anomaly) {
  const body = createBody(id)
  const rel = keplerRelative(CONST.GM_SUN + body.gm, au * CONST.AU, eccentricity, anomaly)
  body.x = rel.x
  body.y = rel.y
  body.vx = rel.vx
  body.vy = rel.vy
  addBody(world, body)
}

const TAU = 2 * Math.PI

function wrapAngle(angle) {
  const wrapped = angle % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

export function dominantPartner(body, others) {
  let primary = null
  let strongest = 0
  let nearest = null
  let nearestDistance = Infinity
  for (const other of others) {
    if (other === body || other.id === body.id) continue
    const distance = Math.hypot(other.x - body.x, other.y - body.y)
    if (!(distance > 0)) continue
    const pull = other.gm / (distance * distance)
    if (pull > strongest) {
      strongest = pull
      primary = other
    }
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = other
    }
  }
  // The Sun still pulls harder on the Moon than Earth does, but the Moon sits inside
  // Earth's Hill sphere, so Earth is the orbit it can actually keep.
  if (nearest && primary && nearest !== primary) {
    const orbitDistance = Math.hypot(nearest.x - primary.x, nearest.y - primary.y)
    const hill = orbitDistance * Math.cbrt(nearest.m / (3 * primary.m))
    if (nearestDistance < hill) return nearest
  }
  return primary
}

// Osculating two-body elements about the partner with the strongest pull.
// Planar: inclination and node are not defined here. Other bodies perturb these values over time.
export function orbitAbout(body, others) {
  const primary = dominantPartner(body, others)
  if (!primary) return null
  const dx = body.x - primary.x
  const dy = body.y - primary.y
  const dvx = body.vx - primary.vx
  const dvy = body.vy - primary.vy
  const radius = Math.hypot(dx, dy)
  const mu = primary.gm + body.gm
  if (!(radius > 0) || !(mu > 0)) return null
  const speed2 = dvx * dvx + dvy * dvy
  const speed = Math.sqrt(speed2)
  const specificEnergy = speed2 / 2 - mu / radius
  const angular = dx * dvy - dy * dvx
  const ex = (dvy * angular) / mu - dx / radius
  const ey = (-dvx * angular) / mu - dy / radius
  const eccentricity = Math.hypot(ex, ey)
  const semiLatus = (angular * angular) / mu
  const bound = specificEnergy < 0
  const semiMajor = specificEnergy !== 0 ? -mu / (2 * specificEnergy) : null
  const elliptic = bound && eccentricity < 1 && semiMajor > 0
  const semiMinor = elliptic ? semiMajor * Math.sqrt(1 - eccentricity * eccentricity) : null
  const periapsis = semiLatus / (1 + eccentricity)
  const apoapsis = elliptic ? semiLatus / (1 - eccentricity) : null
  const period = elliptic ? TAU * Math.sqrt((semiMajor ** 3) / mu) : null
  const meanMotion = period ? TAU / period : null
  const radialSpeed = (dx * dvx + dy * dvy) / radius
  const tangentialSpeed = angular / radius
  const nearlyCircular = eccentricity < 1e-9
  let trueAnomaly = nearlyCircular
    ? Math.atan2(dy, dx)
    : Math.atan2(ex * dy - ey * dx, ex * dx + ey * dy)
  if (angular < 0) trueAnomaly = -trueAnomaly
  trueAnomaly = wrapAngle(trueAnomaly)
  const argPeriapsis = nearlyCircular ? 0 : wrapAngle(Math.atan2(ey, ex))
  let eccentricAnomaly = null
  let meanAnomaly = null
  let timeToPeriapsis = null
  if (elliptic) {
    eccentricAnomaly = wrapAngle(2 * Math.atan2(
      Math.sqrt(1 - eccentricity) * Math.sin(trueAnomaly / 2),
      Math.sqrt(1 + eccentricity) * Math.cos(trueAnomaly / 2),
    ))
    meanAnomaly = wrapAngle(eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly))
    timeToPeriapsis = meanAnomaly === 0 ? 0 : (TAU - meanAnomaly) / meanMotion
  }
  const vInfinity = bound ? null : Math.sqrt(2 * specificEnergy)
  const impactParameter = vInfinity ? Math.abs(angular) / vInfinity : null
  const reducedMass = (primary.m * body.m) / (primary.m + body.m)
  return {
    primary: primary.name,
    primaryBody: primary,
    distance: radius,
    speed,
    radialSpeed,
    tangentialSpeed,
    mu,
    specificEnergy,
    specificAngularMomentum: angular,
    eccentricity,
    semiLatus,
    semiMajor: elliptic ? semiMajor : semiMajor,
    semiMinor,
    periapsis,
    apoapsis,
    period,
    meanMotion,
    trueAnomaly,
    eccentricAnomaly,
    meanAnomaly,
    argPeriapsis,
    timeToPeriapsis,
    bound,
    elliptic,
    vInfinity,
    impactParameter,
    reducedMass,
    massRatio: body.m / primary.m,
    orbitalEnergy: reducedMass * specificEnergy,
    orbitalAngularMomentum: reducedMass * angular,
    circularSpeed: Math.sqrt(mu / radius),
    escapeSpeed: Math.sqrt((2 * mu) / radius),
  }
}

function finish(world) {
  computeAccelerations(world.bodies)
  rebaselineEnergy(world)
  world.time = 0
  world.merges = []
  world.limited = false
  return world
}

export function buildScenario(id) {
  const world = createWorld()
  const view = { timeScale: 20 * 86400, span: null, focus: null }

  if (id === "smash") {
    addBody(world, createBody("earth"))
    view.timeScale = 1200
    view.span = 5.6 * 6.371e6
    view.focus = "Earth"
  } else if (id === "sun-earth") {
    const sun = createBody("sun")
    const earth = createBody("earth")
    applyTwoBody(sun, earth, EARTH_AXIS, EARTH_ECCENTRICITY, 0)
    addBody(world, sun)
    addBody(world, earth)
    view.timeScale = 20 * 86400
  } else if (id === "inner" || id === "solar") {
    addBody(world, createBody("sun"))
    const planets = id === "solar" ? PLANETS : PLANETS.slice(0, 4)
    for (const planet of planets) addPlanet(world, ...planet)
    if (id === "solar") {
      view.timeScale = 40 * 86400
    } else {
      view.timeScale = 15 * 86400
    }
    shiftToBarycenter(world.bodies)
  } else if (id === "earth-moon") {
    const earth = createBody("earth")
    const moon = createBody("moon")
    applyTwoBody(earth, moon, 3.84399e8, 0, 0)
    addBody(world, earth)
    addBody(world, moon)
    view.timeScale = 86400
  } else if (id === "binary") {
    const a = createBody("sun")
    const b = createBody("sun")
    applyTwoBody(a, b, 2 * CONST.AU, 0, 0)
    addBody(world, a)
    addBody(world, b)
    view.timeScale = 30 * 86400
  } else if (id === "figure-eight") {
    const length = CONST.AU
    const velocity = Math.sqrt(CONST.GM_SUN / length)
    const stars = [
      ["Star A", "#f2c14e", 0.97000436, -0.24308753, 0.466203685, 0.43236573],
      ["Star B", "#f0d7a2", -0.97000436, 0.24308753, 0.466203685, 0.43236573],
      ["Star C", "#e7a15a", 0, 0, -0.93240737, -0.86473146],
    ]
    for (const [name, color, x, y, vx, vy] of stars) {
      addBody(world, createBody("sun", {
        name,
        color,
        x: x * length,
        y: y * length,
        vx: vx * velocity,
        vy: vy * velocity,
      }))
    }
    view.timeScale = 20 * 86400
  } else if (id === "assist") {
    const sun = createBody("sun")
    const jupiter = createBody("jupiter")
    applyTwoBody(sun, jupiter, 5.2044 * CONST.AU, 0, 0)
    addBody(world, sun)
    addBody(world, jupiter)
    const comet = createBody("comet")
    comet.x = jupiter.x + 1.5e9
    comet.y = jupiter.y - 3e9
    comet.vx = jupiter.vx
    comet.vy = jupiter.vy + 6000
    addBody(world, comet)
    view.timeScale = 4 * 86400
    view.span = 0.5 * CONST.AU
    view.focus = "Jupiter"
  } else if (id === "flyby") {
    const hole = createBody("blackhole")
    const star = createBody("sun")
    star.y = 0.6 * CONST.AU
    star.vx = 200000
    addBody(world, hole)
    addBody(world, star)
    shiftToBarycenter(world.bodies)
    view.timeScale = 3 * 86400
    view.span = 4 * CONST.AU
    view.focus = "Black hole"
  } else if (id === "impact") {
    const left = createBody("earth")
    const right = createBody("earth")
    const separation = 12 * left.radius
    left.x = -separation / 2
    right.x = separation / 2
    left.vx = 2000
    right.vx = -2000
    addBody(world, left)
    addBody(world, right)
    view.timeScale = 1800
  }

  return { world: finish(world), view }
}

function computeAccelerations(bodies) {
  for (const body of bodies) {
    body.ax = 0
    body.ay = 0
  }
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i]
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.hypot(dx, dy)
      if (distance < 1e-4) continue
      const invCube = 1 / (distance * distance * distance)
      a.ax += b.gm * dx * invCube
      a.ay += b.gm * dy * invCube
      b.ax -= a.gm * dx * invCube
      b.ay -= a.gm * dy * invCube
    }
  }
}

function kick(bodies, dt) {
  for (const body of bodies) {
    if (body.justMerged) {
      body.justMerged = false
      continue
    }
    body.vx += body.ax * dt
    body.vy += body.ay * dt
  }
}

function drift(bodies, dt) {
  for (const body of bodies) {
    body.x += body.vx * dt
    body.y += body.vy * dt
  }
}

function remnantKind(a, b, mass) {
  const kinds = [a.kind, b.kind]
  const has = (kind) => kinds.includes(kind)
  const compact = has("pulsar") || has("neutron")
  if (has("blackhole") || (compact && mass > TOV_LIMIT)) return "blackhole"
  if (compact) return has("pulsar") ? "pulsar" : "neutron"
  if (has("whitedwarf")) return mass > CHANDRASEKHAR ? "neutron" : "whitedwarf"
  return a.m >= b.m ? a.kind : b.kind
}

function remnantRadius(a, b, kind, gm, mass) {
  if (kind === "blackhole") return schwarzschildRadius(gm)
  if (kind === "pulsar" || kind === "neutron") return 12000
  if (kind === "whitedwarf") return SIRIUS_B_RADIUS * Math.cbrt(SIRIUS_B_MASS / mass)
  return Math.cbrt(a.radius ** 3 + b.radius ** 3)
}

function remnantName(a, b, kind) {
  const heavier = a.m >= b.m ? a : b
  if (kind === "blackhole" && a.kind !== "blackhole" && b.kind !== "blackhole") return "Black hole"
  if (kind === "neutron" && a.kind !== "neutron" && b.kind !== "pulsar" && a.kind !== "pulsar" && b.kind !== "neutron") {
    return "Neutron star"
  }
  return heavier.name
}

// What a contact merger of these two bodies would produce under the remnant rules.
export function predictRemnant(a, b) {
  const mass = a.m + b.m
  const gm = a.gm + b.gm
  const kind = remnantKind(a, b, mass)
  return { kind, gm, mass, radius: remnantRadius(a, b, kind, gm, mass), name: remnantName(a, b, kind) }
}

function mergePair(world, i, j) {
  const a = world.bodies[i]
  const b = world.bodies[j]
  const mass = a.m + b.m
  const gm = a.gm + b.gm
  const kind = remnantKind(a, b, mass)
  const heavier = a.m >= b.m ? a : b
  if (world.stats) world.stats.merges += 1
  const survivors = world.bodies.filter((_, index) => index !== i && index !== j)
  const name = uniqueName(survivors, remnantName(a, b, kind))
  const body = {
    id: heavier.id,
    name,
    kind,
    gm,
    m: mass,
    radius: remnantRadius(a, b, kind, gm, mass),
    x: (a.m * a.x + b.m * b.x) / mass,
    y: (a.m * a.y + b.m * b.y) / mass,
    vx: (a.m * a.vx + b.m * b.vx) / mass,
    vy: (a.m * a.vy + b.m * b.vy) / mass,
    ax: 0,
    ay: 0,
    color: kind !== heavier.kind && KIND_COLOR[kind] ? KIND_COLOR[kind] : heavier.color,
    trail: heavier.trail,
    justMerged: true,
  }
  world.bodies = survivors
  world.bodies.push(body)
  world.merges.push({
    x: body.x,
    y: body.y,
    name: body.name,
    id: body.id,
    parents: [a.name, b.name],
    consumed: [a.id, b.id],
    color: body.color,
  })
}

function resolveCollisions(world) {
  for (let guard = 0; guard < 12; guard += 1) {
    let hit = null
    let closest = Infinity
    const bodies = world.bodies
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i]
        const b = bodies[j]
        const distance = Math.hypot(b.x - a.x, b.y - a.y)
        if (distance < a.radius + b.radius && distance < closest) {
          closest = distance
          hit = [i, j]
        }
      }
    }
    if (!hit) return
    mergePair(world, hit[0], hit[1])
  }
}

function limitingDt(bodies) {
  if (bodies.length < 2) return Infinity
  let safe = Infinity
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i]
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.hypot(dx, dy)
      if (distance === 0) return 1e-3
      const dynamical = Math.sqrt((distance ** 3) / (a.gm + b.gm))
      safe = Math.min(safe, ETA * dynamical)
      const closing = -((dx * (b.vx - a.vx)) + (dy * (b.vy - a.vy))) / distance
      if (closing > 0) {
        const gap = distance - a.radius - b.radius
        if (gap < distance * 0.3) {
          safe = Math.min(safe, (0.25 * Math.max(gap, distance * 0.02)) / closing)
        }
      }
    }
  }
  return safe
}

function verletStep(world, dt) {
  kick(world.bodies, dt / 2)
  drift(world.bodies, dt)
  resolveCollisions(world)
  computeAccelerations(world.bodies)
  kick(world.bodies, dt / 2)
  if (world.stats) {
    world.stats.steps += 1
    world.stats.forceEvals += 1
    world.stats.lastStep = dt
    world.stats.minStep = Math.min(world.stats.minStep, dt)
  }
}

export function integrate(world, dtRequested, options = {}) {
  const maxSubsteps = options.maxSubsteps ?? 500
  world.merges = []
  world.limited = false
  if (!(dtRequested > 0) || world.bodies.length === 0) {
    if (world.stats) world.stats.frameSubsteps = 0
    return { simulated: 0, substeps: 0, limited: false }
  }

  resolveCollisions(world)
  for (const body of world.bodies) body.justMerged = false
  computeAccelerations(world.bodies)
  if (world.stats) world.stats.forceEvals += 1

  let remaining = dtRequested
  let simulated = 0
  let substeps = 0
  while (remaining > 1e-9 && substeps < maxSubsteps) {
    const safe = limitingDt(world.bodies)
    let step = Number.isFinite(safe) ? Math.min(remaining, safe) : remaining
    if (!(step > 0)) step = remaining
    verletStep(world, step)
    world.time += step
    simulated += step
    remaining -= step
    substeps += 1
  }

  const limited = remaining > Math.max(1e-6, dtRequested * 1e-4)
  world.limited = limited
  if (world.stats) {
    world.stats.frameSubsteps = substeps
    if (limited) world.stats.capHits += 1
  }
  if (world.merges.length) rebaselineEnergy(world)
  return { simulated, substeps, limited }
}

// Host for a drop or throw: the body whose Hill sphere contains the point, else the strongest pull.
// `capture` (meters) lets the UI treat a click near a body as "around that body" even at solar zoom.
export function placementHost(x, y, bodies, options = {}) {
  const capture = options.capture ?? 0
  let dominant = null
  let strongest = 0
  let nearest = null
  let nearestDistance = Infinity
  for (const body of bodies) {
    const distance = Math.hypot(x - body.x, y - body.y)
    if (!(distance > 0)) continue
    const pull = body.gm / (distance * distance)
    if (pull > strongest) {
      strongest = pull
      dominant = body
    }
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = body
    }
  }
  if (!nearest) return dominant
  const parent = dominantPartner(nearest, bodies)
  if (parent) {
    const orbitDistance = Math.hypot(nearest.x - parent.x, nearest.y - parent.y)
    const hill = orbitDistance * Math.cbrt(nearest.m / (3 * parent.m))
    if (nearestDistance < 3 * hill || nearestDistance <= capture) return nearest
  } else if (nearestDistance <= capture) {
    return nearest
  }
  return dominant ?? nearest
}

export function flightGuide(x, y, gmSelf, bodies, options = {}) {
  const host = placementHost(x, y, bodies, options)
  if (!host) return null
  const distance = Math.hypot(x - host.x, y - host.y)
  if (!(distance > 0)) return null
  const gm = host.gm + gmSelf
  const circular = Math.sqrt(gm / distance)
  return {
    host,
    name: host.name,
    distance,
    circular,
    escape: circular * Math.SQRT2,
    period: 2 * Math.PI * Math.sqrt((distance ** 3) / gm),
  }
}

// Inertial velocity for a new body: the host's motion plus either a circular relative
// orbit (relative = null) or an explicit relative throw. Without the host velocity, a
// moon dropped near Earth sits still while Earth moves at 30 km/s and falls into the Sun.
export function insertionVelocity(x, y, gmSelf, bodies, relative = null, options = {}) {
  const guide = flightGuide(x, y, gmSelf, bodies, options)
  if (!guide) {
    const vx = relative?.vx ?? 0
    const vy = relative?.vy ?? 0
    return { vx, vy, host: null, circular: 0, relativeSpeed: Math.hypot(vx, vy), guide: null }
  }
  const dx = x - guide.host.x
  const dy = y - guide.host.y
  const distance = guide.distance
  const circularVx = (-dy / distance) * guide.circular
  const circularVy = (dx / distance) * guide.circular
  const relVx = relative ? relative.vx : circularVx
  const relVy = relative ? relative.vy : circularVy
  return {
    vx: guide.host.vx + relVx,
    vy: guide.host.vy + relVy,
    host: guide.host,
    circular: guide.circular,
    relativeSpeed: Math.hypot(relVx, relVy),
    guide,
  }
}

function hostHillRadius(host, bodies) {
  const parent = dominantPartner(host, bodies)
  if (!parent) return null
  const orbitDistance = Math.hypot(host.x - parent.x, host.y - parent.y)
  if (!(orbitDistance > 0) || !(host.m > 0) || !(parent.m > 0)) return null
  return orbitDistance * Math.cbrt(host.m / (3 * parent.m))
}

function satelliteDistance(host, bodies) {
  const inner = host.radius * 3
  const hill = hostHillRadius(host, bodies)
  if (!(hill > inner)) return inner
  return Math.min(Math.max(inner, 3.84399e8), 0.4 * hill)
}

// Tap-drop pose: co-move with the host, and if the click is only "near" it at solar
// zoom (outside the Hill sphere) snap onto a circular satellite orbit so the body
// actually stays with the planet instead of sharing a wide heliocentric path.
export function insertionPlacement(x, y, gmSelf, bodies, relative = null, options = {}) {
  const host = placementHost(x, y, bodies, options)
  let px = x
  let py = y
  if (host && relative == null) {
    const dx = x - host.x
    const dy = y - host.y
    const distance = Math.hypot(dx, dy)
    const hill = hostHillRadius(host, bodies)
    const floor = host.radius * 3
    const outsideHill = hill != null && (!(distance > 0) || distance > hill)
    const insideSurface = !(distance > floor)
    if (outsideHill || insideSurface) {
      const target = satelliteDistance(host, bodies)
      const ux = distance > 0 ? dx / distance : 1
      const uy = distance > 0 ? dy / distance : 0
      px = host.x + ux * target
      py = host.y + uy * target
    }
  }
  const inserted = insertionVelocity(px, py, gmSelf, bodies, relative, options)
  return { x: px, y: py, ...inserted }
}

function copyBody(body) {
  return { ...body, trail: [], justMerged: false }
}

export function forecast(bodies, ghost, seconds, replaceId = null) {
  const clones = bodies.map(copyBody)
  let trackedId = ghost.id
  if (replaceId == null) {
    clones.push(copyBody(ghost))
  } else {
    const existing = clones.find((body) => body.id === replaceId)
    if (!existing) return []
    existing.vx = ghost.vx
    existing.vy = ghost.vy
    trackedId = existing.id
  }

  const start = clones.find((body) => body.id === trackedId)
  if (!start) return []
  const samples = [{ x: start.x, y: start.y }]
  if (clones.length < 2 || !(seconds > 0)) {
    const span = seconds > 0 ? seconds : 86400
    for (let step = 1; step <= 24; step += 1) {
      const t = (span * step) / 24
      samples.push({ x: start.x + start.vx * t, y: start.y + start.vy * t })
    }
    return samples
  }

  const world = createWorld()
  world.bodies = clones
  world.stats = null
  let left = seconds
  for (let step = 0; step < 480 && left > 0; step += 1) {
    const result = integrate(world, left, { maxSubsteps: 1 })
    if (result.simulated <= 0) break
    left -= result.simulated
    const body = world.bodies.find((entry) => entry.id === trackedId)
    if (!body) {
      const last = world.merges.at(-1)
      if (last) samples.push({ x: last.x, y: last.y, end: true })
      break
    }
    if (step % 6 === 5) samples.push({ x: body.x, y: body.y })
  }
  return samples
}
