const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0)
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const MIN_SCALE = 0.0015
const MAX_SCALE = 20

export function createCamera() {
  return { target: [0, 0, 0], azimuth: -0.3, elevation: 0.65, scale: 0.04, minScale: MIN_SCALE, maxScale: MAX_SCALE }
}

export function cameraBasis(camera) {
  const a = camera.azimuth
  const e = camera.elevation
  return {
    right: [Math.cos(a), Math.sin(a), 0],
    up: [-Math.sin(a) * Math.sin(e), Math.cos(a) * Math.sin(e), Math.cos(e)],
    eye: [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)],
  }
}

export function project(position, camera, viewport, basis = cameraBasis(camera)) {
  const delta = position.map((value, i) => value - camera.target[i])
  return { x: (viewport.centerX ?? viewport.width / 2) + dot(delta, basis.right) / camera.scale, y: (viewport.centerY ?? viewport.height / 2) - dot(delta, basis.up) / camera.scale, depth: dot(delta, basis.eye) }
}

export function unproject(x, y, camera, viewport, depth = 0) {
  const { right, up, eye } = cameraBasis(camera)
  const sx = (x - (viewport.centerX ?? viewport.width / 2)) * camera.scale
  const sy = ((viewport.centerY ?? viewport.height / 2) - y) * camera.scale
  return camera.target.map((value, i) => value + sx * right[i] + sy * up[i] + depth * eye[i])
}

export function panCamera(camera, dx, dy) {
  const { right, up } = cameraBasis(camera)
  camera.target = camera.target.map((value, i) => value - dx * camera.scale * right[i] + dy * camera.scale * up[i])
}

export function rotateCamera(camera, azimuth, elevation) {
  const before = cameraBasis(camera)
  const horizontal = dot(camera.target, before.right)
  const vertical = dot(camera.target, before.up)
  camera.azimuth = (camera.azimuth + azimuth) % (2 * Math.PI)
  camera.elevation = clamp(camera.elevation + elevation, -85 * Math.PI / 180, 85 * Math.PI / 180)
  const after = cameraBasis(camera)
  // Keep the black hole at the same screen position after a pan or anchored zoom.
  camera.target = after.right.map((value, i) => horizontal * value + vertical * after.up[i])
}

export function zoomCamera(camera, factor, x, y, viewport) {
  const anchor = unproject(x, y, camera, viewport)
  camera.scale = clamp(camera.scale * factor, camera.minScale, camera.maxScale)
  const moved = unproject(x, y, camera, viewport)
  camera.target = camera.target.map((value, i) => value + anchor[i] - moved[i])
}

export function rescaleCamera(camera, ratio) {
  if (!(Number.isFinite(ratio) && ratio > 0)) throw new Error("Invalid camera unit conversion.")
  camera.target = camera.target.map(value => value * ratio)
  camera.scale *= ratio
  // Retain the previous physical view and allow zooming to the new horizon scale.
  camera.minScale = Math.min(MIN_SCALE, camera.minScale * ratio)
  camera.maxScale = Math.max(MAX_SCALE, camera.maxScale * ratio)
}
