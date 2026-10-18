import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createAccountStore } from "../accounts.js"
import { createApp } from "../server.mjs"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const storePath = process.env.VERCEL ? "/tmp/orbit-accounts.json" : resolve(root, "data/accounts.json")
const app = createApp({
  store: createAccountStore(storePath),
  root,
})

export default app
