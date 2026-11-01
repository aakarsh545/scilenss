import { currentUser, normalizeGmail, request } from "./auth.js"

const form = document.querySelector("#auth-form")
const email = document.querySelector("#auth-email")
const password = document.querySelector("#auth-password")
const error = document.querySelector("#auth-error")
const submit = document.querySelector("#auth-submit")

currentUser().then((user) => {
  if (user) window.location.replace("/orbit")
})

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  error.textContent = ""
  let address
  try {
    address = normalizeGmail(email.value)
  } catch (cause) {
    error.textContent = cause.message
    email.setAttribute("aria-invalid", "true")
    email.focus()
    return
  }
  submit.disabled = true
  try {
    await request("/api/demo-login", {
      method: "POST",
      body: { email: address, password: password.value },
    })
    form.reset()
    window.location.replace("/orbit")
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : "The demo could not start. Try again."
    submit.disabled = false
    email.focus()
  }
})

email.addEventListener("input", () => {
  email.removeAttribute("aria-invalid")
  error.textContent = ""
})

document.querySelector("#auth-fields").disabled = false
