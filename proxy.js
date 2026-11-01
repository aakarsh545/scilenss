import { next } from "@vercel/functions"
import { cookieValue, verifyDemo } from "./demo-session.mjs"

export default function proxy(request) {
  if (verifyDemo(cookieValue(request.headers.get("cookie")))) return next()
  return new Response(null, {
    status: 302,
    headers: { Location: "/login", "Cache-Control": "no-store" },
  })
}
