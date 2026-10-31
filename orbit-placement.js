import { cameraBasis, unproject } from "./orbit-camera.js?v=controls-2"

export function viewPosition(point, camera, viewport) {
  const { eye } = cameraBasis(camera)
  const depth = -camera.target.reduce((sum, value, i) => sum + value * eye[i], 0)
  return unproject(point.x, point.y, camera, viewport, depth)
}

export function circularPlacement(point, camera, viewport) {
  const position = viewPosition(point, camera, viewport)
  const radius = Math.hypot(...position)
  if (!(radius > 3)) return { valid: false, radius, position }
  const { eye } = cameraBasis(camera)
  const [x, y, z] = position
  const tangent = [eye[1] * z - eye[2] * y, eye[2] * x - eye[0] * z, eye[0] * y - eye[1] * x]
  const speed = 1 / Math.sqrt(2 * (radius - 1))
  const factor = speed / Math.hypot(...tangent)
  return { valid: true, radius, position, speed, velocity: tangent.map(value => value * factor) }
}
