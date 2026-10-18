import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, resolve, sep } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { AccountError, createAccountStore } from "./accounts.js"

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)))
const port = Number.parseInt(process.env.PORT ?? "4174", 10)
const COOKIE = "orbit_session"
const attempts = new Map()

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
])

const statusFor = {
  email: 400,
  password: 400,
  name: 400,
  snapshot: 400,
  exists: 409,
  credentials: 401,
  unauthorized: 401,
  not_found: 404,
  limit: 400,
  bad_json: 400,
  too_large: 413,
}

function sendJson(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...extraHeaders,
  })
  response.end(payload)
}

function sendFile(response, filePath, fileStats) {
  response.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    "Content-Length": fileStats.size,
    "Cache-Control": "no-cache",
  })
  createReadStream(filePath).pipe(response)
}

function readCookie(request, name) {
  const header = request.headers.cookie ?? ""
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return decodeURIComponent(rest.join("="))
  }
  return ""
}

function sessionCookie(token, maxAge) {
  const value = token ? encodeURIComponent(token) : ""
  const secure = process.env.VERCEL ? "; Secure" : ""
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
}

function limited(request) {
  const ip = request.socket.remoteAddress ?? "unknown"
  const now = Date.now()
  const entry = attempts.get(ip) ?? { count: 0, reset: now + 15 * 60 * 1000 }
  if (now > entry.reset) {
    entry.count = 0
    entry.reset = now + 15 * 60 * 1000
  }
  entry.count += 1
  attempts.set(ip, entry)
  if (attempts.size > 1000) {
    for (const [key, value] of attempts) {
      if (now > value.reset) attempts.delete(key)
    }
  }
  return entry.count > 20
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = []
    let size = 0
    request.on("data", (chunk) => {
      size += chunk.length
      if (size > 200_000) {
        reject(new AccountError("too_large", "That project is too large to save."))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on("end", () => {
      if (size === 0) {
        resolveBody({})
        return
      }
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")))
      } catch {
        reject(new AccountError("bad_json", "The request was not valid JSON."))
      }
    })
    request.on("error", reject)
  })
}

async function requireUser(store, request) {
  const user = await store.userForToken(readCookie(request, COOKIE))
  if (!user) throw new AccountError("unauthorized", "Sign in with your email to save a project.")
  return user
}

export function createApp({ store, root }) {
  return async function app(request, response) {
    try {
      const url = new URL(request.url ?? "/", "http://localhost")
      const pathname = decodeURIComponent(url.pathname)
      if (pathname.startsWith("/api/")) {
        await handleApi(store, request, response, pathname)
        return
      }

      const requestedPath = resolve(root, `.${pathname}`)
      const isInsideProject = requestedPath === root || requestedPath.startsWith(`${root}${sep}`)
      if (isInsideProject && extname(requestedPath)) {
        try {
          const fileStats = await stat(requestedPath)
          if (fileStats.isFile()) {
            sendFile(response, requestedPath, fileStats)
            return
          }
        } catch {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
          response.end("Not found")
          return
        }
      }

      const indexPath = resolve(root, "orbit.html")
      const indexStats = await stat(indexPath)
      sendFile(response, indexPath, indexStats)
    } catch (error) {
      const status = statusFor[error?.code] ?? 500
      const message = status === 500 ? "The simulator could not finish that request." : error.message
      if (!response.headersSent) sendJson(response, status, { error: message })
    }
  }
}

async function handleApi(store, request, response, pathname) {
  if (request.method === "POST" && (pathname === "/api/signup" || pathname === "/api/login")) {
    if (limited(request)) {
      sendJson(response, 429, { error: "Too many sign-in attempts. Wait a few minutes and try again." })
      return
    }
    const body = await readJson(request)
    const result = pathname === "/api/signup"
      ? await store.signup(body.email, body.password)
      : await store.login(body.email, body.password)
    sendJson(response, pathname === "/api/signup" ? 201 : 200, { email: result.email }, {
      "Set-Cookie": sessionCookie(result.token, 30 * 24 * 60 * 60),
    })
    return
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    await store.logout(readCookie(request, COOKIE))
    sendJson(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) })
    return
  }

  if (request.method === "GET" && pathname === "/api/me") {
    const user = await requireUser(store, request)
    sendJson(response, 200, { email: user.email })
    return
  }

  if (request.method === "GET" && pathname === "/api/projects") {
    const user = await requireUser(store, request)
    sendJson(response, 200, { email: user.email, projects: await store.listProjects(user) })
    return
  }

  if (request.method === "POST" && pathname === "/api/projects") {
    const user = await requireUser(store, request)
    const body = await readJson(request)
    const project = await store.saveProject(user, body)
    sendJson(response, 201, { project })
    return
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([a-f0-9]{32})$/)
  if (request.method === "DELETE" && projectMatch) {
    const user = await requireUser(store, request)
    await store.deleteProject(user, projectMatch[1])
    sendJson(response, 200, { ok: true })
    return
  }

  sendJson(response, 404, { error: "Not found" })
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ""
if (entry === import.meta.url) {
  const store = createAccountStore(resolve(projectRoot, "data/accounts.json"))
  const server = createServer(createApp({ store, root: projectRoot }))
  server.listen(port, "127.0.0.1", () => {
    console.log(`Orbital gravity running at http://127.0.0.1:${port}`)
  })
}
