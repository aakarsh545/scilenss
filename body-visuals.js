import { earthGlobe, earthSpin } from "./earth-globe.js"

function hexChannels(hex) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function mix(hex, toward, amount) {
  const [r, g, b] = hexChannels(hex)
  const [tr, tg, tb] = hexChannels(toward)
  const channel = (from, to) => Math.round(from + (to - from) * amount)
  return `rgb(${channel(r, tr)} ${channel(g, tg)} ${channel(b, tb)})`
}

export function withAlpha(hex, alpha) {
  const [r, g, b] = hexChannels(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function drawSphere(ctx, x, y, radius, color) {
  const shade = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.38, radius * 0.08, x, y, radius)
  shade.addColorStop(0, mix(color, "#ffffff", 0.42))
  shade.addColorStop(0.62, color)
  shade.addColorStop(1, mix(color, "#090a0d", 0.45))
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

export function drawCelestialBody(ctx, body, x, y, radius, seconds, { reducedMotion = false, motion = null } = {}) {
  ctx.save()
  const stellar = ["star", "giantstar", "whitedwarf"].includes(body.kind)
  if (stellar || ["planet", "giant"].includes(body.kind)) {
    const reach = radius * (stellar ? 4 : 1.25)
    const glow = ctx.createRadialGradient(x, y, radius * 0.9, x, y, reach)
    glow.addColorStop(0, withAlpha(body.color, stellar ? 0.35 : 0.22))
    glow.addColorStop(1, withAlpha(body.color, 0))
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(x, y, reach, 0, Math.PI * 2); ctx.fill()
  }
  if (body.kind === "comet" && motion) {
    const length = Math.hypot(motion.x, motion.y)
    if (length > 1e-8) {
      const endX = x - motion.x / length * radius * 5
      const endY = y - motion.y / length * radius * 5
      const tail = ctx.createLinearGradient(x, y, endX, endY)
      tail.addColorStop(0, withAlpha(body.color, 0.6)); tail.addColorStop(1, withAlpha(body.color, 0))
      ctx.strokeStyle = tail; ctx.lineWidth = radius * 0.7
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke()
    }
  }
  const textured = body.presetId === "earth" && earthGlobe().draw(ctx, x, y, radius, {
    rotation: earthSpin(seconds, reducedMotion),
    clouds: reducedMotion ? 0.04 : seconds / 140000 % (Math.PI * 2),
  })
  if (body.kind === "blackhole") {
    ctx.fillStyle = "#07080c"; ctx.strokeStyle = "#e0a15a"; ctx.lineWidth = 1.25
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x, y, radius + 3, 0, Math.PI * 2); ctx.stroke()
  } else if (!textured) drawSphere(ctx, x, y, radius, body.color)
  if (body.presetId === "saturn") {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.28)
    ctx.strokeStyle = withAlpha("#e4d0a4", 0.6); ctx.lineWidth = Math.max(1.5, radius * 0.08)
    ctx.beginPath(); ctx.arc(0, 0, radius * 1.85, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  }
  if (body.kind === "pulsar") {
    const angle = reducedMotion ? 0.4 : seconds / 900
    ctx.strokeStyle = "rgba(237,242,244,0.72)"; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x - Math.cos(angle) * radius * 3, y + Math.sin(angle) * radius * 3)
    ctx.lineTo(x + Math.cos(angle) * radius * 3, y - Math.sin(angle) * radius * 3); ctx.stroke()
  }
  ctx.restore()
}
