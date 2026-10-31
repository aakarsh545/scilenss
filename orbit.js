import {
  CATALOG,
  CONST,
  MAX_BODIES,
  SCENARIOS,
  addBody,
  buildScenario,
  createBody,
  energyDrift,
  flightGuide,
  forecast,
  dominantPartner,
  insertionPlacement,
  insertionVelocity,
  integrate,
  removeBody,
  setVelocity,
  worldFromSnapshot,
} from "./orbit-physics.js"
import { REGISTRY_VERSION, coverage, evaluate } from "./orbit-properties.js"
import { currentUser, request } from "./auth.js"
import { earthGlobe, earthSpin, isEarthBody } from "./earth-globe.js"
import { drawSphere, mix, withAlpha } from "./body-visuals.js"

const globe = earthGlobe()
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
const AIM_PIXELS = 140
const KITS = [
  { id: "smash", name: "Smash", ids: ["comet", "ceres", "moon"] },
  { id: "worlds", name: "Worlds", ids: ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"] },
  { id: "fire", name: "Fire", ids: ["sun", "redgiant", "whitedwarf"] },
  { id: "holes", name: "Holes", ids: ["pulsar", "blackhole", "sgra"] },
]
const T_MIN = 1
const T_MAX = 365.25 * 86400

const canvas = document.querySelector("#field")
const ctx = canvas.getContext("2d", { alpha: false })
const presetsEl = document.querySelector("#presets")
const sceneEl = document.querySelector("#scene")
const timeEl = document.querySelector("#time-scale")
const timeValueEl = document.querySelector("#time-value")
const pauseEl = document.querySelector("#pause")
const trailsEl = document.querySelector("#trails")
const fitEl = document.querySelector("#fit")
const clearEl = document.querySelector("#clear")
const emptyEl = document.querySelector("#empty")
const kitEl = document.querySelector("#kit")
const statusEl = document.querySelector("#status")
const simTimeEl = document.querySelector("#sim-time")
const rateEl = document.querySelector("#rate")
const bodyCountEl = document.querySelector("#body-count")
const driftEl = document.querySelector("#drift")
const scaleEl = document.querySelector("#scale-readout")
const brushEl = document.querySelector("#brush")
const speedEl = document.querySelector("#speed")
const dockEl = document.querySelector("#controls")

const camera = { x: 0, y: 0, mpp: CONST.AU / 90 }
const pointers = new Map()
let world = buildScenario("smash").world
let stars = null
let trailsOn = true
let paused = false
let selectedId = null
let presetId = "comet"
let kitId = "smash"
let shake = { amp: 0, until: 0, ms: 1 }
let smashHold = null
let drag = null
let pinch = null
let forecastSamples = []
let forecastAt = 0
let effects = []
let timeScale = 20 * 86400
let lastFrame = performance.now()
let thrownFast = false
let frameRate = 60
let sheetOpen = false
let sheetKey = ""
let sheetRows = new Map()
let sheetTick = 0
const wallStart = performance.now()

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function viewSize() {
  return { w: canvas.clientWidth, h: canvas.clientHeight }
}

function worldToScreen(x, y) {
  const { w, h } = viewSize()
  return {
    x: w / 2 + (x - camera.x) / camera.mpp,
    y: h / 2 - (y - camera.y) / camera.mpp,
  }
}

function screenToWorld(x, y) {
  const { w, h } = viewSize()
  return {
    x: camera.x + (x - w / 2) * camera.mpp,
    y: camera.y - (y - h / 2) * camera.mpp,
  }
}

function zoomAt(sx, sy, next) {
  const before = screenToWorld(sx, sy)
  camera.mpp = clamp(next, 200, 1e15)
  const after = screenToWorld(sx, sy)
  camera.x += before.x - after.x
  camera.y += before.y - after.y
}

function sliderToScale(value) {
  const t = Number(value) / 1000
  return T_MIN * (T_MAX / T_MIN) ** t
}

function scaleToSlider(scale) {
  return Math.round((1000 * Math.log(scale / T_MIN)) / Math.log(T_MAX / T_MIN))
}

function formatRate(scale) {
  if (scale < 50) return `${scale < 10 ? scale.toFixed(1) : Math.round(scale)} sec / sec`
  if (scale < 5400) return `${(scale / 60).toFixed(scale < 600 ? 1 : 0)} min / sec`
  if (scale < 2 * 86400) return `${(scale / 3600).toFixed(scale < 10 * 3600 ? 1 : 0)} hr / sec`
  if (scale < 60 * 86400) return `${(scale / 86400).toFixed(scale < 10 * 86400 ? 1 : 0)} days / sec`
  return `${(scale / 86400 / 365.25).toFixed(2)} yr / sec`
}

function formatSimTime(seconds) {
  const day = 86400
  if (seconds < 1) return `${sci(seconds, 3)} seconds`
  if (seconds < 90) return `${seconds.toFixed(1)} seconds`
  if (seconds < 2 * day) return `${(seconds / 3600).toFixed(2)} hours`
  if (seconds < 800 * day) return `${(seconds / day).toFixed(1)} days`
  return `${(seconds / day / 365.25).toFixed(2)} years`
}

function formatMass(gm) {
  if (!(gm > 0)) return "0 kg"
  const suns = gm / CONST.GM_SUN
  if (suns >= 1e6) return `${(suns / 1e6).toFixed(3)} million suns`
  if (suns >= 0.05) return `${suns >= 10 ? suns.toFixed(suns >= 100 ? 0 : 1) : suns.toFixed(2)} suns`
  const earths = gm / CONST.GM_EARTH
  if (earths >= 0.05) return `${earths.toFixed(earths >= 10 ? 1 : 2)} Earth masses`
  const kg = gm / CONST.G
  const exp = Math.floor(Math.log10(kg))
  return `${(kg / 10 ** exp).toFixed(2)} × 10^${exp} kg`
}

function formatLength(meters) {
  if (meters >= CONST.AU) return `${(meters / CONST.AU).toFixed(meters >= 10 * CONST.AU ? 1 : 2)} AU`
  if (meters >= 0.01 * CONST.AU) return `${(meters / CONST.AU).toFixed(3)} AU`
  if (meters >= 1000) return `${Math.round(meters / 1000).toLocaleString("en-US")} km`
  if (meters >= 1) return `${meters < 10 ? meters.toFixed(2) : Math.round(meters)} m`
  if (meters >= 1e-3) return `${(meters * 1000).toPrecision(3)} mm`
  return `${meters.toExponential(2)} m`
}

function sci(value, digits = 4) {
  if (value === 0) return "0"
  const magnitude = Math.abs(value)
  if (magnitude >= 1e-3 && magnitude < 1e6) return Number(value.toPrecision(digits)).toLocaleString("en-US", { maximumFractionDigits: 6 })
  const [mantissa, exponent] = value.toExponential(digits - 1).split("e")
  return `${mantissa} × 10^${Number(exponent)}`
}

function formatQuantity(value, unit) {
  if (value == null) return "n/a"
  if (value === Infinity) return "infinite"
  if (value === 0 && unit === "kg") return "0 kg"
  if (typeof value === "string") return value
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (typeof value === "object") {
    if ("x" in value) {
      const base = unit.replace("vec ", "")
      const part = (component) => (Object.is(component, -0) || component === 0 ? formatQuantity(0, base) : component < 0 ? `-${formatQuantity(-component, base)}` : formatQuantity(component, base))
      return `(${part(value.x)}, ${part(value.y)})`
    }
    if ("length" in value) return `${formatLength(value.length)}, ${value.label}`
    if ("times" in value) {
      const labels = (value.label ?? "").split(",").map((label) => label.trim())
      return value.times.map((time, index) => (labels[index] ? `${labels[index]} in ${formatSimTime(time)}` : formatSimTime(time))).join(", ")
    }
    return String(value)
  }
  if (typeof value === "number" && value < 0 && ["m", "m/s", "s"].includes(unit)) return `-${formatQuantity(-value, unit)}`
  switch (unit) {
    case "m":
      return formatLength(value)
    case "kg":
      return `${formatMass(value * CONST.G)} (${sci(value)} kg)`
    case "m/s":
      return formatSpeed(value)
    case "s":
      return formatSimTime(value)
    case "rad":
      return formatAngle(value)
    case "ratio":
      if (value !== 1 && Math.abs(1 - value) < 1e-4) return `1 - ${sci(1 - value, 3)}`
      return sci(value)
    case "count":
      return Math.round(value).toLocaleString("en-US")
    case "text":
      return String(value)
    default:
      return `${sci(value)} ${unit}`
  }
}

function formatSpeed(speed) {
  if (speed >= 0.01 * CONST.C) return `${(speed / CONST.C).toFixed(3)} c`
  if (speed >= 1000) return `${(speed / 1000).toFixed(speed >= 100000 ? 0 : speed >= 10000 ? 1 : 2)} km/s`
  if (speed >= 10) return `${speed.toFixed(0)} m/s`
  if (speed >= 0.01) return `${speed.toFixed(speed >= 1 ? 1 : 3)} m/s`
  return speed === 0 ? "0 m/s" : `${speed.toExponential(2)} m/s`
}

function formatAngle(radians) {
  const degrees = (radians * 180) / Math.PI
  if (Math.abs(degrees) >= 0.01) return `${degrees.toFixed(2)} deg`
  const arcsec = degrees * 3600
  if (Math.abs(arcsec) >= 0.01) return `${arcsec.toPrecision(3)} arcsec`
  return degrees === 0 ? "0 deg" : `${(arcsec * 1000).toPrecision(3)} mas`
}

function formatDrift(drift) {
  if (drift == null || !Number.isFinite(drift)) return "n/a"
  if (Math.abs(drift) < 1e-15) return "< 1e-15"
  return drift.toExponential(1)
}

function niceMeters(meters) {
  const exp = Math.floor(Math.log10(Math.max(meters, 1e-9)))
  const base = meters / 10 ** exp
  const mantissa = base >= 5 ? 5 : base >= 2 ? 2 : 1
  return mantissa * 10 ** exp
}

let statusTimer = 0

function setStatus(message, { sticky = false } = {}) {
  statusEl.textContent = message
  window.clearTimeout(statusTimer)
  if (message && !sticky) {
    statusTimer = window.setTimeout(() => {
      statusEl.textContent = ""
    }, 4200)
  }
}

function selectedPreset() {
  return CATALOG.find((entry) => entry.id === presetId) ?? CATALOG[0]
}

function radiusPx(body) {
  return body.radius / camera.mpp
}

function drawRadius(body) {
  const physical = radiusPx(body)
  if (body.kind === "blackhole") return { physical, draw: Math.max(physical, 5.5), marker: physical < 2 }
  const floor = body.kind === "comet" || body.kind === "asteroid" || body.kind === "moon" ? 8 : 4
  return { physical, draw: Math.max(physical, floor), marker: physical < floor }
}

function hitBody(sx, sy) {
  let found = null
  let best = Infinity
  for (const body of world.bodies) {
    const screen = worldToScreen(body.x, body.y)
    const reach = Math.max(drawRadius(body).draw, 8) + 5
    const distance = Math.hypot(screen.x - sx, screen.y - sy)
    if (distance <= reach && distance < best) {
      best = distance
      found = body
    }
  }
  return found
}

function captureMeters() {
  return 64 * camera.mpp
}

function othersForThrow() {
  return world.bodies.filter((body) => body.id !== drag?.bodyId)
}

function velocityFromDrag(dx, dy, origin, gmSelf) {
  const others = othersForThrow()
  const options = { capture: captureMeters() }
  const guide = flightGuide(origin.x, origin.y, gmSelf, others, options)
  const reference = guide?.circular || 20000
  const windowSeconds = (AIM_PIXELS * camera.mpp) / reference
  const relative = {
    vx: (dx * camera.mpp) / windowSeconds,
    vy: (-dy * camera.mpp) / windowSeconds,
  }
  const inserted = insertionVelocity(origin.x, origin.y, gmSelf, others, relative, options)
  return {
    vx: inserted.vx,
    vy: inserted.vy,
    relativeSpeed: inserted.relativeSpeed,
    guide,
    windowSeconds,
  }
}

function clearCenter() {
  const dock = dockEl.getBoundingClientRect()
  return {
    x: window.innerWidth / 2,
    y: dock.top / 2,
  }
}

function park(focusX, focusY) {
  const { w, h } = viewSize()
  const center = clearCenter()
  camera.x = focusX - (center.x - w / 2) * camera.mpp
  camera.y = focusY - (h / 2 - center.y) * camera.mpp
}

function frameCamera(view) {
  if (view?.span) {
    const focus = world.bodies.find((body) => body.name === view.focus) ?? world.bodies[0]
    const { w, h } = viewSize()
    camera.mpp = view.span / Math.max(1, Math.min(w, h))
    park(focus?.x ?? 0, focus?.y ?? 0)
    return
  }
  fitWorld()
}

function framePair(host, distance) {
  const { w, h } = viewSize()
  const span = Math.max(distance * 2.8, host.radius * 8, 1e7)
  camera.mpp = span / Math.max(1, Math.min(w, h) * 0.72)
  park(host.x, host.y)
}

function watchSatellite(host, distance) {
  if (!host || !(distance > 0)) return
  if (host.kind === "star" || host.kind === "giantstar" || host.kind === "blackhole") return
  if (distance / camera.mpp >= 48) return
  framePair(host, distance)
  if (timeScale > 2 * 86400) {
    timeScale = 86400
    timeEl.value = String(scaleToSlider(timeScale))
  }
}

function fitWorld() {
  const { w, h } = viewSize()
  if (!world.bodies.length || w < 2 || h < 2) {
    camera.x = 0
    camera.y = 0
    camera.mpp = CONST.AU / 80
    return
  }
  let mass = 0
  let cx = 0
  let cy = 0
  for (const body of world.bodies) {
    mass += body.m
    cx += body.m * body.x
    cy += body.m * body.y
  }
  cx /= mass
  cy /= mass
  let reach = 0
  for (const body of world.bodies) {
    reach = Math.max(reach, Math.hypot(body.x - cx, body.y - cy) + body.radius)
  }
  camera.mpp = (Math.max(reach, 1e6) * 2.75) / Math.min(w, h)
  park(cx, cy)
}

function applyScenario(id, { adoptTime = true } = {}) {
  const built = buildScenario(id)
  world = built.world
  selectedId = null
  effects = []
  forecastSamples = []
  drag = null
  smashHold = null
  shake.amp = 0
  if (adoptTime && built.view.timeScale) {
    timeScale = built.view.timeScale
    timeEl.value = String(scaleToSlider(timeScale))
  }
  frameCamera(built.view)
  if (id === "smash" || id === "impact") choosePreset("comet")
  bodyCountEl.textContent = String(world.bodies.length)
  setStatus(id === "smash" ? "Earth is waiting. Fling a comet into it." : "")
}

function setPaused(next) {
  paused = next
  pauseEl.dataset.state = paused ? "play" : "pause"
  pauseEl.setAttribute("aria-label", paused ? "Play" : "Pause")
  pauseEl.setAttribute("aria-pressed", String(paused))
}

function revealPreset(label) {
  presetsEl.classList.toggle("loadout--overflow", presetsEl.scrollWidth > presetsEl.clientWidth + 4)
  const left = label.offsetLeft - (presetsEl.clientWidth - label.offsetWidth) / 2
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  presetsEl.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" })
}

function kitForPreset(id) {
  return KITS.find((kit) => kit.ids.includes(id)) ?? KITS[0]
}

function choosePreset(id) {
  const kit = kitForPreset(id)
  kitId = kit.id
  presetId = kit.ids.includes(id) ? id : kit.ids[0]
  buildKits()
  buildPresets()
}

function buildKits() {
  kitEl.replaceChildren()
  for (const kit of KITS) {
    const button = document.createElement("button")
    button.type = "button"
    button.id = `kit-${kit.id}`
    button.setAttribute("role", "tab")
    button.setAttribute("aria-selected", String(kit.id === kitId))
    button.setAttribute("aria-controls", "presets")
    button.textContent = kit.name
    button.addEventListener("click", () => {
      kitId = kit.id
      if (!kit.ids.includes(presetId)) presetId = kit.ids[0]
      buildKits()
      buildPresets()
    })
    kitEl.append(button)
  }
}

function buildPresets() {
  const kit = KITS.find((entry) => entry.id === kitId) ?? KITS[0]
  let selected = null
  presetsEl.replaceChildren()
  for (const preset of CATALOG.filter((entry) => kit.ids.includes(entry.id))) {
    const label = document.createElement("label")
    label.className = "preset"
    label.title = preset.detail
    const input = document.createElement("input")
    input.type = "radio"
    input.name = "preset"
    input.value = preset.id
    input.checked = preset.id === presetId
    const swatch = document.createElement("span")
    swatch.className = "preset__swatch"
    swatch.dataset.kind = preset.kind
    swatch.style.setProperty("--swatch", preset.color)
    const name = document.createElement("span")
    name.textContent = preset.name
    label.append(input, swatch, name)
    input.addEventListener("change", () => {
      if (!input.checked) return
      presetId = preset.id
      revealPreset(label)
    })
    if (input.checked) selected = label
    presetsEl.append(label)
  }
  if (!selected && presetsEl.firstElementChild) {
    const first = presetsEl.querySelector("input")
    if (first) {
      first.checked = true
      presetId = first.value
      selected = first.closest(".preset")
    }
  }
  if (selected) revealPreset(selected)
}

function buildScenes() {
  for (const scenario of SCENARIOS) {
    const option = document.createElement("option")
    option.value = scenario.id
    option.textContent = scenario.name
    option.title = scenario.detail
    sceneEl.append(option)
  }
  sceneEl.value = "smash"
}

function markSavedScene(name) {
  let option = sceneEl.querySelector('option[value="saved"]')
  if (!option) {
    option = document.createElement("option")
    option.value = "saved"
    sceneEl.prepend(option)
  }
  option.textContent = name
  sceneEl.value = "saved"
}

function snapshotWorld() {
  return {
    time: world.time,
    nextId: world.nextId,
    timeScale,
    camera: { x: camera.x, y: camera.y, mpp: camera.mpp },
    bodies: world.bodies.map((body) => ({
      name: body.name,
      kind: body.kind,
      gm: body.gm,
      radius: body.radius,
      x: body.x,
      y: body.y,
      vx: body.vx,
      vy: body.vy,
      color: body.color,
    })),
  }
}

function restoreProject(project) {
  const loaded = worldFromSnapshot(project.snapshot)
  world = loaded.world
  selectedId = null
  effects = []
  forecastSamples = []
  drag = null
  timeScale = loaded.view.timeScale
  timeEl.value = String(scaleToSlider(timeScale))
  camera.x = loaded.view.camera.x
  camera.y = loaded.view.camera.y
  camera.mpp = loaded.view.camera.mpp
  markSavedScene(project.name)
  setStatus(`Opened ${project.name}, saved for ${project.email}.`)
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const { w, h } = { w: window.innerWidth, h: window.innerHeight }
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  stars = makeStars(w, h, dpr)
  document.documentElement.style.setProperty("--dock-h", `${dockEl.offsetHeight}px`)
  const selected = presetsEl.querySelector("input:checked")?.closest(".preset")
  if (selected) revealPreset(selected)
}

function makeStars(width, height, dpr) {
  const field = document.createElement("canvas")
  field.width = Math.round(width * dpr)
  field.height = Math.round(height * dpr)
  const starCtx = field.getContext("2d")
  starCtx.scale(dpr, dpr)
  const count = Math.round((width * height) / 11000)
  for (let index = 0; index < count; index += 1) {
    const alpha = 0.22 + Math.random() * 0.5
    starCtx.fillStyle = `rgba(235, 230, 220, ${alpha})`
    starCtx.beginPath()
    starCtx.arc(Math.random() * width, Math.random() * height, Math.random() < 0.9 ? 0.7 : 1.15, 0, Math.PI * 2)
    starCtx.fill()
  }
  return field
}

const KIND_LABEL = {
  comet: "Comet",
  asteroid: "Asteroid",
  moon: "Moon",
  planet: "Planet",
  giant: "Giant planet",
  star: "Star",
  giantstar: "Red giant",
  whitedwarf: "White dwarf",
  pulsar: "Pulsar",
  neutron: "Neutron star",
  blackhole: "Black hole",
}

function updateReadout(liveSpeed) {
  const preset = selectedPreset()
  const inspect = document.querySelector("#inspect")
  const selected = world.bodies.find((body) => body.id === selectedId)
  simTimeEl.textContent = formatSimTime(world.time)
  rateEl.textContent = world.limited && !paused
    ? `${formatRate(timeScale)}, held for accuracy`
    : formatRate(timeScale)
  timeValueEl.textContent = formatRate(timeScale)
  bodyCountEl.textContent = String(world.bodies.length)
  driftEl.textContent = formatDrift(energyDrift(world))
  scaleEl.textContent = formatLength(niceMeters(112 * camera.mpp))
  brushEl.textContent = `${preset.name}, ${formatMass(preset.gm)}, ${preset.kind === "blackhole" ? formatLength((2 * preset.gm) / (CONST.C ** 2)) : formatLength(preset.radius)}`
  inspect.hidden = !selected
  if (selected) {
    document.querySelector("#inspect-name").textContent = selected.name
  }
  syncWarp()
  if (liveSpeed) {
    const guide = liveSpeed.guide
    const shown = liveSpeed.relativeSpeed ?? liveSpeed.speed
    speedEl.textContent = guide
      ? `${formatSpeed(shown)} about ${guide.name} (circular ${formatSpeed(guide.circular)})`
      : formatSpeed(shown)
    return
  }
  speedEl.textContent = selected ? formatSpeed(Math.hypot(selected.vx, selected.vy)) : "n/a"
}

const STATUS_LABEL = { state: "state", input: "reference", derived: "derived" }

function simContext(now) {
  const { w, h } = viewSize()
  return {
    scene: sceneEl.value,
    timeScale,
    frameRate,
    wallSeconds: (now - wallStart) / 1000,
    camera: { x: camera.x, y: camera.y, mpp: camera.mpp },
    viewport: { w, h },
    paused,
    trails: trailsOn,
    registryVersion: REGISTRY_VERSION,
  }
}

function setSheetOpen(open) {
  sheetOpen = open
  document.querySelector("#sheet").hidden = !open
  document.querySelector("#physics").setAttribute("aria-expanded", String(open))
  document.querySelector("#inspect").classList.toggle("inspect--lifted", open)
  if (open) renderSheet(performance.now(), true)
}

function sheetScope(selected) {
  const summary = coverage()
  const coverageEl = document.querySelector("#sheet-coverage")
  coverageEl.textContent = `${summary.derived + summary.state + summary.input} of ${summary.total} catalogue items computed or read from reference data, ${summary.none} not modeled, with the reason shown. Registry v${REGISTRY_VERSION}.`
  document.querySelector("#sheet-scope").textContent = selected
    ? `${selected.name}, ${KIND_LABEL[selected.kind] ?? selected.kind}. Body rows describe this object; system and simulation rows describe the whole scene.`
    : "No body selected. Tap a body to add its rows. System and simulation rows describe the whole scene."
}

function buildSheet(report, selected) {
  const bodyEl = document.querySelector("#sheet-body")
  sheetRows = new Map()
  const fragment = document.createDocumentFragment()
  for (const section of report) {
    const block = document.createElement("section")
    block.className = "sheet__section"
    const heading = document.createElement("h3")
    heading.textContent = `${section.id} ${section.title}`
    block.append(heading)
    const list = document.createElement("dl")
    const skipped = []
    for (const row of section.rows) {
      if (row.status === "none") {
        skipped.push(row)
        continue
      }
      if (!row.shown) continue
      const wrap = document.createElement("div")
      wrap.className = "sheet__row"
      const term = document.createElement("dt")
      term.textContent = row.name
      const tag = document.createElement("span")
      tag.className = `sheet__tag sheet__tag--${row.status}`
      tag.textContent = STATUS_LABEL[row.status] ?? row.status
      term.append(tag)
      const detail = document.createElement("dd")
      const valueEl = document.createElement("span")
      detail.append(valueEl)
      if (row.note) {
        const note = document.createElement("small")
        note.textContent = row.note
        detail.append(note)
      }
      wrap.append(term, detail)
      list.append(wrap)
      sheetRows.set(`${section.id}:${row.name}`, { valueEl, unit: row.unit })
    }
    if (list.childElementCount) block.append(list)
    const waiting = section.rows.filter((row) => row.status !== "none" && !row.shown && row.waiting)
    if (!list.childElementCount && !skipped.length && !waiting.length) continue
    if (waiting.length) {
      const details = document.createElement("details")
      const summary = document.createElement("summary")
      summary.textContent = `${waiting.length} ${waiting.length === 1 ? "item waits" : "items wait"} for a selection or a different body`
      const items = document.createElement("ul")
      for (const row of waiting) {
        const item = document.createElement("li")
        item.textContent = `${row.name}: ${row.waiting}`
        items.append(item)
      }
      details.append(summary, items)
      block.append(details)
    }
    if (skipped.length) {
      const details = document.createElement("details")
      const summary = document.createElement("summary")
      summary.textContent = `${skipped.length} not modeled`
      const items = document.createElement("ul")
      for (const row of skipped) {
        const item = document.createElement("li")
        const name = document.createElement("b")
        name.textContent = row.name
        item.append(name, `: ${row.reason}`)
        items.append(item)
      }
      details.append(summary, items)
      block.append(details)
    }
    fragment.append(block)
  }
  bodyEl.replaceChildren(fragment)
  sheetScope(selected)
}

function renderSheet(now, force = false) {
  if (!sheetOpen) return
  if (!force && now - sheetTick < 250) return
  sheetTick = now
  const selected = world.bodies.find((body) => body.id === selectedId) ?? null
  const report = evaluate({ body: selected, world, sim: simContext(now) })
  const key = `${selected?.id ?? "none"}:${selected?.kind ?? ""}:${world.bodies.length}:${report.map((section) => section.rows.filter((row) => row.shown).length).join(",")}`
  if (force || key !== sheetKey) {
    sheetKey = key
    buildSheet(report, selected)
  }
  for (const section of report) {
    for (const row of section.rows) {
      if (!row.shown) continue
      const target = sheetRows.get(`${section.id}:${row.name}`)
      if (!target) continue
      const text = formatQuantity(row.value, row.unit)
      if (target.valueEl.textContent !== text) target.valueEl.textContent = text
    }
  }
}

function syncWarp() {
  const buttons = document.querySelectorAll("#warp-menu button")
  let best = null
  let bestDiff = Infinity
  for (const button of buttons) {
    const diff = Math.abs(Math.log(Number(button.dataset.scale)) - Math.log(timeScale))
    if (diff < bestDiff) {
      best = button
      bestDiff = diff
    }
  }
  for (const button of buttons) {
    button.setAttribute("aria-pressed", String(button === best && bestDiff < Math.log(1.15)))
  }
}

function playbackScale(now) {
  if (smashHold && now < smashHold.until) return smashHold.scale
  smashHold = null
  return timeScale
}

function followSmash() {
  if (sceneEl.value !== "smash" || !world.bodies.length) return
  let heaviest = world.bodies[0]
  for (const body of world.bodies) {
    if (body.m > heaviest.m) heaviest = body
  }
  park(heaviest.x, heaviest.y)
}

function smashBurst(merge, now) {
  const remnant = world.bodies.find((body) => body.id === merge.id)
  const swallowed = remnant?.kind === "blackhole"
  const count = reducedMotion.matches ? 6 : swallowed ? 10 : 20
  const shards = []
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.28
    const speed = (70 + Math.random() * 160) * camera.mpp
    shards.push({
      angle,
      speed,
      radius: 1.4 + Math.random() * 2.4,
      tint: Math.random() > 0.45 ? mix(merge.color, "#fff3d6", 0.55) : merge.color,
    })
  }
  effects.push({
    type: "smash",
    x: merge.x,
    y: merge.y,
    color: merge.color,
    born: now,
    life: reducedMotion.matches ? 420 : 980,
    shards,
    swallowed,
  })
  if (!reducedMotion.matches) {
    shake = { amp: swallowed ? 10 : 16, until: now + 480, ms: 480 }
    smashHold = { until: now + 560, scale: Math.max(1, timeScale * 0.08) }
  }
}

function noteMerges() {
  if (!world.merges.length) return
  const now = performance.now()
  for (const merge of world.merges) {
    smashBurst(merge, now)
    if (merge.consumed.includes(selectedId)) selectedId = merge.id
  }
  const latest = world.merges[world.merges.length - 1]
  const remnant = world.bodies.find((body) => body.id === latest.id)
  const inbound = latest.parents.find((name) => name !== latest.name) ?? latest.parents[0]
  setStatus(remnant?.kind === "blackhole"
    ? `${inbound} swallowed by ${latest.name}.`
    : `${inbound} smashed into ${latest.name}.`)
  world.merges = []
}

function sampleTrails() {
  if (!trailsOn || paused) return
  for (const body of world.bodies) {
    const last = body.trail.at(-1)
    if (last && Math.hypot(body.x - last.x, body.y - last.y) < camera.mpp * 0.35) continue
    body.trail.push({ x: body.x, y: body.y })
    if (body.trail.length > 720) body.trail.shift()
  }
}

function drawTrail(body) {
  const trail = body.trail
  if (trail.length < 2) return
  const chunks = 8
  ctx.lineWidth = 1.25
  ctx.lineCap = "round"
  ctx.strokeStyle = body.color
  for (let chunk = 0; chunk < chunks; chunk += 1) {
    const start = Math.floor((chunk * trail.length) / chunks)
    const end = Math.floor(((chunk + 1) * trail.length) / chunks)
    if (end - start < 1) continue
    ctx.globalAlpha = ((chunk + 1) / chunks) * 0.72
    ctx.beginPath()
    const first = worldToScreen(trail[start].x, trail[start].y)
    ctx.moveTo(first.x, first.y)
    for (let index = start + 1; index < end; index += 1) {
      const point = worldToScreen(trail[index].x, trail[index].y)
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawAtmosphere(screen, radius, color, kind) {
  if (kind !== "planet" && kind !== "giant") return
  const haze = ctx.createRadialGradient(screen.x, screen.y, radius * 0.96, screen.x, screen.y, radius * 1.16)
  haze.addColorStop(0, withAlpha(mix(color, "#d7ecff", 0.5), 0))
  haze.addColorStop(0.4, withAlpha(mix(color, "#d7ecff", 0.55), 0.2))
  haze.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = haze
  ctx.beginPath()
  ctx.arc(screen.x, screen.y, radius * 1.28, 0, Math.PI * 2)
  ctx.fill()
}

function drawDisk(screen, size, now) {
  const outer = size.draw * 3.6
  ctx.save()
  ctx.translate(screen.x, screen.y)
  ctx.rotate(reducedMotion.matches ? 0.35 : now / 2200)
  ctx.scale(1, 0.3)
  const disk = ctx.createRadialGradient(0, 0, size.draw * 1.05, 0, 0, outer)
  disk.addColorStop(0, "rgba(0, 0, 0, 0)")
  disk.addColorStop(0.22, "rgba(255, 214, 150, 0.05)")
  disk.addColorStop(0.36, "rgba(232, 140, 70, 0.9)")
  disk.addColorStop(0.58, "rgba(180, 64, 36, 0.38)")
  disk.addColorStop(1, "rgba(0, 0, 0, 0)")
  ctx.fillStyle = disk
  ctx.beginPath()
  ctx.arc(0, 0, outer, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawCometTail(body, screen, size) {
  const speed = Math.hypot(body.vx, body.vy)
  if (!(speed > 1)) return
  const ux = body.vx / speed
  const uy = body.vy / speed
  const tail = size.draw * 5.2
  const x1 = screen.x - ux * tail
  const y1 = screen.y + uy * tail
  const fade = ctx.createLinearGradient(screen.x, screen.y, x1, y1)
  fade.addColorStop(0, withAlpha(body.color, 0.55))
  fade.addColorStop(1, withAlpha(body.color, 0))
  ctx.strokeStyle = fade
  ctx.lineWidth = Math.max(1.4, size.draw * 0.55)
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(screen.x, screen.y)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

function earthLight(body) {
  const sun = world.bodies.find((other) => other.kind === "star" || other.kind === "giantstar")
  if (!sun) return { x: -0.22, y: 0.18, z: 0.96 }
  const from = worldToScreen(body.x, body.y)
  const to = worldToScreen(sun.x, sun.y)
  const x = to.x - from.x
  const y = from.y - to.y
  const length = Math.hypot(x, y)
  if (!(length > 1)) return { x: -0.22, y: 0.18, z: 0.96 }
  return { x: x / length, y: (y / length) * 0.38, z: 0.64 }
}

function drawBody(body, now) {
  const screen = worldToScreen(body.x, body.y)
  const size = drawRadius(body)
  if (body.kind === "star" || body.kind === "giantstar" || body.kind === "whitedwarf") {
    const glow = ctx.createRadialGradient(screen.x, screen.y, size.draw * 0.4, screen.x, screen.y, size.draw * (body.kind === "whitedwarf" ? 3.2 : 5))
    glow.addColorStop(0, withAlpha(body.color, 0.34))
    glow.addColorStop(1, withAlpha(body.color, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, size.draw * 5, 0, Math.PI * 2)
    ctx.fill()
  }

  if (body.kind === "comet") drawCometTail(body, screen, size)

  if (body.kind === "blackhole") {
    drawDisk(screen, size, now)
    ctx.fillStyle = "#07080c"
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, size.draw, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = "#e0a15a"
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, size.marker ? size.draw + 3.5 : Math.max(size.physical * 1.5, size.draw + 2), 0, Math.PI * 2)
    ctx.stroke()
  } else if (isEarthBody(body) && globe.draw(ctx, screen.x, screen.y, size.draw, {
    rotation: earthSpin(world.time, reducedMotion.matches),
    clouds: reducedMotion.matches ? 0.04 : (world.time / 140000) % (Math.PI * 2),
    light: earthLight(body),
  })) {
    // NASA maps and atmosphere live in the globe shader.
  } else {
    drawSphere(ctx, screen.x, screen.y, size.draw, body.color)
    if (body.kind === "planet" || body.kind === "giant") drawAtmosphere(screen, size.draw, body.color, body.kind)
  }

  if (body.name?.startsWith("Saturn") && size.draw > 6) {
    ctx.save()
    ctx.translate(screen.x, screen.y)
    ctx.scale(1, 0.28)
    ctx.strokeStyle = withAlpha("#e4d0a4", 0.58)
    ctx.lineWidth = Math.max(1.4, size.draw * 0.07)
    ctx.beginPath()
    ctx.arc(0, 0, size.draw * 1.85, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  if (body.kind === "pulsar") {
    const angle = reducedMotion.matches ? 0.4 : now / 900
    const length = size.draw + 15
    ctx.strokeStyle = "rgba(237, 242, 244, 0.72)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(screen.x - Math.cos(angle) * length, screen.y + Math.sin(angle) * length)
    ctx.lineTo(screen.x + Math.cos(angle) * length, screen.y - Math.sin(angle) * length)
    ctx.stroke()
  }

  if (body.id === selectedId) {
    ctx.strokeStyle = "#e0a15a"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, size.draw + 6, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (size.marker && size.physical > 0.8 && body.id === selectedId) {
    ctx.strokeStyle = withAlpha(body.color, 0.85)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, size.physical, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawHill(body) {
  const parent = dominantPartner(body, world.bodies)
  if (!parent) return
  const orbitDistance = Math.hypot(body.x - parent.x, body.y - parent.y)
  if (!(orbitDistance > 0) || !(body.m > 0) || !(parent.m > 0)) return
  const hill = orbitDistance * Math.cbrt(body.m / (3 * parent.m))
  const screen = worldToScreen(body.x, body.y)
  const radius = hill / camera.mpp
  if (radius < 10 || radius > 2800) return
  ctx.strokeStyle = withAlpha(body.color, 0.28)
  ctx.lineWidth = 1
  ctx.setLineDash([5, 7])
  ctx.beginPath()
  ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawGravityArrows(body) {
  const pulls = []
  for (const other of world.bodies) {
    if (other.id === body.id) continue
    const dx = other.x - body.x
    const dy = other.y - body.y
    const distance = Math.hypot(dx, dy)
    if (!(distance > 0)) continue
    pulls.push({ other, dx, dy, distance, accel: other.gm / (distance * distance) })
  }
  pulls.sort((a, b) => b.accel - a.accel)
  const shown = pulls.slice(0, 3)
  const strongest = shown[0]
  if (!strongest) return
  const origin = worldToScreen(body.x, body.y)
  const size = drawRadius(body)
  for (const pull of shown) {
    const share = pull.accel / strongest.accel
    if (share < 0.04 && pull !== strongest) continue
    const length = 22 + 58 * share
    const ux = pull.dx / pull.distance
    const uy = pull.dy / pull.distance
    const x0 = origin.x + ux * (size.draw + 8)
    const y0 = origin.y - uy * (size.draw + 8)
    const x1 = x0 + ux * length
    const y1 = y0 - uy * length
    ctx.strokeStyle = withAlpha(pull.other.color, 0.35 + 0.55 * share)
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = pull === strongest ? 2 : 1.2
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 - ux * 7 + uy * 4, y1 + uy * 7 + ux * 4)
    ctx.lineTo(x1 - ux * 7 - uy * 4, y1 + uy * 7 - ux * 4)
    ctx.closePath()
    ctx.fill()
  }
}

function drawLabels() {
  const placed = []
  const ordered = [...world.bodies].sort((a, b) => b.gm - a.gm)
  ctx.font = "12px Inter Tight, sans-serif"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  for (const body of ordered) {
    const screen = worldToScreen(body.x, body.y)
    const size = drawRadius(body)
    const forced = body.id === selectedId
    if (!forced && world.bodies.length > 8 && size.draw < 8) continue
    if (!forced && placed.some((point) => Math.hypot(point.x - screen.x, point.y - screen.y) < 26)) continue
    placed.push(screen)
    const x = screen.x + size.draw + 6
    const y = screen.y - 2
    ctx.fillStyle = "#14110c"
    ctx.fillText(body.name, x + 1, y + 1)
    ctx.fillStyle = "#ebe6dc"
    ctx.fillText(body.name, x, y)
  }
}

function drawForecast() {
  if (forecastSamples.length < 2) return
  ctx.beginPath()
  const first = worldToScreen(forecastSamples[0].x, forecastSamples[0].y)
  ctx.moveTo(first.x, first.y)
  for (let index = 1; index < forecastSamples.length; index += 1) {
    const point = worldToScreen(forecastSamples[index].x, forecastSamples[index].y)
    ctx.lineTo(point.x, point.y)
  }
  ctx.strokeStyle = "rgba(235, 230, 220, 0.55)"
  ctx.lineWidth = 1
  ctx.setLineDash([4, 5])
  ctx.stroke()
  ctx.setLineDash([])
}

function dragVector() {
  const screen = worldToScreen(drag.originX, drag.originY)
  return {
    screen,
    dx: drag.x - screen.x,
    dy: drag.y - screen.y,
    moved: Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 5,
  }
}

function drawThrow(now) {
  if (!drag || drag.mode === "pan" || !drag.moved) return
  const preset = selectedPreset()
  const origin = drag.mode === "fling"
    ? world.bodies.find((body) => body.id === drag.bodyId)
    : null
  if (drag.mode === "fling" && !origin) return
  const gmSelf = origin?.gm ?? preset.gm
  const color = origin?.color ?? preset.color
  const kind = origin?.kind ?? preset.kind
  const vector = dragVector()
  const throwVelocity = velocityFromDrag(vector.dx, vector.dy, { x: drag.originX, y: drag.originY }, gmSelf)
  const screen = vector.screen
  const speed = throwVelocity.relativeSpeed ?? Math.hypot(throwVelocity.vx, throwVelocity.vy)

  if (now - forecastAt > 48) {
    forecastAt = now
    const ghost = createBody(origin ? "earth" : preset.id, {
      x: drag.originX,
      y: drag.originY,
      vx: throwVelocity.vx,
      vy: throwVelocity.vy,
      gm: gmSelf,
      kind,
      color,
      name: "Preview",
      radius: origin?.radius,
    })
    ghost.id = origin?.id ?? -1
    const seconds = throwVelocity.guide
      ? clamp(throwVelocity.guide.period * 0.42, 3600, 160 * 86400)
      : 40 * 86400
    try {
      forecastSamples = forecast(world.bodies, ghost, seconds, origin ? origin.id : null)
    } catch {
      forecastSamples = []
    }
  }

  if (drag.mode === "spawn") {
    const ghostBody = {
      x: drag.originX,
      y: drag.originY,
      radius: kind === "blackhole" ? (2 * gmSelf) / (CONST.C ** 2) : preset.radius,
      kind,
      color,
      gm: gmSelf,
      id: -2,
    }
    drawBody(ghostBody, now)
  }

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(screen.x, screen.y)
  ctx.lineTo(drag.x, drag.y)
  ctx.stroke()

  const dx = drag.x - screen.x
  const dy = drag.y - screen.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const head = 8
  ctx.beginPath()
  ctx.moveTo(drag.x, drag.y)
  ctx.lineTo(drag.x - ux * head - uy * 4, drag.y - uy * head + ux * 4)
  ctx.lineTo(drag.x - ux * head + uy * 4, drag.y - uy * head - ux * 4)
  ctx.closePath()
  ctx.fill()

  if (throwVelocity.guide && length > 12) {
    ctx.strokeStyle = "rgba(235, 230, 220, 0.7)"
    ctx.fillStyle = "#ebe6dc"
    ctx.font = "11px Inter Tight, sans-serif"
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    drawTick(screen, ux, uy, AIM_PIXELS, "circular")
    drawTick(screen, ux, uy, AIM_PIXELS * Math.SQRT2, "escape")
  }

  ctx.fillStyle = "#ebe6dc"
  ctx.font = "12px Inter Tight, sans-serif"
  ctx.textAlign = "left"
  ctx.fillText(formatSpeed(speed), drag.x + 10, drag.y - 12)
  return { speed, guide: throwVelocity.guide }
}

function drawTick(screen, ux, uy, distance, label) {
  const px = screen.x + ux * distance
  const py = screen.y + uy * distance
  const nx = -uy
  const ny = ux
  ctx.beginPath()
  ctx.moveTo(px - nx * 5, py - ny * 5)
  ctx.lineTo(px + nx * 5, py + ny * 5)
  ctx.stroke()
  ctx.fillText(label, px + nx * 8, py + ny * 8)
}

function drawScale() {
  const dockTop = dockEl.getBoundingClientRect().top
  const meters = niceMeters(112 * camera.mpp)
  const px = meters / camera.mpp
  const x = window.innerWidth / 2 - px / 2
  const y = dockTop - 18
  if (y < 88) return
  ctx.strokeStyle = "#ebe6dc"
  ctx.fillStyle = "#ebe6dc"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + px, y)
  ctx.moveTo(x, y - 4)
  ctx.lineTo(x, y + 4)
  ctx.moveTo(x + px, y - 4)
  ctx.lineTo(x + px, y + 4)
  ctx.stroke()
  ctx.font = "12px Inter Tight, sans-serif"
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(formatLength(meters), x, y - 8)
}

function shakeOffset(now) {
  if (reducedMotion.matches || now >= shake.until || shake.amp <= 0) return { x: 0, y: 0 }
  const t = clamp((shake.until - now) / shake.ms, 0, 1)
  const mag = shake.amp * t * t
  return {
    x: Math.sin(now * 0.093) * mag,
    y: Math.cos(now * 0.121) * mag * 0.72,
  }
}

function drawEffects(now) {
  effects = effects.filter((effect) => now - effect.born < (effect.life ?? 700))
  for (const effect of effects) {
    const life = effect.life ?? 700
    const age = (now - effect.born) / life
    const screen = worldToScreen(effect.x, effect.y)
    const fade = 1 - age
    if (effect.type === "smash") {
      const flash = ctx.createRadialGradient(screen.x, screen.y, 2, screen.x, screen.y, 18 + age * 90)
      flash.addColorStop(0, withAlpha(effect.swallowed ? "#f4e6c8" : "#fff6e4", 0.72 * fade))
      flash.addColorStop(0.28, withAlpha(effect.color, 0.38 * fade))
      flash.addColorStop(1, withAlpha(effect.color, 0))
      ctx.fillStyle = flash
      ctx.beginPath()
      ctx.arc(screen.x, screen.y, 18 + age * 90, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = fade
      ctx.strokeStyle = mix(effect.color, "#fff3d6", 0.35)
      ctx.lineWidth = 2.4 * fade
      ctx.beginPath()
      ctx.arc(screen.x, screen.y, 10 + age * 52, 0, Math.PI * 2)
      ctx.stroke()
      const seconds = (now - effect.born) / 1000
      for (const shard of effect.shards ?? []) {
        const sx = screen.x + Math.cos(shard.angle) * shard.speed * seconds / camera.mpp
        const sy = screen.y - Math.sin(shard.angle) * shard.speed * seconds / camera.mpp
        ctx.fillStyle = shard.tint
        ctx.beginPath()
        ctx.arc(sx, sy, shard.radius * fade, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      continue
    }
    ctx.globalAlpha = fade
    ctx.strokeStyle = effect.color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, reducedMotion.matches ? 12 : 8 + age * 30, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function draw(now, liveSpeed) {
  const { w, h } = viewSize()
  const jolt = shakeOffset(now)
  ctx.fillStyle = "#090a0d"
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.translate(jolt.x, jolt.y)
  if (stars) ctx.drawImage(stars, 0, 0, w, h)
  if (trailsOn) {
    for (const body of world.bodies) drawTrail(body)
  }
  drawForecast()
  const ordered = [...world.bodies].sort((a, b) => b.radius - a.radius)
  for (const body of ordered) drawBody(body, now)
  const selected = world.bodies.find((body) => body.id === selectedId)
  if (selected) {
    drawHill(selected)
    drawGravityArrows(selected)
  }
  drawLabels()
  const throwing = drawThrow(now)
  drawEffects(now)
  ctx.restore()
  drawScale()
  updateReadout(throwing ?? liveSpeed)
  emptyEl.hidden = world.bodies.length > 0
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function beginPinch() {
  const points = [...pointers.values()]
  if (points.length < 2) return
  drag = null
  forecastSamples = []
  const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  pinch = {
    distance: Math.max(distance, 1),
    mpp: camera.mpp,
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  }
}

function onPointerDown(event) {
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
  try {
    canvas.setPointerCapture(event.pointerId)
  } catch {
    /* Capture can fail for untrusted or already-released pointers. */
  }
  const point = pointerPosition(event)
  pointers.set(event.pointerId, point)
  if (pointers.size >= 2) {
    beginPinch()
    return
  }
  if (event.button === 1 || event.button === 2 || event.altKey) {
    drag = { mode: "pan", pointerId: event.pointerId, x: point.x, y: point.y, moved: false }
    return
  }
  const body = hitBody(point.x, point.y)
  if (body) {
    selectedId = body.id
    drag = {
      mode: "fling",
      pointerId: event.pointerId,
      bodyId: body.id,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      originX: body.x,
      originY: body.y,
      moved: false,
    }
    return
  }
  const origin = screenToWorld(point.x, point.y)
  drag = {
    mode: "spawn",
    pointerId: event.pointerId,
    startX: point.x,
    startY: point.y,
    x: point.x,
    y: point.y,
    originX: origin.x,
    originY: origin.y,
    moved: false,
  }
}

function onPointerMove(event) {
  const point = pointerPosition(event)
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point)
  if (pinch && pointers.size >= 2) {
    const points = [...pointers.values()]
    const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y))
    const midX = (points[0].x + points[1].x) / 2
    const midY = (points[0].y + points[1].y) / 2
    zoomAt(midX, midY, pinch.mpp * (pinch.distance / distance))
    camera.x -= (midX - pinch.x) * camera.mpp
    camera.y += (midY - pinch.y) * camera.mpp
    pinch.x = midX
    pinch.y = midY
    pinch.distance = distance
    pinch.mpp = camera.mpp
    return
  }
  if (!drag || drag.pointerId !== event.pointerId) {
    canvas.style.cursor = hitBody(point.x, point.y) ? "grab" : "crosshair"
    return
  }
  if (drag.mode === "pan") {
    camera.x -= (point.x - drag.x) * camera.mpp
    camera.y += (point.y - drag.y) * camera.mpp
    drag.x = point.x
    drag.y = point.y
    canvas.style.cursor = "grabbing"
    return
  }
  drag.x = point.x
  drag.y = point.y
  if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 5) drag.moved = true
}

function releaseThrow() {
  const vector = dragVector()
  const { dx, dy, moved } = vector
  if (drag.mode === "fling") {
    const body = world.bodies.find((entry) => entry.id === drag.bodyId)
    if (body && moved) {
      const velocity = velocityFromDrag(dx, dy, { x: body.x, y: body.y }, body.gm)
      setVelocity(world, body.id, velocity.vx, velocity.vy)
      const speed = Math.hypot(velocity.vx, velocity.vy)
      if (speed > 0.05 * CONST.C) {
        setStatus("That throw is above 5% of light speed, so this Newtonian model leaves relativity out.")
        thrownFast = true
      }
    }
    return
  }
  if (!moved) {
    const preset = selectedPreset()
    const inserted = insertionPlacement(drag.originX, drag.originY, preset.gm, world.bodies, null, { capture: captureMeters() })
    const placed = addBody(world, createBody(presetId, {
      x: inserted.x,
      y: inserted.y,
      vx: inserted.vx,
      vy: inserted.vy,
    }))
    if (!placed) setStatus(`The field holds ${MAX_BODIES} bodies. Clear some, or pick another scene.`)
    else {
      selectedId = placed.id
      if (inserted.host) {
        const distance = Math.hypot(placed.x - inserted.host.x, placed.y - inserted.host.y)
        watchSatellite(inserted.host, distance)
        setStatus(`${placed.name} dropped in a circular path about ${inserted.host.name}.`)
      }
    }
    return
  }
  const preset = selectedPreset()
  const velocity = velocityFromDrag(dx, dy, { x: drag.originX, y: drag.originY }, preset.gm)
  const body = createBody(presetId, {
    x: drag.originX,
    y: drag.originY,
    vx: velocity.vx,
    vy: velocity.vy,
  })
  const placed = addBody(world, body)
  if (!placed) {
    setStatus(`The field holds ${MAX_BODIES} bodies. Clear some, or pick another scene.`)
    return
  }
  selectedId = placed.id
  const speed = Math.hypot(velocity.vx, velocity.vy)
  if (speed > 0.05 * CONST.C && !thrownFast) {
    setStatus("That throw is above 5% of light speed, so this Newtonian model leaves relativity out.")
    thrownFast = true
  }
}

function onPointerUp(event) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinch = null
  if (!drag || drag.pointerId !== event.pointerId) return
  if (drag.mode !== "pan") releaseThrow()
  drag = null
  forecastSamples = []
  canvas.style.cursor = "crosshair"
}

function onWheel(event) {
  event.preventDefault()
  const point = pointerPosition(event)
  zoomAt(point.x, point.y, camera.mpp * Math.exp(event.deltaY * 0.00115))
}

function typingTarget(target) {
  return ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(target?.tagName)
}

function onKeyDown(event) {
  if (event.key === "Escape") {
    drag = null
    forecastSamples = []
    selectedId = null
    document.querySelector("#warp-menu").hidden = true
    document.querySelector("#warp-toggle").setAttribute("aria-expanded", "false")
    document.querySelector("#account-menu").hidden = true
    document.querySelector("#account-toggle").setAttribute("aria-expanded", "false")
    if (sheetOpen) setSheetOpen(false)
    return
  }
  if (typingTarget(event.target)) return
  if (event.key === " ") {
    event.preventDefault()
    setPaused(!paused)
  } else if (event.key === "f" || event.key === "F") {
    fitWorld()
  } else if ((event.key === "Backspace" || event.key === "Delete") && selectedId != null) {
    const body = world.bodies.find((entry) => entry.id === selectedId)
    removeBody(world, selectedId)
    selectedId = null
    if (body) setStatus(`${body.name} removed.`)
  }
}

function frame(now) {
  const elapsed = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
  lastFrame = now
  if (elapsed > 0) frameRate += (1 / elapsed - frameRate) * 0.05
  if (!paused && !drag) {
    try {
      integrate(world, elapsed * playbackScale(now))
      noteMerges()
      followSmash()
      sampleTrails()
    } catch (error) {
      setPaused(true)
      setStatus(error instanceof Error ? error.message : "The integration stopped.", { sticky: true })
    }
  }
  try {
    draw(now, null)
    renderSheet(now)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Drawing stopped.", { sticky: true })
  }
  requestAnimationFrame(frame)
}

buildKits()
buildPresets()
buildScenes()
resize()
applyScenario("smash")
timeEl.value = String(scaleToSlider(timeScale))

sceneEl.addEventListener("change", () => {
  if (sceneEl.value === "saved") return
  applyScenario(sceneEl.value)
})
timeEl.addEventListener("input", () => {
  timeScale = sliderToScale(timeEl.value)
})
pauseEl.addEventListener("click", () => setPaused(!paused))
trailsEl.addEventListener("click", () => {
  trailsOn = !trailsOn
  trailsEl.setAttribute("aria-pressed", String(trailsOn))
  if (!trailsOn) {
    for (const body of world.bodies) body.trail = []
  }
})
fitEl.addEventListener("click", () => fitWorld())
document.querySelector("#physics").addEventListener("click", () => setSheetOpen(!sheetOpen))
document.querySelector("#inspect-more").addEventListener("click", () => setSheetOpen(true))
document.querySelector("#inspect-hide").addEventListener("click", () => {
  selectedId = null
  updateReadout()
})
document.querySelector("#sheet-close").addEventListener("click", () => setSheetOpen(false))
clearEl.addEventListener("click", () => {
  sceneEl.value = "empty"
  applyScenario("empty", { adoptTime: false })
})
canvas.addEventListener("pointerdown", onPointerDown)
canvas.addEventListener("pointermove", onPointerMove)
canvas.addEventListener("pointerup", onPointerUp)
canvas.addEventListener("pointercancel", onPointerUp)
canvas.addEventListener("contextmenu", (event) => event.preventDefault())
canvas.addEventListener("wheel", onWheel, { passive: false })
window.addEventListener("keydown", onKeyDown)
window.addEventListener("resize", resize)
bindAccount()
bindWarp()
requestAnimationFrame(frame)

function bindWarp() {
  const menu = document.querySelector("#warp-menu")
  const toggle = document.querySelector("#warp-toggle")
  toggle.addEventListener("click", () => {
    const open = menu.hidden
    menu.hidden = !open
    toggle.setAttribute("aria-expanded", String(open))
  })
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-scale]")
    if (!button) return
    timeScale = Number(button.dataset.scale)
    timeEl.value = String(scaleToSlider(timeScale))
    menu.hidden = true
    toggle.setAttribute("aria-expanded", "false")
  })
  document.addEventListener("pointerdown", (event) => {
    if (menu.hidden) return
    if (menu.contains(event.target) || toggle.contains(event.target)) return
    menu.hidden = true
    toggle.setAttribute("aria-expanded", "false")
  })
}

function bindAccount() {
  const sessionEmail = document.querySelector("#session-email")
  const projectForm = document.querySelector("#project-form")
  const projectName = document.querySelector("#project-name")
  const projectError = document.querySelector("#project-error")
  const projectList = document.querySelector("#project-list")
  const accountMenu = document.querySelector("#account-menu")
  const accountToggle = document.querySelector("#account-toggle")
  let projects = []

  function setAccountOpen(open) {
    accountMenu.hidden = !open
    accountToggle.setAttribute("aria-expanded", String(open))
  }

  accountToggle.addEventListener("click", () => setAccountOpen(accountMenu.hidden))
  document.addEventListener("pointerdown", (event) => {
    if (accountMenu.hidden) return
    if (accountMenu.contains(event.target) || accountToggle.contains(event.target)) return
    setAccountOpen(false)
  })

  function showError(node, error) {
    node.textContent = error instanceof Error ? error.message : String(error ?? "")
  }

  function renderProjects() {
    projectList.replaceChildren()
    if (!projects.length) {
      const item = document.createElement("li")
      item.className = "projects__empty"
      item.textContent = "No projects saved for this email yet."
      projectList.append(item)
      return
    }
    for (const project of projects) {
      const item = document.createElement("li")
      const open = document.createElement("button")
      open.type = "button"
      open.textContent = project.name
      open.title = `Saved for ${project.email}`
      open.addEventListener("click", () => {
        try {
          restoreProject(project)
          projectError.textContent = ""
        } catch (error) {
          showError(projectError, error)
        }
      })
      const remove = document.createElement("button")
      remove.type = "button"
      remove.textContent = "Delete"
      remove.setAttribute("aria-label", `Delete ${project.name}`)
      remove.addEventListener("click", async () => {
        projectError.textContent = ""
        try {
          await request(`/api/projects/${project.id}`, { method: "DELETE" })
          projects = projects.filter((entry) => entry.id !== project.id)
          renderProjects()
          setStatus(`Deleted ${project.name}.`)
        } catch (error) {
          showError(projectError, error)
        }
      })
      item.append(open, remove)
      projectList.append(item)
    }
  }

  function showSession(email) {
    sessionEmail.textContent = email
    accountToggle.textContent = email.slice(0, 1).toUpperCase()
    accountToggle.title = email
    accountToggle.setAttribute("aria-label", `Account, ${email}`)
  }

  async function loadProjects() {
    const body = await request("/api/projects")
    projects = body.projects
    showSession(body.email)
    renderProjects()
  }

  function showDemo(email) {
    showSession(email)
    document.querySelector(".account__hint").firstChild.textContent = "Demo session for "
    const actions = projectForm.querySelector(".account__actions")
    actions.querySelector('button[type="submit"]')?.remove()
    projectForm.replaceChildren(actions)
    const notice = document.createElement("li")
    notice.className = "projects__empty"
    notice.textContent = "Demo only. Projects aren't saved."
    projectList.append(notice)
    setStatus("Demo playground. Pick a world and give it a push.")
  }

  document.querySelector("#sign-out").addEventListener("click", async () => {
    projectError.textContent = ""
    try {
      await request("/api/logout", { method: "POST" })
      window.location.replace("/")
    } catch (error) {
      showError(projectError, error)
    }
  })

  const saveProject = async (event) => {
    event.preventDefault()
    projectError.textContent = ""
    try {
      const body = await request("/api/projects", {
        method: "POST",
        body: { name: projectName.value, snapshot: snapshotWorld() },
      })
      const existing = projects.findIndex((entry) => entry.id === body.project.id)
      if (existing >= 0) projects[existing] = body.project
      else projects.unshift(body.project)
      renderProjects()
      markSavedScene(body.project.name)
      setStatus(`Saved ${body.project.name} for ${body.project.email}.`)
    } catch (error) {
      showError(projectError, error)
    }
  }

  currentUser().then((user) => {
    if (!user) {
      window.location.replace("/login")
      return
    }
    document.documentElement.dataset.gate = "open"
    if (user.demo) {
      showDemo(user.email)
      return
    }
    projectForm.addEventListener("submit", saveProject)
    loadProjects().then(() => setStatus(`Signed in as ${user.email}.`))
  })
}
