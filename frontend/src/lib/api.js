// Backend + WebAuthn helpers (ported from the vanilla app).
import { NATIVE } from './native.js'

// Where the API lives. Empty (same origin) for every browser build, so nothing about the
// self-hosted setup changes. The native shell serves its own bundle from capacitor://localhost,
// which is not the server's origin, so it has to be pointed at the server explicitly —
// VITE_API_BASE, set at build time from .env.local (see .env.local.example).
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

// Cross-origin cookies from capacitor://localhost are a fight not worth having, so the native
// app authenticates with the long-lived device token as a bearer header instead. The token is
// the same one GET /api/device-login takes in the query string; that route still works and
// stays as the fallback.
export const DEVICE_TOKEN = import.meta.env.VITE_DEVICE_TOKEN || ''
const HEADER_AUTH = NATIVE && !!DEVICE_TOKEN

export const IS_APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
export const IS_ANDROID = /Android/.test(navigator.userAgent)
export const BIO = IS_APPLE ? 'Face ID / Touch ID' : IS_ANDROID ? 'fingerprint or face unlock' : 'your fingerprint, face or PIN'
export const VAULT = IS_APPLE ? 'iCloud Keychain' : IS_ANDROID ? 'Google Password Manager' : 'your password manager'
// WKWebView exposes `window.PublicKeyCredential` and `navigator.credentials` and then refuses
// every call against them — the app is served from capacitor://localhost, which is not an origin
// WebAuthn will ever accept as a relying party. Feature-detection alone therefore says yes on the
// phone and the UI offers passkey flows that cannot complete. NATIVE is the honest answer, and it
// is false in every browser, so nothing about browser behaviour changes here. The native shell
// authenticates with the device token instead (HEADER_AUTH above).
export const webauthnOK = () => !NATIVE && !!(window.PublicKeyCredential && navigator.credentials)

export async function api(path, opts) {
  const init = Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts)
  if (HEADER_AUTH) {
    init.headers = { ...init.headers, Authorization: 'Bearer ' + DEVICE_TOKEN }
    init.credentials = 'omit'   // nothing to send, and no cookie jar to depend on
  }
  const r = await fetch(API_BASE + path, init)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(data.error || ('HTTP ' + r.status)); e.status = r.status; throw e }
  return data
}

const bufToB64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64uToBuf = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)).buffer

function toCreationOptions(o) {
  o.challenge = b64uToBuf(o.challenge)
  o.user.id = b64uToBuf(o.user.id)
  ;(o.excludeCredentials || []).forEach(c => { c.id = b64uToBuf(c.id) })
  return o
}
function toRequestOptions(o) {
  o.challenge = b64uToBuf(o.challenge)
  ;(o.allowCredentials || []).forEach(c => { c.id = b64uToBuf(c.id) })
  return o
}
function credToJSON(cred) {
  const r = cred.response
  const out = {
    id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
    authenticatorAttachment: cred.authenticatorAttachment || null,
    response: { clientDataJSON: bufToB64u(r.clientDataJSON) }
  }
  if (r.attestationObject) {
    out.response.attestationObject = bufToB64u(r.attestationObject)
    out.response.transports = r.getTransports ? r.getTransports() : ['internal']
  }
  if (r.authenticatorData) {
    out.response.authenticatorData = bufToB64u(r.authenticatorData)
    out.response.signature = bufToB64u(r.signature)
    out.response.userHandle = r.userHandle ? bufToB64u(r.userHandle) : null
  }
  return out
}
export async function passkeyRegister(name, code) {
  const { cid, options } = await api('/api/register/options', { method: 'POST', body: JSON.stringify({ name, code: code || '' }) })
  const cred = await navigator.credentials.create({ publicKey: toCreationOptions(options) })
  const res = await api('/api/register/verify', { method: 'POST', body: JSON.stringify({ cid, credential: credToJSON(cred) }) })
  return res.user
}
// Adds a SECOND passkey to the profile already signed in — a different phone, a laptop, a
// hardware key. Without it, one lost device is a permanently locked account: there is no
// password, and register/* would only ever create a whole new profile with empty history.
export async function passkeyAdd(label) {
  const { cid, options } = await api('/api/credential/options', { method: 'POST', body: '{}' })
  const cred = await navigator.credentials.create({ publicKey: toCreationOptions(options) })
  return api('/api/credential/verify', { method: 'POST', body: JSON.stringify({ cid, credential: credToJSON(cred), label: label || '' }) })
}
export const passkeyList = () => api('/api/credentials')
export const passkeyRemove = id => api('/api/credential/remove', { method: 'POST', body: JSON.stringify({ id }) })

export async function passkeyLogin() {
  const { cid, options } = await api('/api/login/options', { method: 'POST', body: '{}' })
  const cred = await navigator.credentials.get({ publicKey: toRequestOptions(options) })
  const res = await api('/api/login/verify', { method: 'POST', body: JSON.stringify({ cid, credential: credToJSON(cred) }) })
  return res.user
}
