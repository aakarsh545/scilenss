import assert from "node:assert/strict"
import { currentUser } from "./auth.js"

const originalFetch = globalThis.fetch

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
