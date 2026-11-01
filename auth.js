const GMAIL_ADDRESS = /^[a-z0-9]+(?:\.[a-z0-9]+)*(?:\+[a-z0-9._+-]+)?@gmail\.com$/i

export function normalizeGmail(value) {
  const email = String(value ?? "").trim().toLowerCase()
  if (email.length > 254 || email.split("@")[0].length > 64 || !GMAIL_ADDRESS.test(email)) {
    throw new Error("Enter a valid @gmail.com address.")
  }
  return email
}

export async function request(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(body?.error || "The account request failed.")
  return body
}

export async function currentUser() {
  try {
    return await request("/api/me")
  } catch {
    return null
  }
}
