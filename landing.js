import { paintSky } from "./sky.js"

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)")
const canvas = document.querySelector("#sky")
const toggle = document.querySelector("#sky-toggle")
let paused = motionPreference.matches
let stopSky = paintSky(canvas, { reducedMotion: paused })

function setPaused(value) {
  paused = value
  stopSky()
  stopSky = paintSky(canvas, { reducedMotion: paused })
  toggle.textContent = paused ? "Play animation" : "Pause animation"
}

toggle.textContent = paused ? "Play animation" : "Pause animation"
toggle.hidden = false
toggle.addEventListener("click", () => setPaused(!paused))
motionPreference.addEventListener("change", (event) => setPaused(event.matches))
