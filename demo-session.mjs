import { createHmac, timingSafeEqual } from "node:crypto"

export const COOKIE = "orbit_session"
export const DEMO_MAX_AGE = 7 * 24 * 60 * 60

function secret() {
  return process.env.DEMO_SECRET || "scilenss-demo-gate-v1"
}

function signature(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url")
}

export function signDemo(email) {
  const payload = Buffer.from(JSON.stringify({ e: email, x: Date.now() + DEMO_MAX_AGE * 1000 })).toString("base64url")
  return `d1.${payload}.${signature(payload)}`
}

export function verifyDemo(token) {
  const [version, payload, given] = String(token ?? "").split(".")
  if (version !== "d1" || !payload || !given) return null
  const actual = Buffer.from(given)
  const expected = Buffer.from(signature(payload))
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (typeof data?.e !== "string" || typeof data?.x !== "number" || data.x < Date.now()) return null
    return { email: data.e }
  } catch {
    return null
  }
}

export function cookieValue(header, name = COOKIE) {
  for (const part of String(header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="))
      } catch {
        return ""
      }
    }
  }
  return ""
}
