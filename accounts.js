import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { normalizeSnapshot } from "./orbit-physics.js"

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const MAX_PROJECTS = 40

export class AccountError extends Error {
  constructor(code, message) {
    super(message)
    this.name = "AccountError"
    this.code = code
  }
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase()
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AccountError("email", "Enter a real email address.")
  }
  return email
}

function checkPassword(password) {
  const value = String(password ?? "")
  if (value.length < 8 || value.length > 200) {
    throw new AccountError("password", "Use a password of at least 8 characters.")
  }
  return value
}

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32, SCRYPT)
  return {
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
    n: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  }
}

function verifyPassword(password, stored) {
  const salt = Buffer.from(stored.salt, "base64")
  const expected = Buffer.from(stored.hash, "base64")
  const actual = scryptSync(password, salt, expected.length, {
    N: stored.n,
    r: stored.r,
    p: stored.p,
    maxmem: SCRYPT.maxmem,
  })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex")
}

function cleanName(value) {
  const name = String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80)
  if (!name) throw new AccountError("name", "Name the project before saving.")
  return name
}

function publicProject(project) {
  return {
    id: project.id,
    email: project.email,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    snapshot: project.snapshot,
  }
}

function emptyState() {
  return { users: [], sessions: [], projects: [] }
}

function readState(parsed) {
  return {
    users: Array.isArray(parsed?.users) ? parsed.users : [],
    sessions: Array.isArray(parsed?.sessions) ? parsed.sessions : [],
    projects: Array.isArray(parsed?.projects) ? parsed.projects : [],
  }
}

export function createAccountStore(filePath, options = {}) {
  let state = emptyState()
  let loaded = false
  let writing = Promise.resolve()

  function enqueue(task) {
    const run = writing.then(task)
    writing = run.then(() => undefined, () => undefined)
    return run
  }

  async function load() {
    if (loaded && !options.fresh) return
    if (options.io) {
      state = readState(await options.io.read())
      loaded = true
      return
    }
    try {
      state = readState(JSON.parse(await readFile(filePath, "utf8")))
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      state = emptyState()
    }
    loaded = true
  }

  async function persist() {
    if (options.io) {
      await options.io.write(state)
      return
    }
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.tmp`
    await writeFile(temporary, JSON.stringify(state), "utf8")
    await rename(temporary, filePath)
  }

  function issueSession(userId) {
    const token = randomBytes(32).toString("base64url")
    state.sessions.push({
      tokenHash: tokenHash(token),
      userId,
      expiresAt: Date.now() + SESSION_MS,
    })
    return token
  }

  return {
    signup(email, password) {
      const normalized = normalizeEmail(email)
      const secret = checkPassword(password)
      return enqueue(async () => {
        await load()
        if (state.users.some((user) => user.email === normalized)) {
          throw new AccountError("exists", "An account already uses that email.")
        }
        const user = {
          id: randomBytes(16).toString("hex"),
          email: normalized,
          password: hashPassword(secret),
          createdAt: new Date().toISOString(),
        }
        state.users.push(user)
        const token = issueSession(user.id)
        await persist()
        return { token, email: user.email }
      })
    },

    login(email, password) {
      const normalized = normalizeEmail(email)
      const secret = checkPassword(password)
      return enqueue(async () => {
        await load()
        const user = state.users.find((entry) => entry.email === normalized)
        if (!user || !verifyPassword(secret, user.password)) {
          throw new AccountError("credentials", "Email or password does not match.")
        }
        const now = Date.now()
        state.sessions = state.sessions.filter((session) => session.expiresAt > now)
        const token = issueSession(user.id)
        await persist()
        return { token, email: user.email }
      })
    },

    logout(token) {
      return enqueue(async () => {
        await load()
        if (!token) return
        const hash = tokenHash(token)
        state.sessions = state.sessions.filter((session) => session.tokenHash !== hash)
        await persist()
      })
    },

    userForToken(token) {
      return enqueue(async () => {
        await load()
        if (!token) return null
        const now = Date.now()
        const session = state.sessions.find((entry) => entry.tokenHash === tokenHash(token) && entry.expiresAt > now)
        if (!session) return null
        const user = state.users.find((entry) => entry.id === session.userId)
        return user ? { id: user.id, email: user.email } : null
      })
    },

    listProjects(user) {
      return enqueue(async () => {
        await load()
        return state.projects
          .filter((project) => project.userId === user.id)
          .map(publicProject)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      })
    },

    saveProject(user, input) {
      const name = cleanName(input?.name)
      let snapshot
      try {
        snapshot = normalizeSnapshot(input?.snapshot)
      } catch (error) {
        throw new AccountError("snapshot", error instanceof Error ? error.message : "That project could not be saved.")
      }
      return enqueue(async () => {
        await load()
        const now = new Date().toISOString()
        let project = state.projects.find((entry) => entry.userId === user.id && entry.name.toLowerCase() === name.toLowerCase())
        if (!project) {
          const owned = state.projects.filter((entry) => entry.userId === user.id).length
          if (owned >= MAX_PROJECTS) {
            throw new AccountError("limit", "This email already has 40 projects. Delete one before saving another.")
          }
          project = {
            id: randomBytes(16).toString("hex"),
            userId: user.id,
            email: user.email,
            name,
            createdAt: now,
            snapshot,
          }
          state.projects.push(project)
        } else {
          project.name = name
          project.email = user.email
          project.snapshot = snapshot
        }
        project.updatedAt = now
        await persist()
        return publicProject(project)
      })
    },

    deleteProject(user, id) {
      return enqueue(async () => {
        await load()
        const project = state.projects.find((entry) => entry.id === id)
        if (!project || project.userId !== user.id) {
          throw new AccountError("not_found", "That project is not saved for this email.")
        }
        state.projects = state.projects.filter((entry) => entry.id !== id)
        await persist()
      })
    },
  }
}
