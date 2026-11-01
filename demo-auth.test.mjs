import assert from "node:assert/strict"
import { currentUser, normalizeGmail } from "./auth.js"
import { signDemo } from "./demo-session.mjs"
import proxy from "./proxy.js"

const originalFetch = globalThis.fetch

assert.equal(normalizeGmail("  Ada.Lovelace+demo@GMAIL.COM  "), "ada.lovelace+demo@gmail.com", "Gmail addresses are normalized")
for (const email of ["", "ada@example.com", "ada@gmail.com.evil.test", "ada@@gmail.com", "@gmail.com", "ada lovelace@gmail.com", ".ada@gmail.com", "ada..lovelace@gmail.com", "ada.@gmail.com"]) {
  assert.throws(() => normalizeGmail(email), /valid @gmail\.com/, `invalid address rejected: ${email}`)
}
console.log("ok  only @gmail.com addresses can sign in")

const gate = (cookie) => proxy(new Request("https://scilenss.vercel.app/orbit", cookie ? { headers: { cookie } } : {}))
const locked = gate()
assert.equal(locked.status, 302, "the proxy stops a visitor with no session")
assert.equal(locked.headers.get("location"), "/login", "the proxy sends them to sign in")
assert.equal(gate("orbit_session=d1.eyJlIjoieEBnbWFpbC5jb20iLCJ4Ijo5OTk5OTk5OTk5OTk5fQ.forged").status, 302, "the proxy rejects a forged cookie")
const open = gate(`orbit_session=${encodeURIComponent(signDemo("ada@gmail.com"))}`)
assert.equal(open.headers.get("x-middleware-next"), "1", "the proxy lets a signed-in visitor through")
console.log("ok  the Vercel proxy gates the field")

try {
  globalThis.fetch = async (path) => {
    assert.equal(path, "/api/me")
    return new Response(JSON.stringify({ error: "Sign in to open the field." }), { status: 401 })
  }
  assert.equal(await currentUser(), null, "no session cookie means no user")

  globalThis.fetch = async () => new Response(JSON.stringify({ email: "guest@example.com", demo: true }), { status: 200 })
  assert.deepEqual(await currentUser(), { email: "guest@example.com", demo: true }, "the server session names the demo user")

  globalThis.fetch = async () => {
    throw new TypeError("offline")
  }
  assert.equal(await currentUser(), null, "a network failure keeps the field locked")
  console.log("ok  the client trusts only the server session")
} finally {
  globalThis.fetch = originalFetch
}
