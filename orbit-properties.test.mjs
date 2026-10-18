import {
  CONST,
  addBody,
  applyTwoBody,
  buildScenario,
  createBody,
  createWorld,
  integrate,
  orbitAbout,
  predictRemnant,
} from "./orbit-physics.js"
import { CATALOGUE, PHYS, coverage, evaluate } from "./orbit-properties.js"

let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`ok  ${message}`)
    return
  }
  failed += 1
  console.error(`FAIL  ${message}`)
}

function close(actual, expected, tolerance, message) {
  const relative = Math.abs(actual - expected) / Math.abs(expected)
  assert(relative < tolerance, `${message} (${actual} vs ${expected}, rel ${relative.toExponential(2)})`)
}

const SIM = { scene: "test", timeScale: 86400, frameRate: 60, wallSeconds: 0, camera: { x: 0, y: 0, mpp: 1e9 }, viewport: { w: 800, h: 600 } }

function value(report, name, sectionId) {
  for (const section of report) {
    if (sectionId && section.id !== sectionId) continue
    const row = section.rows.find((entry) => entry.name === name)
    if (row) return row
  }
  throw new Error(`no row named ${name}`)
}

function named(world, name) {
  return world.bodies.find((body) => body.name === name)
}

console.log("Registry shape")
{
  const counts = coverage()
  console.log(`  ${counts.total} items: ${counts.state} state, ${counts.input} input, ${counts.derived} derived, ${counts.none} not modeled`)
  const sectionIds = CATALOGUE.map((section) => section.id)
  const expected = [
    "1.1", "1.2", "1.3", "1.4", "1.5", "2.1", "2.2", "2.3",
    "3.1", "3.2", "3.3", "3.4", "4.1", "4.2", "4.3", "5.1", "5.2", "5.3",
    "6.1", "6.2", "6.3", "7.1", "7.2", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8",
    "9.1", "9.2", "9.3", "9.4", "10.1", "10.2", "11.1", "11.2", "11.3",
    "12.1", "12.2", "12.3", "13", "14", "15.1", "15.2", "15.3",
    "16.1", "16.2", "16.3", "16.4", "17.1", "17.2", "17.3", "17.4", "18", "19",
  ]
  assert(expected.every((id) => sectionIds.includes(id)), "every catalogue section from 1 to 19 is registered")
  assert(counts.total > 1900, "the full catalogue is registered")
  assert(counts.none > 1000 && counts.derived > 250, "not-modeled items outnumber derived ones, as they should")
  const names = new Set()
  let duplicate = null
  const badStatus = []
  const noReason = []
  for (const section of CATALOGUE) {
    for (const item of section.items) {
      const key = `${section.id}:${item.name}`
      if (names.has(key)) duplicate = key
      names.add(key)
      if (!["state", "input", "derived", "none"].includes(item.status)) badStatus.push(key)
      if (item.status === "none" && !(typeof item.reason === "string" && item.reason.length > 8)) noReason.push(key)
    }
  }
  assert(badStatus.length === 0, `every row has a status (${badStatus.join(", ") || "clean"})`)
  assert(noReason.length === 0, `every not-modeled row says why (${noReason.join(", ") || "clean"})`)
  assert(duplicate === null, `no duplicate rows within a section (${duplicate ?? "clean"})`)
}

console.log("Earth about the Sun")
{
  const { world } = buildScenario("sun-earth")
  const earth = named(world, "Earth")
  const sun = named(world, "Sun")
  const report = evaluate({ body: earth, world, sim: SIM })
  close(value(report, "Rest mass").value, 5.9722e24, 1e-4, "Earth mass from GM/G")
  close(value(report, "Mean density").value, 5514, 2e-3, "Earth mean density")
  close(value(report, "Hill radius").value, 1.4715e9, 2e-2, "Earth Hill radius at perihelion")
  close(value(report, "Escape speed").value, 42478, 1e-3, "escape speed from the Sun at perihelion, 0.983 AU")
  close(value(report, "Schwarzschild radius, where applicable").value, 8.87e-3, 2e-3, "Earth Schwarzschild radius 8.87 mm")
  close(value(report, "Gravitational-wave emission").value, 196, 0.1, "Sun-Earth gravitational-wave power near 200 W")
  const orbit = orbitAbout(earth, world.bodies)
  close(orbit.apoapsis, 1.00000011 * CONST.AU * (1 + 0.01671022), 1e-9, "apoapsis a(1+e)")
  close(orbit.periapsis, 1.00000011 * CONST.AU * (1 - 0.01671022), 1e-9, "periapsis a(1-e)")
  assert(orbit.trueAnomaly < 1e-9 || orbit.trueAnomaly > 2 * Math.PI - 1e-9, "starts at periapsis")
  assert(orbit.timeToPeriapsis === 0 || Math.abs(orbit.timeToPeriapsis - orbit.period) < 1, "no wait to periapsis at the start")
  const tidal = value(report, "Gravitational tidal tensor").value
  assert(typeof tidal === "string" && tidal.startsWith("stretch"), "tidal tensor reports eigenvalues")
  close(value(report, "Field gradient").value, (2 * sun.gm) / orbit.distance ** 3, 1e-9, "tidal stretch is 2GM/r^3 for a pair")
  close(value(report, "Jerk, or time derivative of acceleration").value, (sun.gm / orbit.distance ** 2) * (orbit.speed / orbit.distance), 1e-6, "jerk is a v / r at periapsis")
  const sunReport = evaluate({ body: sun, world, sim: SIM })
  close(value(sunReport, "Light deflection").value, 8.49e-6, 5e-3, "grazing light deflection at the Sun, 1.75 arcsec")
  close(value(sunReport, "Gravitational redshift", "2.1").value, 2.12e-6, 5e-3, "solar surface redshift")
  close(value(sunReport, "Schwarzschild radius, where applicable").value, 2953.25, 1e-4, "solar Schwarzschild radius")

  integrate(world, orbit.period / 2, { maxSubsteps: 20000 })
  const later = orbitAbout(earth, world.bodies)
  close(later.trueAnomaly, Math.PI, 1e-3, "half a period later Earth is at apoapsis")
  close(later.timeToPeriapsis, orbit.period / 2, 1e-3, "half a period remains to the next periapsis")
  const system = evaluate({ body: null, world, sim: SIM })
  assert(Math.abs(value(system, "Numerical momentum drift").value) < 1e-10, "momentum drift stays tiny")
  assert(Math.abs(value(system, "Numerical angular-momentum drift").value) < 1e-10, "angular momentum drift stays tiny")
  assert(value(system, "Mass conservation error").value === 0, "mass is conserved exactly")
  assert(value(system, "Integration-step count").value > 100, "step count is tracked")
  assert(value(system, "Force-evaluation count").value >= value(system, "Integration-step count").value, "force evaluations are tracked")
}

console.log("Circular system diagnostics")
{
  const world = createWorld()
  const sun = createBody("sun")
  const earth = createBody("earth")
  applyTwoBody(sun, earth, CONST.AU, 0, 0)
  addBody(world, sun)
  addBody(world, earth)
  const system = evaluate({ body: null, world, sim: SIM })
  close(value(system, "Virial ratio").value, 1, 1e-9, "circular orbit has 2K = |U|")
  close(value(system, "Binding-energy fraction").value, 0.5, 1e-9, "circular orbit binding fraction is one half")
  const momentum = value(system, "Total linear momentum").value
  assert(Math.hypot(momentum.x, momentum.y) / (sun.m * 30) < 1e-12, "barycentric setup has no net momentum")
  const center = value(system, "Center-of-mass position").value
  assert(Math.hypot(center.x, center.y) < 1, "barycenter sits at the origin")
  const earthReport = evaluate({ body: earth, world, sim: SIM })
  assert(value(earthReport, "Eccentricity").value < 1e-12, "circular eccentricity below 1e-12")
}

console.log("Moon, binary, and black hole")
{
  const { world } = buildScenario("earth-moon")
  const moon = named(world, "Moon")
  const report = evaluate({ body: moon, world, sim: SIM })
  close(value(report, "Roche limit").value, 9.49e6, 1e-2, "rigid Roche limit of the Moon about Earth, 9,490 km")
  const threshold = value(report, "Tidal disruption threshold").value
  assert(threshold.label.startsWith("outside"), "Moon sits outside its Roche limit")
  close(value(report, "Tidal acceleration").value, (2 * named(world, "Earth").gm * moon.radius) / 3.84399e8 ** 3, 1e-9, "tidal acceleration across the Moon")

  const binary = buildScenario("binary").world
  const star = binary.bodies[0]
  const binaryReport = evaluate({ body: star, world: binary, sim: SIM })
  close(value(binaryReport, "Roche-lobe radius").value / (2 * CONST.AU), 0.37892, 1e-3, "Eggleton lobe for q = 1 is 0.379 a")
  close(value(binaryReport, "Reduced mass").value, star.m / 2, 1e-9, "equal-mass reduced mass is m/2")

  const holeWorld = createWorld()
  const hole = createBody("blackhole")
  const sunMassHole = createBody("blackhole", { gm: CONST.GM_SUN, name: "Solar-mass hole" })
  sunMassHole.x = 10 * CONST.AU
  addBody(holeWorld, hole)
  addBody(holeWorld, sunMassHole)
  const holeReport = evaluate({ body: hole, world: holeWorld, sim: SIM })
  close(value(holeReport, "Innermost stable circular orbit").value, 3 * hole.radius, 1e-12, "ISCO is 3 Rs")
  close(value(holeReport, "Photon-sphere radius, where applicable").value, 1.5 * hole.radius, 1e-12, "photon sphere is 1.5 Rs")
  const solarReport = evaluate({ body: sunMassHole, world: holeWorld, sim: SIM })
  close(value(solarReport, "Black-hole temperature in semiclassical models").value, 6.17e-8, 5e-3, "Hawking temperature of a solar-mass hole")
  close(value(solarReport, "Bekenstein–Hawking entropy").value, 1.45e54, 1e-2, "Bekenstein-Hawking entropy of a solar-mass hole")
  close(value(solarReport, "Surface gravity of the horizon").value, 1.52e13, 1e-2, "horizon surface gravity of a solar-mass hole")
  close(value(solarReport, "Quasinormal-mode frequencies").value, 12060, 1e-2, "fundamental ringdown near 12 kHz for one solar mass")
  assert(value(holeReport, "Mean density").shown === false, "no mean density for a black hole")
  assert(value(holeReport, "Gravitational redshift", "2.3").shown === true, "black-hole redshift row is shown for a hole")
}

console.log("Inner planets: neighbors and stability")
{
  const { world } = buildScenario("inner")
  const earth = named(world, "Earth")
  const report = evaluate({ body: earth, world, sim: SIM })
  close(value(report, "Synodic period").value / 86400, 583.9, 1e-2, "Earth-Venus synodic period 584 days")
  const ratio = value(report, "Resonance ratios").value
  assert(typeof ratio === "string" && ratio.startsWith("1.62") && ratio.includes("Venus"), `period ratio with Venus (${ratio})`)
  const hill = value(report, "Hill stability indicators").value
  assert(hill.includes("Hill stable") && Number.parseFloat(hill) > 20, `Earth and Venus are Hill stable (${hill})`)
  const nothing = evaluate({ body: null, world, sim: SIM })
  assert(nothing.every((section) => section.rows.every((row) => row.scope !== "body" || row.shown === false)), "body rows wait when nothing is selected")
  const flagged = value(nothing, "Approximation flags").value
  assert(flagged.includes("newtonian") && !flagged.includes("relativistic"), "approximation flags list the model")
}

console.log("JPL reference inputs and derived stellar quantities")
{
  const { world } = buildScenario("sun-earth")
  const earth = named(world, "Earth")
  const sun = named(world, "Sun")
  const report = evaluate({ body: earth, world, sim: SIM })
  close(value(report, "Surface gravity", "9.1").value, 9.82, 2e-3, "Earth surface gravity 9.82 m/s^2")
  close(value(report, "Escape velocity", "6.2").value, 11186, 2e-3, "Earth surface escape 11.19 km/s")
  close(value(report, "Rotation period", "1.4").value, 86164.1, 1e-9, "Earth sidereal day")
  close(value(report, "Oblateness coefficient J_2").value, 1.08263e-3, 1e-9, "Earth J2")
  close(value(report, "Tidal Love numbers", "2.1").value, 0.3, 1e-9, "Earth k2")
  close(value(report, "Magnetic dipole moment", "4.2").value, 7.75e22, 1e-9, "Earth dipole")
  close(value(report, "Radiative equilibrium temperature").value, 256, 2e-2, "Earth equilibrium temperature near 255 K")
  close(value(report, "Equatorial radius", "1.3").value, 6378137, 1e-9, "Earth equatorial radius from JPL")
  close(value(report, "Flattening", "1.3").value, (6378137 - 6356752) / 6378137, 1e-6, "Earth flattening from published radii")
  const sunReport = evaluate({ body: sun, world, sim: SIM })
  close(value(sunReport, "Luminosity", "5.1").value, PHYS.L_SUN, 1e-12, "IAU nominal solar luminosity")
  close(value(sunReport, "Eddington luminosity").value, 1.26e31, 5e-2, "solar Eddington luminosity ~ 1.3e31 W")
  close(value(sunReport, "Dynamical timescale").value, 1594, 2e-2, "solar dynamical time ~ 27 minutes")
  const noneRow = value(report, "Core temperature")
  assert(noneRow.status === "none" && noneRow.reason.length > 8, "core temperature is listed as not modeled")
}

console.log("Pulsar, white dwarf, and remnant rules")
{
  const world = createWorld()
  const pulsar = createBody("pulsar")
  const dwarf = createBody("whitedwarf")
  dwarf.x = CONST.AU
  addBody(world, pulsar)
  addBody(world, dwarf)
  const pulse = evaluate({ body: pulsar, world, sim: SIM })
  close(value(pulse, "Pulse period").value, 0.0334, 1e-9, "Crab period")
  close(value(pulse, "Characteristic age estimate").value, 0.0334 / (2 * 4.21e-13), 1e-9, "P / 2 Pdot")
  close(value(pulse, "Magnetic-field estimate").value, 3.2e15 * Math.sqrt(0.0334 * 4.21e-13), 1e-9, "orthogonal-rotator field")
  close(value(pulse, "Spin-down luminosity", "8.6").value, 4.46e31, 2e-2, "Crab spin-down luminosity")
  const dwarfReport = evaluate({ body: dwarf, world, sim: SIM })
  close(value(dwarfReport, "Chandrasekhar mass-limit comparison").value, 1.018 / 1.44, 1e-3, "Sirius B is below Chandrasekhar")
  const pair = predictRemnant(createBody("whitedwarf"), createBody("whitedwarf"))
  assert(pair.kind === "neutron", `two 1.018-sun white dwarfs merge to a neutron star (${pair.kind})`)
  const holes = predictRemnant(createBody("pulsar"), createBody("pulsar"))
  assert(holes.kind === "blackhole", `two 1.4-sun neutron stars merge above 2.5 Msun to a black hole (${holes.kind})`)
}

console.log("Peters gravitational-wave decay is reported, not applied")
{
  const { world } = buildScenario("sun-earth")
  const earth = named(world, "Earth")
  const report = evaluate({ body: earth, world, sim: SIM })
  const decay = value(report, "Orbital decay rate", "12.1").value
  assert(decay < 0 && Math.abs(decay) < 1e-12, `Sun-Earth Peters da/dt is tiny (${decay} m/s)`)
  const merger = value(report, "Merger time estimate").value
  assert(merger > 1e20 * 365.25 * 86400, `Sun-Earth gravitational-wave merger time is longer than the age of the universe (${merger} s)`)
  const sun = named(world, "Sun")
  const chirp = value(report, "Chirp mass").value
  close(chirp, (earth.m * sun.m) ** 0.6 / (earth.m + sun.m) ** 0.2, 1e-9, "chirp mass is (m1 m2)^(3/5) / M^(1/5)")
}

if (failed) {
  console.error(`${failed} property checks failed`)
  process.exitCode = 1
} else {
  console.log("All property checks passed")
}
