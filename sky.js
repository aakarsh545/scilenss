import { earthGlobe } from "./earth-globe.js"

const globe = earthGlobe()

function mix(from, to, amount) {
  const channel = (a, b) => Math.round(a + (b - a) * amount)
  return `rgb(${channel(from[0], to[0])} ${channel(from[1], to[1])} ${channel(from[2], to[2])})`
}

export function paintSky(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext("2d", { alpha: false })
  const stars = []
  let earthPhase = 0.067
  let frame = 0
  let stopped = false

  function resize() {
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.max(1, window.innerWidth)
    const height = Math.max(1, window.innerHeight)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    stars.length = 0
    const count = Math.round((width * height) / 14000)
    for (let index = 0; index < count; index += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() < 0.86 ? 0.7 : 1.15,
        a: 0.18 + Math.random() * 0.55,
      })
    }
  }

  function earth(width, height) {
    const mobile = width < 820
    const radius = mobile ? Math.min(width, height) * 0.42 : Math.min(width, height) * 0.46
    const x = mobile ? width * 0.52 : width * 0.72
    const y = mobile ? height * 0.38 : height * 0.5
    const haze = ctx.createRadialGradient(x, y, radius * 0.92, x, y, radius * 1.18)
    haze.addColorStop(0, "rgba(110, 147, 196, 0)")
    haze.addColorStop(0.45, "rgba(180, 210, 235, 0.16)")
    haze.addColorStop(1, "rgba(110, 147, 196, 0)")
    ctx.fillStyle = haze
    ctx.beginPath()
    ctx.arc(x, y, radius * 1.18, 0, Math.PI * 2)
    ctx.fill()

    const painted = globe.draw(ctx, x, y, radius, {
      rotation: reducedMotion ? 0.72 : earthPhase * Math.PI * 2,
      clouds: reducedMotion ? 0.05 : earthPhase * 0.35,
      light: { x: -0.22, y: 0.18, z: 0.96 },
    })
    if (painted) return
    const hx = x - radius * (0.32 + earthPhase * 0.08)
    const hy = y - radius * 0.34
    const ball = ctx.createRadialGradient(hx, hy, radius * 0.08, x, y, radius)
    ball.addColorStop(0, mix([214, 228, 242], [110, 147, 196], 0.12))
    ball.addColorStop(0.58, "#6e93c4")
    ball.addColorStop(1, mix([110, 147, 196], [9, 10, 13], 0.52))
    ctx.fillStyle = ball
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  function draw() {
    const width = window.innerWidth
    const height = window.innerHeight
    ctx.fillStyle = "#090a0d"
    ctx.fillRect(0, 0, width, height)
    for (const star of stars) {
      ctx.fillStyle = `rgba(235, 230, 220, ${star.a})`
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
      ctx.fill()
    }
    earth(width, height)
  }

  function tick() {
    frame = window.requestAnimationFrame(tick)
    if (!reducedMotion) earthPhase = (earthPhase + 0.0014) % 1
    draw()
  }

  resize()
  draw()
  if (!reducedMotion) tick()
  else globe.load().then(() => {
    if (!stopped) draw()
  })
  function onResize() {
    resize()
    draw()
  }
  window.addEventListener("resize", onResize)
  return () => {
    stopped = true
    window.cancelAnimationFrame(frame)
    window.removeEventListener("resize", onResize)
  }
}
