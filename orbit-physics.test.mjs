import {
  CONST,
  addBody,
  applyTwoBody,
  buildScenario,
  createBody,
  createWorld,
  energyDrift,
  insertionPlacement,
  insertionVelocity,
  integrate,
  orbitAbout,
  placementHost,
} from "./orbit-physics.js"

let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`ok  ${message}`)
    return
  }
  failed += 1
  console.error(`FAIL  ${message}`)
}

function momentum(world) {
  let x = 0
  let y = 0
  for (const body of world.bodies) {
    x += body.m * body.vx
    y += body.m * body.vy
  }
  return Math.hypot(x, y)
}

function advance(world, seconds, frame = 28800) {
  let left = seconds
  let limited = false
  let guard = 0
  while (left > 1e-3 && guard < 1_000_000) {
    const result = integrate(world, Math.min(frame, left), { maxSubsteps: 8000 })
    if (result.simulated <= 0) return { limited: true, left }
    left -= result.simulated
    limited = limited || result.limited
    guard += 1
  }
  return { limited, left }
}

function relative(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function circularSunEarth() {
  const world = createWorld()
  const sun = createBody("sun")
  const earth = createBody("earth")
  applyTwoBody(sun, earth, CONST.AU, 0, 0)
  addBody(world, sun)
  addBody(world, earth)
  return world
}

function sunEarthClosure(frame, label) {
  const world = circularSunEarth()
  const sun = world.bodies.find((body) => body.name === "Sun")
  const earth = world.bodies.find((body) => body.name === "Earth")
  const separation = relative(earth, sun)
  const period = 2 * Math.PI * Math.sqrt((separation ** 3) / (sun.gm + earth.gm))
  const rx = earth.x - sun.x
  const ry = earth.y - sun.y
  const startMomentum = momentum(world)
  const run = advance(world, period * 10, frame)
  const endSeparation = relative(earth, sun)
  const closure = Math.hypot(earth.x - sun.x - rx, earth.y - sun.y - ry) / separation
  const drift = Math.abs(energyDrift(world))
  const earthSpeed = Math.hypot(earth.vx, earth.vy)
  console.log(`  ${label}: closure ${(closure).toExponential(2)}, drift ${drift.toExponential(2)}, limited ${run.limited}`)
  assert(Math.abs(separation - CONST.AU) / CONST.AU < 1e-12, `${label} separation is 1 AU`)
  assert(earthSpeed > 29700 && earthSpeed < 29900, `${label} Earth speed is ${earthSpeed.toFixed(1)} m/s`)
  assert(!run.limited && run.left < 1, `${label} finishes the requested time`)
  assert(drift < 1e-9, `${label} energy drift ${drift.toExponential(2)}`)
  assert(closure < 2e-4, `${label} returns within ${closure.toExponential(2)} of the orbit`)
  assert(Math.abs(endSeparation - separation) / separation < 1e-4, `${label} keeps the orbital radius`)
  assert(startMomentum / SOLAR_MOMENTUM < 1e-12, `${label} starts with zero momentum`)
  assert(momentum(world) / SOLAR_MOMENTUM < 1e-8, `${label} keeps momentum`)
}

const SOLAR_MOMENTUM = (CONST.GM_SUN / CONST.G) * 30000

console.log("Circular Sun-Earth, 20 days/sec frames")
sunEarthClosure(20 * 86400 / 60, "slow")
console.log("Circular Sun-Earth, 1 year/sec frames")
sunEarthClosure((365.25 * 86400) / 60, "fast")

{
  const world = createWorld()
  const sun = createBody("sun")
  const earth = createBody("earth", { x: CONST.AU, y: 0 })
  addBody(world, sun)
  addBody(world, earth)
  const expected = CONST.GM_SUN / (CONST.AU ** 2)
  const reaction = sun.m * sun.ax + earth.m * earth.ax
  assert(Math.abs(-earth.ax - expected) / expected < 1e-12, "Earth falls toward the Sun at GM/r^2")
  assert(Math.abs(reaction) / (earth.m * expected) < 1e-9, "the Sun feels the equal opposite pull")
  const alone = earth.ax
  addBody(world, createBody("jupiter", { x: 5.2 * CONST.AU, y: 0 }))
  assert(earth.ax !== alone, "Jupiter changes Earth's acceleration")
  assert(world.bodies.length === 3, "three bodies stay in one mutual system")
}

{
  const { world } = buildScenario("sun-earth")
  const sun = world.bodies.find((body) => body.name === "Sun")
  const earth = world.bodies.find((body) => body.name === "Earth")
  const lunar = 3.84399e8
  const sunAccel = sun.gm / ((earth.x + lunar - sun.x) ** 2 + (earth.y - sun.y) ** 2)
  const earthAccel = earth.gm / (lunar ** 2)
  assert(sunAccel > earthAccel, "at the Moon, the Sun's pull is stronger than Earth's: that is the real solar system, not a missing force")
  assert(earthAccel > 0.4 * sunAccel, "Earth's pull at lunar distance is still the same order as the Sun's")
  const hill = Math.hypot(earth.x - sun.x, earth.y - sun.y) * Math.cbrt(earth.m / (3 * sun.m))
  assert(lunar < hill, "the Moon sits inside Earth's Hill sphere, so Earth can still hold it")
}

{
  const { world } = buildScenario("sun-earth")
  const sun = world.bodies.find((body) => body.name === "Sun")
  const earth = world.bodies.find((body) => body.name === "Earth")
  const orbit = orbitAbout(earth, world.bodies)
  const axis = 1.00000011 * CONST.AU
  const eccentricity = 0.01671022
  assert(orbit.primary === "Sun", "Earth's orbit is measured about the Sun")
  assert(Math.abs(orbit.eccentricity - eccentricity) < 1e-8, `Earth starts at e ${orbit.eccentricity.toFixed(6)}`)
  assert(Math.abs(orbit.semiMajor - axis) / axis < 1e-8, "Earth's semi-major axis is 1.00000011 AU")
  let min = Infinity
  let max = 0
  const frames = 3600
  for (let step = 0; step < frames; step += 1) {
    integrate(world, orbit.period / frames, { maxSubsteps: 40 })
    const distance = relative(earth, sun)
    min = Math.min(min, distance)
    max = Math.max(max, distance)
  }
  const peri = axis * (1 - eccentricity)
  const ap = axis * (1 + eccentricity)
  console.log(`  ellipse peri ${(min / CONST.AU).toFixed(5)} AU, ap ${(max / CONST.AU).toFixed(5)} AU, drift ${energyDrift(world).toExponential(2)}`)
  assert(Math.abs(min - peri) / axis < 2e-4, "Earth reaches perihelion")
  assert(Math.abs(max - ap) / axis < 2e-4, "Earth reaches aphelion")
  assert(Math.abs(energyDrift(world)) < 1e-9, "elliptical Earth keeps its energy")
}

{
  const { world } = buildScenario("earth-moon")
  const earth = world.bodies.find((body) => body.name === "Earth")
  const moon = world.bodies.find((body) => body.name === "Moon")
  const separation = relative(earth, moon)
  const period = 2 * Math.PI * Math.sqrt((separation ** 3) / (earth.gm + moon.gm))
  let min = Infinity
  let max = 0
  const frames = 2400
  for (let step = 0; step < frames; step += 1) {
    integrate(world, period / frames, { maxSubsteps: 20 })
    const distance = relative(earth, moon)
    min = Math.min(min, distance)
    max = Math.max(max, distance)
  }
  const spread = (max - min) / separation
  console.log(`  moon radial spread ${(spread * 100).toFixed(4)}%`)
  assert(spread < 0.002, `Moon stays circular (${spread.toExponential(2)})`)
  assert(Math.abs(energyDrift(world)) < 1e-9, "Moon energy stays put")
}

{
  const { world } = buildScenario("figure-eight")
  assert(world.bodies.length === 3, "figure-eight has three stars")
  const length = CONST.AU
  const period = 6.32591398 * Math.sqrt((length ** 3) / CONST.GM_SUN)
  const start = world.bodies.map((body) => ({ id: body.id, x: body.x, y: body.y }))
  const run = advance(world, period, period / 4000)
  let worst = 0
  for (const item of start) {
    const body = world.bodies.find((entry) => entry.id === item.id)
    worst = Math.max(worst, Math.hypot(body.x - item.x, body.y - item.y) / length)
  }
  console.log(`  figure-eight return ${worst.toExponential(2)}, drift ${energyDrift(world).toExponential(2)}`)
  assert(!run.limited, "figure-eight finishes a period")
  assert(world.bodies.length === 3, "figure-eight stars do not merge")
  assert(Math.abs(energyDrift(world)) < 1e-7, "figure-eight energy holds")
  assert(worst < 0.02, `figure-eight closes (${worst.toExponential(2)})`)
}

{
  const { world } = buildScenario("assist")
  const jupiter = world.bodies.find((body) => body.name === "Jupiter")
  const comet = world.bodies.find((body) => body.name === "Comet")
  const before = Math.atan2(comet.vy - jupiter.vy, comet.vx - jupiter.vx)
  advance(world, 20 * 86400, 10000)
  const after = Math.atan2(comet.vy - jupiter.vy, comet.vx - jupiter.vx)
  let turn = Math.abs(after - before)
  if (turn > Math.PI) turn = 2 * Math.PI - turn
  console.log(`  assist turn ${(turn * 180 / Math.PI).toFixed(1)} deg`)
  assert(world.bodies.some((body) => body.name === "Comet"), "comet survives the assist")
  assert(turn > (20 * Math.PI) / 180, "comet bends by more than 20 degrees")
}

{
  const { world } = buildScenario("impact")
  const before = momentum(world)
  const run = advance(world, 25000, 50)
  console.log(`  impact bodies ${world.bodies.length}, vx ${world.bodies[0]?.vx}`)
  assert(!run.limited, "impact resolves inside the step cap")
  assert(world.bodies.length === 1, "impact joins the two Earths")
  assert(Math.abs(world.bodies[0].vx) < 1e-4, "head-on remnant is nearly at rest")
  assert(Math.abs(world.bodies[0].gm - 2 * CONST.GM_EARTH) < 1, "impact keeps both masses")
  assert(before / SOLAR_MOMENTUM < 1e-12, "impact starts with zero momentum")
}

{
  const world = createWorld()
  const hole = createBody("blackhole")
  const rock = createBody("ceres")
  rock.x = hole.radius * 0.2
  addBody(world, hole)
  addBody(world, rock)
  integrate(world, 1, { maxSubsteps: 10 })
  assert(world.bodies.length === 1, "black hole captures a body inside the horizon")
  assert(world.bodies[0].kind === "blackhole", "remnant stays a black hole")
  assert(Math.abs(world.bodies[0].gm - (hole.gm + rock.gm)) < 1, "capture keeps the mass")
  assert(Math.abs(world.bodies[0].radius - (2 * world.bodies[0].gm) / (CONST.C ** 2)) < 1e-6, "horizon matches the new mass")
}

{
  const { world } = buildScenario("solar")
  const names = world.bodies.map((body) => body.name)
  assert(names.includes("Mercury") && names.includes("Neptune"), "solar system places the planets")
  const run = advance(world, 2 * 365.25 * 86400, 40 * 86400 / 60)
  const finite = world.bodies.every((body) => [body.x, body.y, body.vx, body.vy].every(Number.isFinite))
  console.log(`  solar drift ${energyDrift(world).toExponential(2)}, bodies ${world.bodies.length}`)
  assert(finite, "solar system stays finite for 2 years")
  assert(world.bodies.some((body) => body.name === "Mercury"), "Mercury is not swallowed at this time scale")
  assert(Math.abs(energyDrift(world)) < 1e-8, "solar system energy holds")
  assert(!run.limited, "solar system keeps the requested time scale")
}

{
  console.log("Drop a moon next to Earth, not into the Sun")
  const { world } = buildScenario("sun-earth")
  const earth = world.bodies.find((body) => body.name === "Earth")
  const sun = world.bodies.find((body) => body.name === "Sun")
  const lunar = 3.84399e8
  const x = earth.x + lunar
  const y = earth.y
  const host = placementHost(x, y, world.bodies)
  assert(host === earth, `the Moon's distance sits in Earth's Hill sphere (got ${host?.name})`)
  const moonPreset = createBody("moon")
  const inserted = insertionVelocity(x, y, moonPreset.gm, world.bodies)
  const relativeSpeed = Math.hypot(inserted.vx - earth.vx, inserted.vy - earth.vy)
  const circular = Math.sqrt((earth.gm + moonPreset.gm) / lunar)
  assert(Math.abs(relativeSpeed - circular) / circular < 1e-9, "drop speed is circular about Earth, not zero")
  assert(Math.abs(inserted.vx - earth.vx) / Math.max(Math.abs(earth.vx), 1) < 0.05, "the moon co-moves with Earth around the Sun")
  const moon = addBody(world, createBody("moon", { x, y, vx: inserted.vx, vy: inserted.vy }))
  const period = 2 * Math.PI * Math.sqrt((lunar ** 3) / (earth.gm + moon.gm))
  advance(world, period, 1800)
  const still = world.bodies.find((body) => body.id === moon.id)
  assert(still, "the moon is still in the scene")
  const earthNow = world.bodies.find((body) => body.name === "Earth")
  const sunNow = world.bodies.find((body) => body.name === "Sun")
  const earthDistance = relative(still, earthNow)
  assert(Math.abs(earthDistance - lunar) / lunar < 0.05, `the moon stays in Earth orbit (${(earthDistance / 1000).toFixed(0)} km)`)
  assert(relative(still, sunNow) > 0.9 * CONST.AU, "the moon does not fall into the Sun")
  const orbit = orbitAbout(still, world.bodies)
  assert(orbit?.primary === "Earth" && orbit.bound, "osculating partner is Earth and the orbit is bound")
}

{
  const { world } = buildScenario("sun-earth")
  const earth = world.bodies.find((body) => body.name === "Earth")
  const lunar = 3.84399e8
  const resting = createBody("moon", { x: earth.x + lunar, y: earth.y, vx: 0, vy: 0 })
  const parked = orbitAbout(resting, world.bodies)
  assert(parked && !parked.bound, "a moon left at rest next to Earth is unbound: Earth is already moving at 30 km/s")
  const dropped = createBody("moon", { x: earth.x + lunar, y: earth.y, ...insertionVelocity(earth.x + lunar, earth.y, resting.gm, world.bodies) })
  const path = orbitAbout(dropped, world.bodies)
  assert(path?.primary === "Earth" && path.bound && path.eccentricity < 0.02, "the insertion velocity is a bound circular Earth orbit")
}

{
  const { world } = buildScenario("sun-earth")
  const earth = world.bodies.find((body) => body.name === "Earth")
  const far = insertionVelocity(2 * CONST.AU, 0, 0, world.bodies)
  assert(far.host?.name === "Sun", "far from Earth the host is the Sun")
  const nearClick = insertionVelocity(earth.x + 0.02 * CONST.AU, earth.y, 0, world.bodies, null, { capture: 0.05 * CONST.AU })
  assert(nearClick.host?.name === "Earth", "a nearby click with a capture radius still chooses Earth")
  const moon = createBody("moon")
  const placed = insertionPlacement(earth.x + 0.02 * CONST.AU, earth.y, moon.gm, world.bodies, null, { capture: 0.05 * CONST.AU })
  const satDistance = Math.hypot(placed.x - earth.x, placed.y - earth.y)
  const sun = world.bodies.find((body) => body.name === "Sun")
  const hill = Math.hypot(earth.x - sun.x, earth.y - sun.y) * Math.cbrt(earth.m / (3 * sun.m))
  assert(placed.host?.name === "Earth", "a solar-zoom tap near Earth still hosts on Earth")
  assert(satDistance < hill, "the tap is snapped inside Earth's Hill sphere")
  assert(Math.abs(satDistance - 3.84399e8) / 3.84399e8 < 0.02, "the snap uses a lunar-scale circular orbit")
  const dropped = createBody("moon", { x: placed.x, y: placed.y, vx: placed.vx, vy: placed.vy })
  const path = orbitAbout(dropped, world.bodies)
  assert(path?.primary === "Earth" && path.bound && path.eccentricity < 0.02, "a tap near Earth at solar zoom is a bound Earth satellite")
}

{
  const { world, view } = buildScenario("smash")
  assert(world.bodies.length === 1, "smash starts with Earth alone")
  assert(world.bodies[0].name === "Earth", "smash Earth is Earth")
  assert(view.focus === "Earth", "smash camera locks on Earth")
  assert(Math.abs(view.span - 5.6 * 6.371e6) < 1, "smash camera hugs Earth")
  assert(view.timeScale === 1200, "smash plays in minutes, not years")
  const earth = world.bodies[0]
  const comet = createBody("comet", {
    x: earth.x + earth.radius + 12000,
    y: earth.y,
    vx: -2500,
    vy: 0,
  })
  const cometGm = comet.gm
  addBody(world, comet)
  const before = earth.gm
  advance(world, 8, 0.05)
  assert(world.bodies.length === 1, "a flung comet smashes into Earth")
  assert(Math.abs(world.bodies[0].gm - (before + cometGm)) < 1, "the smash keeps both masses, no extra debris GM")
}

if (failed) {
  console.error(`${failed} physics checks failed`)
  process.exitCode = 1
} else {
  console.log("All physics checks passed")
}
