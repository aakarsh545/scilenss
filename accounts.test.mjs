import { createServer } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createAccountStore } from "./accounts.js"
import { buildScenario, energyDrift, worldFromSnapshot } from "./orbit-physics.js"
import { createApp } from "./server.mjs"

const root = resolve(fileURLToPath(new URL(".", import.meta.url)))
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`ok  ${message}`)
    return
  }
  failed += 1
  console.error(`FAIL  ${message}`)
}

function snapshotOf(id) {
  const built = buildScenario(id)
  return {
    time: built.world.time,
    nextId: built.world.nextId,
    timeScale: built.view.timeScale,
    camera: { x: 0, y: 0, mpp: 1e9 },
    bodies: built.world.bodies.map((body) => ({
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

function client(base) {
  let cookie = ""
  return async function api(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const raw = response.headers.get("set-cookie") ?? ""
    const pair = raw.split(";")[0]
    if (pair.startsWith("orbit_session=")) {
      cookie = pair.slice("orbit_session=".length) ? pair : ""
    }
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }
}

const directory = await mkdtemp(resolve(tmpdir(), "orbit-accounts-"))
const store = createAccountStore(resolve(directory, "accounts.json"))
const server = createServer(createApp({ store, root }))
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen))
const { port } = server.address()
const base = `http://127.0.0.1:${port}`

try {
  const ada = client(base)
  const bob = client(base)
  const sunEarth = snapshotOf("sun-earth")

  const home = await fetch(`${base}/`)
  const homeHtml = await home.text()
  assert(home.status === 200 && homeHtml.includes("See how it works"), "the landing page is the front door")
  const loginPage = await fetch(`${base}/login`)
  assert((await loginPage.text()).includes("Demo sign-in. No account is created."), "the login page identifies demo access")
  for (const path of ["/orbit", "/orbit/", "/orbit.html"]) {
    const locked = await fetch(`${base}${path}`, { redirect: "manual" })
    const lockedHtml = await locked.text()
    assert(locked.status === 302 && locked.headers.get("location") === "/login" && !lockedHtml.includes("Black-hole coordinate view"), `${path} sends a visitor without a session to sign-in`)
  }
  const forged = await fetch(`${base}/orbit`, { redirect: "manual", headers: { cookie: "orbit_session=d1.eyJlIjoieEB5LnoiLCJ4Ijo5OTk5OTk5OTk5OTk5fQ.forged" } })
  assert(forged.status === 302, "a forged session cookie does not open the field")

  const demo = await fetch(`${base}/api/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "Anyone@Example.com", password: "x" }),
  })
  const demoCookie = (demo.headers.get("set-cookie") ?? "").split(";")[0]
  assert(demo.status === 200 && demoCookie.startsWith("orbit_session=d1."), "demo sign-in accepts any email and password")
  const field = await fetch(`${base}/orbit`, { headers: { cookie: demoCookie } })
  assert(field.status === 200 && (await field.text()).includes("Black-hole coordinate view"), "a demo session opens the field")
  const demoMe = await (await fetch(`${base}/api/me`, { headers: { cookie: demoCookie } })).json()
  assert(demoMe.email === "anyone@example.com" && demoMe.demo === true, "the demo session is marked as a demo")
  const demoSave = await fetch(`${base}/api/projects`, { headers: { cookie: demoCookie } })
  assert(demoSave.status === 401, "a demo session cannot reach saved projects")
  const demoOut = await fetch(`${base}/api/logout`, { method: "POST", headers: { cookie: demoCookie } })
  assert((demoOut.headers.get("set-cookie") ?? "").includes("Max-Age=0"), "demo sign-out clears the cookie")

  const created = await ada("/api/signup", {
    method: "POST",
    body: { email: "Ada@Example.com", password: "orbit-pass" },
  })
  assert(created.status === 201 && created.body.email === "ada@example.com", "signup stores the email in lowercase")

  const me = await ada("/api/me")
  assert(me.status === 200 && me.body.email === "ada@example.com", "session cookie identifies the email")

  const saved = await ada("/api/projects", {
    method: "POST",
    body: { name: "Desk system", snapshot: sunEarth },
  })
  assert(saved.status === 201 && saved.body.project.email === "ada@example.com", "project is saved for the signed-in email")

  const restored = worldFromSnapshot(saved.body.project.snapshot)
  assert(restored.world.bodies.length === 2, "saved sun and earth come back as two bodies")
  assert(Math.abs(energyDrift(restored.world)) < 1e-12, "restored project keeps a fresh energy baseline")

  const listed = await ada("/api/projects")
  assert(listed.body.projects.length === 1 && listed.body.projects[0].name === "Desk system", "the email lists its project")

  const again = await ada("/api/projects", {
    method: "POST",
    body: { name: "desk system", snapshot: snapshotOf("earth-moon") },
  })
  assert(again.body.project.id === saved.body.project.id, "saving the same name updates that project")
  assert((await ada("/api/projects")).body.projects.length === 1, "a repeated name does not create a second project")

  const bobSignup = await bob("/api/signup", {
    method: "POST",
    body: { email: "bob@example.com", password: "orbit-pass" },
  })
  assert(bobSignup.status === 201, "a second email can create an account")
  const bobList = await bob("/api/projects")
  assert(bobList.body.projects.length === 0, "another email does not see the first project")
  const stolen = await bob(`/api/projects/${saved.body.project.id}`, { method: "DELETE" })
  assert(stolen.status === 404, "another email cannot delete the project")
  assert((await ada("/api/projects")).body.projects.length === 1, "the project remains for the owner")

  const duplicate = await ada("/api/signup", {
    method: "POST",
    body: { email: "ada@example.com", password: "orbit-pass" },
  })
  assert(duplicate.status === 409, "the same email cannot register twice")

  const wrong = await client(base)("/api/login", {
    method: "POST",
    body: { email: "ada@example.com", password: "wrong-pass" },
  })
  assert(wrong.status === 401, "a wrong password is rejected")

  const broken = await ada("/api/projects", {
    method: "POST",
    body: { name: "Broken", snapshot: { time: 0, timeScale: 10, camera: { x: 0, y: 0, mpp: 1000 }, bodies: [{ kind: "planet" }] } },
  })
  assert(broken.status === 400, "a project with an unusable body is rejected")

  await ada("/api/logout", { method: "POST" })
  assert((await ada("/api/me")).status === 401, "sign-out ends the session")
  const returned = await ada("/api/login", {
    method: "POST",
    body: { email: "ada@example.com", password: "orbit-pass" },
  })
  assert(returned.status === 200, "the email can sign in again")
  assert((await ada("/api/projects")).body.projects[0].snapshot.bodies.length === 2, "the project is still there after signing in again")
} finally {
  await new Promise((resolveClose) => server.close(resolveClose))
  await rm(directory, { recursive: true, force: true })
}

if (failed > 0) {
  console.error(`${failed} failed`)
  process.exitCode = 1
}
