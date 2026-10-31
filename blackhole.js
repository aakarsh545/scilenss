import { currentUser, request } from "./auth.js"
import { addProbe, circularProbe, createProbe, createSimulation, derivative, EARTH_MASS_KG, energy, integrate, localVelocity, physicalScale } from "./schwarzschild.js?v=mass-1"
import { changeBlackHoleMass, MAX_OBJECT_ENERGY_FRACTION, validateTestMasses } from "./blackhole-mass.js?v=mass-1"
import { cameraBasis, createCamera, panCamera, project, rescaleCamera, rotateCamera, zoomCamera } from "./orbit-camera.js?v=mass-1"
import { circularPlacement, viewPosition } from "./orbit-placement.js?v=controls-2"
import { CATALOG, CONST } from "./orbit-physics.js"
import { drawCelestialBody } from "./body-visuals.js"
import { earthGlobe } from "./earth-globe.js"

const user = await currentUser()
if (!user) window.location.replace("/login")
else document.documentElement.dataset.gate = "open"

const canvas = document.querySelector("#field")
const ctx = canvas.getContext("2d", { alpha: false })
const camera = createCamera()
let scale = physicalScale()
const defaultSolarMasses = scale.solarMasses
let newObjectMassKg = EARTH_MASS_KG
let massSelectionId = null
let sceneId = "precession"
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
earthGlobe()
const kits = [
  { id: "smash", name: "Smash", ids: ["comet", "ceres", "moon"] },
  { id: "worlds", name: "Worlds", ids: ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"] },
  { id: "fire", name: "Fire", ids: ["sun", "redgiant", "whitedwarf"] },
  { id: "holes", name: "Holes", ids: ["pulsar", "blackhole"] },
]
let presetId = "earth"
let kitId = "worlds"
const pointers = new Map()
let viewport = { width: innerWidth, height: innerHeight }
let basis = cameraBasis(camera)
let stars = []
let world = createSimulation()
let selectedId = null
let paused = false
let trailsOn = true
let mode = "orbit"
let playback = 600
let drag = null
let gesture = null
let lastFrame = performance.now()
let lastReadout = 0
let statusUntil = 0
let dockHeight = 0
let hover = null
let keyboardAim = false

const $ = selector => document.querySelector(selector)
const screen = point => project(point, camera, viewport, basis)
const viewCenter = () => ({ x: viewport.centerX ?? viewport.width / 2, y: viewport.centerY ?? viewport.height / 2 })
const seconds = time => time > 0 && time < 1 ? `${(time * 1000).toFixed(1)} ms` : time < 90 ? `${time.toFixed(1)} seconds` : time < 7200 ? `${(time / 60).toFixed(1)} minutes` : `${(time / 3600).toFixed(2)} hours`
const number = value => value.toLocaleString("en", { maximumSignificantDigits: 6 })
const compact = value => value.toLocaleString("en", { notation: "compact", maximumSignificantDigits: 4 })
const distance = meters => `${compact(meters / 1000)} km`
const rateLabel = rate => rate < 1 ? `${number(rate * 1000)} ms / sec` : rate < 60 ? `${number(rate)} sec / sec` : rate < 3600 ? `${number(rate / 60)} min / sec` : `${number(rate / 3600)} hour / sec`

function refreshRates() {
  for (const button of $("#warp-menu").querySelectorAll("button[data-base-scale]")) {
    button.dataset.scale = String(Number(button.dataset.baseScale) * scale.solarMasses / defaultSolarMasses)
    button.textContent = rateLabel(Number(button.dataset.scale))
  }
  $("#rate").textContent = rateLabel(playback)
}

function refreshMassReadout() {
  $("#source-mass").textContent = `${compact(scale.solarMasses)} M☉`
  $("#physics-mass").textContent = `${number(scale.solarMasses)} solar masses`
  $("#horizon-size").textContent = distance(scale.radiusMeters)
  $("#mass-horizon").textContent = `Horizon radius: ${distance(scale.radiusMeters)}`
  $("#object-mass").max = String(scale.massKg * MAX_OBJECT_ENERGY_FRACTION / EARTH_MASS_KG)
  refreshRates()
}

function appearance(id = presetId) { return CATALOG.find(body => body.id === id) }

function decorateProbe(probe, id = presetId) {
  const preset = appearance(id)
  const markerSize = { comet: 0.28, asteroid: 0.35, moon: 0.55, planet: 1.15, giant: 1.7, star: 1.8, giantstar: 2.2, whitedwarf: 0.9, pulsar: 0.6, blackhole: 0.8 }
  Object.assign(probe, { presetId: id, kind: preset.kind, color: preset.color, visualRadiusMeters: scale.radiusMeters * markerSize[preset.kind] })
  return probe
}

function refreshBrush() {
  $("#brush-mass").textContent = `${appearance().name} · ${compact(newObjectMassKg / EARTH_MASS_KG)} M⊕`
}

function selectPreset(id) {
  presetId = id
  newObjectMassKg = appearance().gm / CONST.G
  refreshBrush()
}

function buildPresets() {
  $("#presets").replaceChildren()
  for (const id of kits.find(kit => kit.id === kitId).ids) {
    const preset = appearance(id)
    const label = document.createElement("label")
    label.className = "preset"
    label.title = `${preset.name} · ${compact(preset.gm / CONST.G / EARTH_MASS_KG)} Earth masses. Illustrated test body.`
    const input = document.createElement("input")
    input.type = "radio"; input.name = "preset"; input.value = id; input.checked = id === presetId
    const swatch = document.createElement("span")
    swatch.className = "preset__swatch"; swatch.dataset.kind = preset.kind; swatch.style.setProperty("--swatch", preset.color)
    const name = document.createElement("span"); name.textContent = preset.name
    label.append(input, swatch, name)
    input.addEventListener("change", () => { if (input.checked) { selectPreset(id); label.scrollIntoView({ block: "nearest", inline: "nearest" }) } })
    $("#presets").append(label)
  }
  resize()
}

function buildKits() {
  for (const kit of kits) {
    const button = document.createElement("button")
    button.type = "button"; button.textContent = kit.name; button.dataset.kit = kit.id
    button.setAttribute("aria-pressed", String(kit.id === kitId))
    button.addEventListener("click", () => {
      kitId = kit.id
      if (!kit.ids.includes(presetId)) selectPreset(kit.ids[0])
      $("#kit").querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item.dataset.kit === kitId)))
      buildPresets()
    })
    $("#kit").append(button)
  }
  buildPresets()
  refreshBrush()
}

function status(message, duration = 6500) {
  $("#status").textContent = message
  statusUntil = performance.now() + duration
}

function resetCamera() {
  const reach = Math.max(8, ...world.probes.filter(probe => !probe.captured && probe.energy0 < 1).map(probe => Math.hypot(...probe.state.slice(0, 3))))
  Object.assign(camera, createCamera(), { minScale: camera.minScale, maxScale: camera.maxScale, scale: reach * 2.7 / Math.min(viewport.width, viewport.plotHeight) })
  hover = null
}

function resize() {
  const previous = Math.min(viewport.width, viewport.plotHeight ?? viewport.height * 0.8)
  viewport = { width: innerWidth, height: innerHeight }
  dockHeight = $("#controls").getBoundingClientRect().height
  viewport.plotHeight = Math.max(120, viewport.height - dockHeight - 110)
  viewport.centerX = viewport.width / 2
  viewport.centerY = 80 + viewport.plotHeight / 2
  camera.scale *= previous / Math.min(viewport.width, viewport.plotHeight)
  const ratio = Math.min(devicePixelRatio || 1, 2)
  canvas.width = Math.round(viewport.width * ratio)
  canvas.height = Math.round(viewport.height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  stars = Array.from({ length: Math.round(viewport.width * viewport.height / 14000) }, () => ({ x: Math.random() * viewport.width, y: Math.random() * viewport.height, alpha: 0.15 + Math.random() * 0.45 }))
  document.documentElement.style.setProperty("--dock-h", `${dockHeight}px`)
}

function chooseScene(id) {
  let probes
  if (id === "circles") {
    probes = [decorateProbe(circularProbe(5, 0, 0.4, appearance("earth").gm / CONST.G), "earth"), decorateProbe(circularProbe(8, 0.85, 2.5, appearance("jupiter").gm / CONST.G), "jupiter"), decorateProbe(circularProbe(11, -0.6, 4.2, appearance("moon").gm / CONST.G), "moon")]
  } else if (id === "plunge") {
    probes = [decorateProbe(createProbe([6, 0, 0], [0, 0.1, 0], "Plunging Earth", EARTH_MASS_KG), "earth")]
  } else {
    probes = [decorateProbe(createProbe([8, 0, 0], [0, 1 / Math.sqrt(18), 0], "Earth", EARTH_MASS_KG), "earth")]
  }
  validateTestMasses(probes, scale)
  world = createSimulation(probes)
  sceneId = id
  const rateRatio = scale.solarMasses / defaultSolarMasses
  if (playback < 60 * rateRatio || playback > 3600 * rateRatio) playback = 600 * rateRatio
  refreshRates()
  world.probes.forEach(probe => {
    if (probe.name === "Probe") probe.name = appearance(probe.presetId).name
  })
  selectedId = world.probes[0]?.id ?? null
  massSelectionId = null
  resetCamera()
  status(id === "plunge" ? "A freely falling probe can cross the horizon in these coordinates." : "Click empty space to place a stable orbit. Drag to look around.")
  updateReadout()
}

function setPaused(value) {
  paused = value
  $("#pause").dataset.state = paused ? "play" : "pause"
  $("#pause").setAttribute("aria-label", paused ? "Play" : "Pause")
  $("#pause").setAttribute("aria-pressed", String(paused))
  updateReadout()
}

function setMode(value) {
  mode = value
  drag = null
  $("#orbit-mode").setAttribute("aria-pressed", String(mode === "orbit"))
  $("#launch-mode").setAttribute("aria-pressed", String(mode === "launch"))
  const touch = matchMedia("(pointer: coarse)").matches
  $("#view-hint").textContent = mode === "orbit"
    ? touch ? "Tap to place · Drag to look · Two fingers to pan/zoom" : "Click to place an orbit · Drag to look · Shift/right-drag to pan · Scroll to zoom"
    : touch ? "Drag sets launch velocity · Two fingers to pan/zoom" : "Drag sets launch velocity · Shift/right-drag to pan · Enter, arrows, Enter for keyboard"
  canvas.style.cursor = "crosshair"
  resize()
}

function setSheet(open) {
  if (open) { $("#mass-panel").hidden = true; $("#mass-toggle").setAttribute("aria-expanded", "false") }
  $("#sheet").hidden = !open
  $("#physics").setAttribute("aria-expanded", String(open))
  if (open) $("#sheet-close").focus()
  else $("#physics").focus()
}

function setMassPanel(open) {
  if (open) {
    $("#sheet").hidden = true
    $("#physics").setAttribute("aria-expanded", "false")
    $("#blackhole-mass").value = String(scale.solarMasses)
    const selected = world.probes.find(probe => probe.id === selectedId && !probe.captured)
    $("#object-mass").value = String((selected?.massKg ?? newObjectMassKg) / EARTH_MASS_KG)
    $("#mass-panel").querySelectorAll(".mass-message").forEach(message => { message.hidden = true })
    updateReadout()
  }
  $("#mass-panel").hidden = !open
  $("#mass-toggle").setAttribute("aria-expanded", String(open))
  $(open ? "#mass-close" : "#mass-toggle").focus()
}

function updateReadout() {
  $("#sim-time").textContent = seconds(world.time * scale.seconds)
  $("#body-count").textContent = `${world.probes.filter(probe => !probe.captured).length} bodies`
  $("#coordinate-time").textContent = seconds(world.time * scale.seconds)
  $("#capture-count").textContent = String(world.probes.filter(probe => probe.captured).length)
  const error = Math.max(0, ...world.probes.map(probe => Math.abs(energy(probe.state) / probe.energy0 - 1)))
  $("#energy-error").textContent = error.toExponential(2)
  const selected = world.probes.find(probe => probe.id === selectedId)
  const activeMassId = selected && !selected.captured ? selected.id : null
  if (activeMassId !== massSelectionId) {
    massSelectionId = activeMassId
    $("#object-mass").value = String((activeMassId ? selected.massKg : newObjectMassKg) / EARTH_MASS_KG)
  }
  $("#object-mass-target").textContent = selected && !selected.captured ? `Applies to ${selected.name} and new placements.` : "Applies to new placements."
  $("#inspect").hidden = !selected
  $("#probe-details").hidden = !selected
  if (!selected) return
  $("#inspect-name").textContent = selected.name
  $("#sheet-probe-name").textContent = selected.name
  $("#inspect-summary").textContent = selected.captured ? "Captured · details" : `${compact(selected.massKg / EARTH_MASS_KG)} M⊕ · ${Math.hypot(...localVelocity(selected.state)).toFixed(3)}c`
  const captureLabel = selected.captureReason === "mass-change" ? "Inside the resized horizon" : selected.captureReason === "previous" ? "Captured before this mass setting" : "Crossed the horizon"
  $("#probe-radius").textContent = selected.captured ? captureLabel : `r = ${number(Math.hypot(...selected.state.slice(0, 3)))} rₛ`
  $("#probe-speed").textContent = selected.captured ? selected.captureReason ? "Inactive object; clocks reset" : `PG crossing: ${seconds(selected.capturedAt * scale.seconds)}` : `Hovering-frame speed: ${Math.hypot(...localVelocity(selected.state)).toFixed(3)}c`
  $("#probe-mass").textContent = `Mass: ${compact(selected.massKg / EARTH_MASS_KG)} M⊕`
  $("#probe-distance").textContent = distance(Math.hypot(...selected.state.slice(0, 3)) * scale.radiusMeters)
  $("#probe-clock").textContent = `Probe proper time: ${seconds(selected.state[6] * scale.seconds)}`
}

function referenceCircles(front) {
  const centerDepth = screen([0, 0, 0]).depth
  ctx.strokeStyle = "rgba(183, 175, 163, 0.21)"
  ctx.lineWidth = 1
  ctx.setLineDash([4, 6])
  for (let plane = 0; plane < 3; plane += 1) {
    let previous = null
    ctx.beginPath()
    for (let index = 0; index <= 128; index += 1) {
      const angle = index * 2 * Math.PI / 128
      const point = plane === 0 ? [3 * Math.cos(angle), 3 * Math.sin(angle), 0] : plane === 1 ? [3 * Math.cos(angle), 0, 3 * Math.sin(angle)] : [0, 3 * Math.cos(angle), 3 * Math.sin(angle)]
      const current = screen(point)
      if (previous && ((current.depth + previous.depth) / 2 >= centerDepth) === front) {
        ctx.moveTo(previous.x, previous.y)
        ctx.lineTo(current.x, current.y)
      }
      previous = current
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
}

function drawProbes(front) {
  const centerDepth = screen([0, 0, 0]).depth
  const ordered = world.probes.map(probe => ({ probe, point: screen(probe.state.slice(0, 3)) })).sort((a, b) => a.point.depth - b.point.depth)
  for (const { probe, point } of ordered) {
    ctx.strokeStyle = probe.color
    ctx.lineWidth = 1.4
    if (trailsOn) {
      ctx.globalAlpha = probe.captured ? 0.3 : 0.65
      ctx.beginPath()
      for (let i = 1; i < probe.trail.length; i += 1) {
        const a = screen(probe.trail[i - 1])
        const b = screen(probe.trail[i])
        if (((a.depth + b.depth) / 2 >= centerDepth) === front) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y) }
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    if (probe.captured || (point.depth >= centerDepth) !== front) continue
    const radius = bodyRadius(probe)
    if (point.x + radius * 4 < 0 || point.x - radius * 4 > viewport.width || point.y + radius * 4 < 0 || point.y - radius * 4 > viewport.height) continue
    const velocity = derivative(probe.state)
    const next = screen(probe.state.slice(0, 3).map((value, i) => value + velocity[i]))
    drawCelestialBody(ctx, probe, point.x, point.y, radius, probe.state[6] * scale.seconds, { reducedMotion: reducedMotion.matches, motion: { x: next.x - point.x, y: next.y - point.y } })
    if (selectedId === probe.id) {
      ctx.strokeStyle = "#e0a15a"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(point.x, point.y, radius + 6, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = selectedId === probe.id ? "#ebe6dc" : "#b7afa3"
    ctx.font = "12px 'Inter Tight', sans-serif"
    ctx.fillText(probe.name, point.x + radius + 10, point.y + 4, 140)
  }
}

function bodyRadius(probe) {
  return Math.min(Math.max(5, probe.visualRadiusMeters / (scale.radiusMeters * camera.scale)), Math.max(viewport.width, viewport.height) * 2)
}

function draw() {
  basis = cameraBasis(camera)
  ctx.fillStyle = "#090a0d"
  ctx.fillRect(0, 0, viewport.width, viewport.height)
  for (const star of stars) { ctx.fillStyle = `rgba(235,230,220,${star.alpha})`; ctx.fillRect(star.x, star.y, 1, 1) }
  referenceCircles(false)
  drawProbes(false)
  const hole = screen([0, 0, 0])
  const radius = 1 / camera.scale
  ctx.fillStyle = "#020304"
  ctx.strokeStyle = "#e0a15a"
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(hole.x, hole.y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  referenceCircles(true)
  drawProbes(true)
  ctx.fillStyle = "#b7afa3"
  ctx.font = "12px 'Inter Tight', sans-serif"
  ctx.fillText("Horizon · 1 rₛ", hole.x + radius + 10, hole.y + 5)
  if (mode === "orbit" && !gesture && !drag?.moved) { ctx.save(); drawOrbitPreview(); ctx.restore() }
  if (mode === "launch" && keyboardAim && (!drag || drag.pointerId === null)) {
    const { x, y } = viewCenter()
    ctx.strokeStyle = "#ebe6dc"
    ctx.beginPath()
    ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y)
    ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8)
    ctx.stroke()
  }
  if (drag?.kind === "launch") {
    ctx.strokeStyle = "#e0a15a"
    ctx.beginPath()
    ctx.moveTo(drag.start.x, drag.start.y)
    ctx.lineTo(drag.point.x, drag.point.y)
    ctx.stroke()
    ctx.fillStyle = "#ebe6dc"
    ctx.fillText(`${launchSpeed(drag).toFixed(2)}c local`, drag.point.x + 10, drag.point.y - 10)
  }
  const length = Math.min(100, viewport.width * 0.2)
  const meters = length * camera.scale
  const y = viewport.height - dockHeight - 12
  ctx.strokeStyle = "#b7afa3"
  ctx.beginPath()
  ctx.moveTo(viewport.width / 2 - length / 2, y)
  ctx.lineTo(viewport.width / 2 + length / 2, y)
  ctx.stroke()
  ctx.fillText(`${meters.toFixed(1)} rₛ`, viewport.width / 2 - length / 2, y - 6)
}

function drawOrbitPreview() {
  const point = hover ?? (keyboardAim ? viewCenter() : null)
  if (!point || pick(point)) return
  const placement = circularPlacement(point, camera, viewport)
  const center = screen([0, 0, 0])
  const proposed = screen(placement.position)
  ctx.strokeStyle = placement.valid ? "#e0a15a" : "#d89b91"
  ctx.fillStyle = ctx.strokeStyle
  ctx.lineWidth = 1.2
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.arc(center.x, center.y, Math.max(3, placement.radius) / camera.scale, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(proposed.x, proposed.y, 5, 0, Math.PI * 2)
  ctx.stroke()
  if (placement.valid) {
    const end = screen(placement.position.map((value, i) => value + placement.velocity[i] / placement.speed))
    const angle = Math.atan2(end.y - proposed.y, end.x - proposed.x)
    ctx.beginPath()
    ctx.moveTo(proposed.x, proposed.y); ctx.lineTo(end.x, end.y)
    ctx.lineTo(end.x - 7 * Math.cos(angle - 0.4), end.y - 7 * Math.sin(angle - 0.4))
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(end.x - 7 * Math.cos(angle + 0.4), end.y - 7 * Math.sin(angle + 0.4))
    ctx.stroke()
  }
  const text = placement.valid ? `${placement.radius.toFixed(2)} rₛ · ${placement.speed.toFixed(3)}c` : "Stable orbits need r > 3 rₛ"
  const x = Math.max(10, Math.min(proposed.x + 12, viewport.width - ctx.measureText(text).width - 10))
  const y = Math.max(95, Math.min(proposed.y - 14, viewport.height - dockHeight - 30))
  ctx.fillText(text, x, y)
}

function pointOf(event) {
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function pick(point) {
  let selected = null
  let distance = 16
  for (const probe of world.probes) {
    if (probe.captured) continue
    const position = project(probe.state.slice(0, 3), camera, viewport)
    const next = Math.hypot(position.x - point.x, position.y - point.y)
    if (next < bodyRadius(probe) + 7 && (selected === null || next < distance)) { distance = next; selected = probe.id }
  }
  return selected
}

function launchSpeed(action) {
  return Math.min(0.95, Math.hypot(action.point.x - action.start.x, action.point.y - action.start.y) / 180)
}

function addSceneProbe(probe) {
  decorateProbe(probe)
  validateTestMasses([...world.probes, probe], scale)
  addProbe(world, probe)
  selectedId = probe.id
  if (Math.hypot(...probe.state.slice(0, 3)) < 20 && playback > 3600 * scale.solarMasses / defaultSolarMasses) {
    playback = 600 * scale.solarMasses / defaultSolarMasses
    refreshRates()
  }
}

function launch(action) {
  const view = cameraBasis(camera)
  const origin = viewPosition(action.start, camera, viewport)
  const dx = action.point.x - action.start.x
  const dy = action.point.y - action.start.y
  const factor = launchSpeed(action) / Math.max(1, Math.hypot(dx, dy))
  const velocity = view.right.map((value, i) => factor * (dx * value - dy * view.up[i]))
  const probe = createProbe(origin, velocity, `${appearance().name} ${world.nextId}`, newObjectMassKg)
  addSceneProbe(probe)
  status(`Launched at ${Math.hypot(...velocity).toFixed(3)}c in the local hovering frame.`)
  updateReadout()
}

function placeOrbit(point) {
  const placement = circularPlacement(point, camera, viewport)
  if (!placement.valid) throw new Error("Click outside the highlighted 3 rₛ circle for a stable orbit.")
  const probe = createProbe(placement.position, placement.velocity, `${appearance().name} ${world.nextId}`, newObjectMassKg)
  addSceneProbe(probe)
  status(`Stable orbit placed at ${placement.radius.toFixed(2)} rₛ. Orbital speed ${placement.speed.toFixed(3)}c.`)
  updateReadout()
}

canvas.addEventListener("pointerdown", event => {
  if (![0, 1, 2].includes(event.button)) return
  event.preventDefault()
  canvas.focus({ preventScroll: true })
  keyboardAim = false
  canvas.setPointerCapture(event.pointerId)
  const point = pointOf(event)
  hover = point
  pointers.set(event.pointerId, point)
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    gesture = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    drag = null
    return
  }
  const kind = event.button === 1 || event.button === 2 || event.shiftKey ? "pan" : event.altKey ? "look" : mode
  drag = { kind, pointerId: event.pointerId, start: point, point, moved: false }
})

canvas.addEventListener("pointermove", event => {
  const point = pointOf(event)
  keyboardAim = false
  hover = point
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point)
  if (gesture && pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
    const x = (a.x + b.x) / 2
    const y = (a.y + b.y) / 2
    zoomCamera(camera, gesture.distance / distance, gesture.x, gesture.y, viewport)
    panCamera(camera, x - gesture.x, y - gesture.y)
    gesture = { distance, x, y }
  } else if (drag?.pointerId === event.pointerId) {
    const dx = point.x - drag.point.x
    const dy = point.y - drag.point.y
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) >= 6) drag.moved = true
    if ((drag.kind === "orbit" && drag.moved) || drag.kind === "look") {
      const sensitivity = Math.PI / Math.max(600, viewport.height)
      rotateCamera(camera, -dx * sensitivity, dy * sensitivity)
      canvas.style.cursor = "grabbing"
    }
    if (drag.kind === "pan") panCamera(camera, dx, dy)
    drag.point = point
  }
})

function finishPointer(event) {
  if (drag?.pointerId === event.pointerId && event.type === "pointerup") {
    drag.point = pointOf(event)
    const moved = drag.moved || Math.hypot(drag.point.x - drag.start.x, drag.point.y - drag.start.y) >= 6
    try {
      if (!moved && ["orbit", "launch"].includes(drag.kind)) {
        const picked = pick(drag.point)
        if (picked) { selectedId = picked; updateReadout() }
        else if (drag.kind === "orbit") placeOrbit(drag.point)
        else status("Drag from here to set a free launch, or choose Place orbit for a stable circle.")
      } else if (drag.kind === "launch") launch(drag)
    } catch (error) { status(error.message) }
  }
  pointers.delete(event.pointerId)
  if (pointers.size < 2) gesture = null
  drag = null
  canvas.style.cursor = "crosshair"
}
canvas.addEventListener("pointerup", finishPointer)
canvas.addEventListener("pointercancel", finishPointer)
canvas.addEventListener("pointerleave", () => { if (!drag) hover = null })
canvas.addEventListener("blur", () => { keyboardAim = false; if (!pointers.size) hover = null })
canvas.addEventListener("contextmenu", event => event.preventDefault())
canvas.addEventListener("wheel", event => {
  event.preventDefault()
  const point = pointOf(event)
  hover = point
  keyboardAim = false
  zoomCamera(camera, Math.exp(Math.max(-500, Math.min(500, event.deltaY)) * 0.0015), point.x, point.y, viewport)
}, { passive: false })

canvas.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
  if (arrows[event.key] || ["+", "=", "-", "Home", "Enter"].includes(event.key)) {
    hover = null
    keyboardAim = true
  }
  if (arrows[event.key]) {
    event.preventDefault()
    const [x, y] = arrows[event.key]
    if (drag?.kind === "launch" && drag.pointerId === null && !event.shiftKey) {
      drag.point.x += x * 12
      drag.point.y -= y * 12
      status(`Launch speed ${launchSpeed(drag).toFixed(2)}c. Enter launches; Escape cancels.`)
    } else if (event.shiftKey) panCamera(camera, x * 24, -y * 24)
    else rotateCamera(camera, x * 0.08, y * 0.08)
  } else if (event.key === "Enter" && mode === "orbit") {
    event.preventDefault()
    try { placeOrbit(viewCenter()) } catch (error) { status(error.message) }
  } else if (event.key === "Enter" && mode === "launch") {
    event.preventDefault()
    if (drag?.kind === "launch" && drag.pointerId === null) {
      try { launch(drag); updateReadout() } catch (error) { status(error.message) }
      drag = null
    } else {
      const point = viewCenter()
      drag = { kind: "launch", pointerId: null, start: point, point: { ...point } }
      status("Arrow keys set the velocity. Enter launches; Escape cancels. Shift-arrows move the aim.")
    }
  } else if (["[", "]"].includes(event.key) && world.probes.length) {
    event.preventDefault()
    const current = world.probes.findIndex(probe => probe.id === selectedId)
    const next = (current + (event.key === "]" ? 1 : -1) + world.probes.length) % world.probes.length
    selectedId = world.probes[next].id
    updateReadout()
    status(`Selected ${world.probes[next].name}. Bracket keys change the selected probe.`)
  } else if (["+", "=", "-", "Home", " "].includes(event.key)) {
    event.preventDefault()
    if (event.key === "Home") resetCamera()
    else if (event.key === " ") setPaused(!paused)
    else zoomCamera(camera, event.key === "-" ? 1.2 : 1 / 1.2, viewCenter().x, viewCenter().y, viewport)
  }
})

$("#zoom-in").addEventListener("click", () => zoomCamera(camera, 1 / 1.3, viewCenter().x, viewCenter().y, viewport))
$("#zoom-out").addEventListener("click", () => zoomCamera(camera, 1.3, viewCenter().x, viewCenter().y, viewport))
$("#pause").addEventListener("click", () => setPaused(!paused))
$("#fit").addEventListener("click", resetCamera)
$("#orbit-mode").addEventListener("click", () => setMode("orbit"))
$("#launch-mode").addEventListener("click", () => setMode("launch"))
$("#trails").addEventListener("click", () => { trailsOn = !trailsOn; $("#trails").setAttribute("aria-pressed", String(trailsOn)) })
$("#clear").addEventListener("click", () => { world = createSimulation(); selectedId = null; updateReadout(); status("Probes cleared. Click empty space to place an orbit.") })
$("#scene").addEventListener("change", event => {
  try { chooseScene(event.target.value) }
  catch (error) { event.target.value = sceneId; status(error.message) }
})
$("#physics").addEventListener("click", () => setSheet($("#sheet").hidden))
$("#sheet-close").addEventListener("click", () => setSheet(false))
$("#inspect-more").addEventListener("click", () => setSheet(true))
$("#mass-toggle").addEventListener("click", () => setMassPanel($("#mass-panel").hidden))
$("#mass-close").addEventListener("click", () => setMassPanel(false))
$("#blackhole-mass-form").addEventListener("submit", event => {
  event.preventDefault()
  $("#blackhole-mass-error").hidden = true
  $("#blackhole-mass-feedback").hidden = true
  try {
    const mass = $("#blackhole-mass").valueAsNumber
    if (mass === scale.solarMasses) { $("#blackhole-mass-feedback").textContent = "This mass is already applied." }
    else {
      const changed = changeBlackHoleMass(world, scale, mass)
      rescaleCamera(camera, changed.ratio)
      world = changed.world
      scale = changed.scale
      lastFrame = performance.now()
      hover = null
      keyboardAim = false
      drag = null
      refreshMassReadout()
      updateReadout()
      $("#blackhole-mass-feedback").textContent = "Applied. Physical positions and local velocities kept; clocks and trails restarted."
      status(`Black-hole mass: ${number(scale.solarMasses)} solar masses. Physical positions kept; clocks reset.`)
    }
    $("#blackhole-mass-feedback").hidden = false
  } catch (error) {
    $("#blackhole-mass-error").textContent = error.message
    $("#blackhole-mass-error").hidden = false
  }
})
$("#object-mass-form").addEventListener("submit", event => {
  event.preventDefault()
  $("#object-mass-error").hidden = true
  $("#object-mass-feedback").hidden = true
  try {
    const massKg = $("#object-mass").valueAsNumber * EARTH_MASS_KG
    const selected = world.probes.find(probe => probe.id === selectedId && !probe.captured)
    const candidate = selected ? world.probes.map(probe => probe === selected ? { ...probe, massKg } : probe) : [...world.probes, { massKg, energy0: 1 }]
    validateTestMasses(candidate, scale)
    if (selected) selected.massKg = massKg
    newObjectMassKg = massKg
    refreshBrush()
    updateReadout()
    $("#object-mass-feedback").textContent = selected ? `Applied to ${selected.name} and new placements. Its trajectory is unchanged.` : "Applied to new placements."
    $("#object-mass-feedback").hidden = false
  } catch (error) {
    $("#object-mass-error").textContent = error.message
    $("#object-mass-error").hidden = false
  }
})
$("#warp-toggle").addEventListener("click", () => {
  $("#warp-menu").hidden = !$("#warp-menu").hidden
  $("#warp-toggle").setAttribute("aria-expanded", String(!$("#warp-menu").hidden))
})
$("#warp-menu").addEventListener("click", event => {
  const button = event.target.closest("button[data-scale]")
  if (!button) return
  playback = Number(button.dataset.scale)
  $("#rate").textContent = button.textContent
  $("#warp-menu").hidden = true
  $("#warp-toggle").setAttribute("aria-expanded", "false")
})
$("#account-toggle").addEventListener("click", () => {
  $("#account-menu").hidden = !$("#account-menu").hidden
  $("#account-toggle").setAttribute("aria-expanded", String(!$("#account-menu").hidden))
})
$("#session-email").textContent = user?.email ?? ""
$("#account-toggle").setAttribute("aria-label", `Account, ${user?.email ?? "demo"}`)
$("#sign-out").addEventListener("click", async () => {
  try {
    await request("/api/logout", { method: "POST" })
    window.location.replace("/")
  } catch {
    status("The demo could not sign out. Close this tab to end the session.")
  }
})
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return
  if (!$("#sheet").hidden) setSheet(false)
  if (!$("#mass-panel").hidden) setMassPanel(false)
  if (drag?.kind === "launch" && drag.pointerId === null) { drag = null; status("Launch canceled.") }
})
document.addEventListener("pointerdown", event => {
  for (const [menuId, toggleId] of [["#account-menu", "#account-toggle"], ["#warp-menu", "#warp-toggle"]]) {
    if (!$(menuId).contains(event.target) && !$(toggleId).contains(event.target)) { $(menuId).hidden = true; $(toggleId).setAttribute("aria-expanded", "false") }
  }
})
window.addEventListener("resize", resize)
refreshMassReadout()

function frame(now) {
  const elapsed = Math.max(0, Math.min((now - lastFrame) / 1000, 0.08))
  lastFrame = now
  if (!paused) {
    const capturedBefore = world.probes.filter(probe => probe.captured).length
    try {
      integrate(world, elapsed * playback / scale.seconds)
      for (const probe of world.probes) {
        if (!probe.trailCaptured && (world.time - probe.trailAt >= 0.12 || probe.captured)) {
          probe.trail.push(probe.state.slice(0, 3))
          if (probe.trail.length > 700) probe.trail.splice(0, probe.trail.length - 700)
          probe.trailAt = world.time
          probe.trailCaptured = probe.captured
        }
      }
      if (world.probes.filter(probe => probe.captured).length > capturedBefore) status("A probe crossed the event horizon. Its final proper time is retained.")
      else if (world.limited) status("Accuracy hold: playback is slowed to keep integration within its step budget.")
    } catch (error) { setPaused(true); status(`Paused: ${error.message}`, Infinity) }
  }
  if (now > statusUntil) $("#status").textContent = ""
  if (now - lastReadout > 120) { updateReadout(); lastReadout = now }
  draw()
  requestAnimationFrame(frame)
}

buildKits()
resize()
chooseScene("precession")
setMode("orbit")
requestAnimationFrame(frame)
