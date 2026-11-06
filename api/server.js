/* liftbook-api — passkey (WebAuthn) auth + per-user state storage for Lift Book
   No framework, JSON-file storage, signed session cookies.               */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { emptyStore, mergeDays, mergeWorkouts, mergeLiftNames, summarize, history as vitalsHistoryOf, DAY_RE } from './vitals.js';

const PORT = +(process.env.PORT || 3000);
const DATA = process.env.DATA_DIR || '/data';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:8080';
const RP_NAME = process.env.RP_NAME || 'Lift Book';
// Admin dashboard (issue): admins are matched by uid; INVITE_ONLY gates new signups behind a
// code the admin generates. Both default off so a fresh self-hosted instance stays open.
const ADMIN_UIDS = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
const INVITE_ONLY = /^(1|true|yes|on)$/i.test(process.env.INVITE_ONLY || '');
// 90 days keeps someone who trains a few times a week permanently signed in without a stolen
// cookie staying good for a year. Overridable because a family instance and one on the open
// internet don't want the same number. Only affects cookies minted from now on — the expiry is
// baked into each cookie when it's issued, so lowering this never cuts an existing session short.
const SESSION_DAYS = Math.max(1, +(process.env.SESSION_DAYS || 90) || 90);
const MAX_BODY = 5 * 1024 * 1024;
// Secure cookies require HTTPS; over plain http://localhost the flag would drop the cookie
const SECURE = /^https:/i.test(ORIGIN) ? ' Secure;' : '';

fs.mkdirSync(DATA, { recursive: true });

/* ---------- secret + db ---------- */
const secretFile = path.join(DATA, 'secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(secretFile, 'utf8').trim();

const dbFile = path.join(DATA, 'db.json');
let db = { users: [], creds: [], invites: [] };
try { db = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch {}
db.invites = db.invites || [];
const isAdmin = user => !!user && (user.admin === true || ADMIN_UIDS.includes(user.id));
function saveDb() { atomicWrite(dbFile, JSON.stringify(db, null, 2)); }
// Durability matters more than speed here: db.json holds every passkey and there is no second
// copy of it. Without the fsync, a power cut can land the rename before the data reaches the
// platter and leave a zero-length file — the rename is atomic, the *content* was not durable.
// The directory fsync makes the rename itself survive too.
// `mode` (optional) is forced onto the file with fchmod, not just passed to open: open only applies
// a mode when it creates the file, and a .tmp left over from a crash would keep whatever it had.
function atomicWrite(file, content, mode) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w', mode || 0o666);
  try { if (mode) fs.fchmodSync(fd, mode); fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
  try { const dir = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } }
  catch { /* some filesystems refuse a directory fsync; the file itself is already durable */ }
}
const stateFile = uid => path.join(DATA, 'state-' + uid.replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
function readState(uid) {
  try { return JSON.parse(fs.readFileSync(stateFile(uid), 'utf8')); } catch { return null; }
}

/* ---------- time helpers ---------- */
// Computes "now" in an arbitrary IANA zone (e.g. "Europe/Lisbon") instead of the server's own,
// so a weigh-in is dated by the user's own clock wherever they and their phone actually are.
function userNow(tz, at) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(at ? new Date(at) : new Date());
    const g = t => parts.find(p => p.type === t)?.value;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${g('hour')}:${g('minute')}` };
  } catch { return null; } // unknown/invalid tz string — skip rather than guess
}

/* ---------- sessions (signed cookie) ---------- */
function sign(payload) {
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + mac;
}
function verifySig(token) {
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i), mac = token.slice(i + 1);
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  } catch { return null; }
  return payload;
}
// Session payload is `<uid>:<expiry>:<version>`, where the version is the user's `sv` counter.
// Bumping `sv` (POST /api/logout/all) makes every cookie ever handed out for that account stop
// verifying, which is the only revocation there was before short of deleting ./data/secret and
// signing out the whole instance. Cookies minted before `sv` existed have no third field and are
// read as version 0, matching a user who has never bumped — they stay valid until they expire.
const sessionVersion = user => user.sv || 0;
function makeSession(user) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  return sign(user.id + ':' + exp + ':' + sessionVersion(user));
}
// Who is calling. The signed cookie first (every browser); failing that, a device-token bearer
// header (the iOS shell). Unchanged for browsers: a missing or bad cookie with no header still
// resolves to nobody.
function readSession(req) {
  return cookieSession(req) || deviceSession(req);
}
function cookieSession(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => {
    const i = c.indexOf('='); return i < 0 ? ['', ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  }));
  const tok = cookies.gymsid;
  if (!tok) return null;
  const payload = verifySig(tok);
  if (!payload) return null;
  const [uid, exp, ver] = payload.split(':');
  if (!uid || +exp < Date.now()) return null;
  const user = db.users.find(u => u.id === uid) || null;
  if (!user) return null;
  if (user.disabled) return null;           // disabled accounts are locked out everywhere
  // Missing third field = pre-versioning cookie = version 0. Anything non-numeric is a malformed
  // payload (it still had to pass the HMAC, so this is belt-and-braces) and is refused outright.
  const claimed = ver === undefined ? 0 : Number(ver);
  if (!Number.isInteger(claimed) || claimed !== sessionVersion(user)) return null;
  return user;
}
// Second way in, for the iOS shell: `Authorization: Bearer <device token>`. Serving the app's
// assets from the bundle puts the webview on capacitor://localhost, so its requests are
// cross-origin and a session cookie is no longer something to rely on. Same tokens, same
// constant-time match and the same account checks as GET /api/device-login — only the transport
// differs.
function deviceSession(req) {
  const hit = findDeviceToken((req.headers.authorization || '').replace(/^Bearer /i, ''));
  if (!hit) return null;
  const user = db.users.find(u => u.id === hit.uid) || null;
  if (!user) return null;
  if (user.disabled) return null;
  touchDeviceToken(hit);
  return user;
}
// Guard for /api/admin/* — resolves the caller and 401/403s if they aren't an admin.
function requireAdmin(req, res) {
  const user = readSession(req);
  if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
  if (!isAdmin(user)) { json(res, 403, { error: 'forbidden' }); return null; }
  return user;
}
function sessionCookie(user) {
  return `gymsid=${makeSession(user)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly;${SECURE} SameSite=Lax`;
}
const clearCookie = `gymsid=; Path=/; Max-Age=0; HttpOnly;${SECURE} SameSite=Lax`;

/* ---------- challenge store (in-memory, 5 min TTL) ---------- */
const challenges = new Map(); // cid -> {challenge, name?, uid?, exp}
function putChallenge(data) {
  const cid = crypto.randomBytes(16).toString('base64url');
  challenges.set(cid, { ...data, exp: Date.now() + 5 * 60000 });
  return cid;
}
function takeChallenge(cid) {
  const c = challenges.get(cid);
  challenges.delete(cid);
  if (!c || c.exp < Date.now()) return null;
  return c;
}
setInterval(() => { for (const [k, v] of challenges) if (v.exp < Date.now()) challenges.delete(k); }, 60000).unref();

/* ---------- helpers ---------- */
function json(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(extraHeaders || {}) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', d => {
      size += d.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}
const b64uToBuf = s => Buffer.from(s, 'base64url');

/* ---------- live presence (in-memory) ---------- */
// Clients heartbeat /api/activity while a workout is on screen; the admin dashboard reads who's
// live. Purely ephemeral — never persisted. Expires shortly after the last ping.
const presence = new Map();               // uid -> { name, exIdx, exTotal, setsDone, setsTotal, startedAt, updatedAt }
const PRESENCE_TTL = 70000;               // ~3.5× the 20s client heartbeat
function livePresence(uid) {
  const p = presence.get(uid);
  if (!p) return null;
  if (Date.now() - p.updatedAt > PRESENCE_TTL) { presence.delete(uid); return null; }
  return p;
}
setInterval(() => { for (const [k, v] of presence) if (Date.now() - v.updatedAt > PRESENCE_TTL) presence.delete(k); }, 30000).unref();


/* ---------- weight ingest tokens ---------- */
// Lets a scale / phone automation post a body weight without a passkey, which a script can never
// do. Tokens are stored hashed — the plaintext is shown once, at creation, and never again.
//
// A token either names a profile (`uid` set) or is a *household* token (`uid` null), in which case
// the reading is routed by weight: each profile may declare `wRange` [min,max] in lb. Exactly one
// match wins. Zero matches, or two, is an error — a shared scale should never guess which of two
// people just stood on it.
db.wtokens = db.wtokens || [];
db.unrouted = db.unrouted || [];
// Long-lived device tokens. WKWebView will not run WebAuthn, so the iOS shell cannot use a
// passkey — it sends the token as `Authorization: Bearer …` on every request instead (see
// deviceSession). GET /api/device-login, which trades the same token in the query string for a
// session cookie, is kept as the fallback. Hashed at rest like wtokens; the plaintext exists
// only in the app's build config (frontend/.env.local, gitignored). Minted by
// scripts/device-token.js, which needs shell access on the server, so there is no route that
// can create one.
db.dtokens = db.dtokens || [];
const LB_PER_KG = 2.2046226218;
const toLb = (v, unit) => (unit === 'kg' ? v * LB_PER_KG : v);
const fromLb = (v, unit) => (unit === 'kg' ? v / LB_PER_KG : v);
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');

// Match a plaintext device token against db.dtokens, constant-time against every entry so the
// loop leaks nothing about which one (if any) it was. The single place this comparison lives:
// both the cookie route (GET /api/device-login) and the bearer header path call it.
function findDeviceToken(raw) {
  raw = String(raw || '').trim();
  if (!raw) return null;
  const want = Buffer.from(hashToken(raw), 'hex');
  let hit = null;
  for (const t of db.dtokens) {
    const got = Buffer.from(t.hash, 'hex');
    if (got.length === want.length && crypto.timingSafeEqual(got, want)) hit = t;
  }
  return hit;
}
// `lastUsed` is a "when did this device last phone home" field, not an access log. Header auth
// runs it on every single request, so write at most once a minute per token — otherwise every
// poll would rewrite db.json.
const dtokenTouched = new Map();
function touchDeviceToken(t) {
  const now = Date.now();
  if (now - (dtokenTouched.get(t.hash) || 0) < 60000) return;
  dtokenTouched.set(t.hash, now);
  t.lastUsed = new Date(now).toISOString();
  saveDb();
}

function findToken(req) {
  const raw = (req.headers.authorization || '').replace(/^Bearer /i, '').trim();
  if (!raw) return null;
  const want = Buffer.from(hashToken(raw), 'hex');
  // Constant-time compare against every token, mirroring how session cookies are checked.
  for (const t of db.wtokens) {
    const got = Buffer.from(t.hash, 'hex');
    if (got.length === want.length && crypto.timingSafeEqual(got, want)) return t;
  }
  return null;
}

// Range-route a reading in lb to exactly one profile, or explain why it can't.
function routeByWeight(lb) {
  const hits = db.users.filter(u => Array.isArray(u.wRange) && lb >= u.wRange[0] && lb <= u.wRange[1]);
  if (hits.length === 1) return { user: hits[0] };
  if (hits.length === 0) return { error: 'no profile claims ' + lb.toFixed(1) + ' lb' };
  return { error: lb.toFixed(1) + ' lb matches ' + hits.length + ' profiles: ' + hits.map(u => u.name).join(', ') };
}

// Upsert a weigh-in into a profile's state. Read-modify-write against the file on disk, so unlike
// PUT /api/data this can never clobber the rest of the state with a caller's stale copy.
// Returns null when there is no readable state to modify — see below.
function recordWeight(uid, lb, dateStr, tMs) {
  const S = readState(uid);
  // No state file, or one that won't parse. Starting from {} here would write a state containing
  // nothing but this weigh-in and a fresh _ts, the device would pull it as the newer copy, and
  // the profile's whole history would be replaced by an empty one. A missed reading is recoverable;
  // that is not. Refuse and let the caller report it.
  if (!S) return null;
  const unit = S.unit === 'kg' ? 'kg' : 'lb';
  const w = Math.round(fromLb(lb, unit) * 10) / 10;
  const tz = S.weighIn?.tz || S.reminder?.tz || null;
  const d = dateStr || (tz && userNow(tz, tMs)?.date) || new Date(tMs).toISOString().slice(0, 10);
  S.bodyweight = (S.bodyweight || []).filter(b => b.d !== d);
  S.bodyweight.push({ d, w, t: tMs });
  S.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1));
  S._ts = Date.now();
  atomicWrite(stateFile(uid), JSON.stringify(S));
  return { d, w, unit };
}

/* ---------- vitals (Apple Health, sent by the iOS app) ---------- */
// One file per user, 0600 like the trainer thread. The merge rules live in vitals.js.
const vitalsFile = uid => path.join(DATA, 'vitals-' + uid.replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
function readVitals(uid) {
  try { const j = JSON.parse(fs.readFileSync(vitalsFile(uid), 'utf8')); return { ...emptyStore(), ...j }; }
  catch { return emptyStore(); }
}
function saveVitals(uid, store) { atomicWrite(vitalsFile(uid), JSON.stringify(store), 0o600); }
function vitalsSummary(uid) {
  const state = readState(uid);
  const tz = state?.reminder?.tz || state?.weighIn?.tz || 'America/Chicago';
  const today = userNow(tz)?.date || new Date().toISOString().slice(0, 10);
  return summarize(readVitals(uid), state, today);
}

/* ---------- trainer thread ---------- */
// "Tell my trainer": the user reports how a lift went (tags + a note), a trainer service reads the
// pending ones and answers inside the app, sometimes with a routine change he can Apply. One JSON
// array of messages per user in data/trainer-<uid>.json, 0600 like the session secret.
// The trainer side has no session; it authenticates with TRAINER_KEY from the environment. An
// unset key disables the trainer routes outright (401), so a self-hosted instance without a
// trainer exposes nothing.
const TRAINER_KEY = String(process.env.TRAINER_KEY || '').trim();
const TRAINER_TAGS = ['gear', 'setup', 'pain', 'dislike', 'easy', 'hard', 'other'];
const TRAINER_MAX_TEXT = 2000;          // his note
const TRAINER_MAX_REPLY = 4000;         // the trainer's answer
const TRAINER_MAX_THREAD = 1000;        // oldest messages beyond this are dropped
const TRAINER_RATE = { n: 30, ms: 60 * 60000 };   // per user: 30 messages an hour is plenty for a human
const trainerFile = uid => path.join(DATA, 'trainer-' + uid.replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
function readThread(uid) {
  try { const j = JSON.parse(fs.readFileSync(trainerFile(uid), 'utf8')); return Array.isArray(j) ? j : []; }
  catch { return []; }
}
function saveThread(uid, list) {
  atomicWrite(trainerFile(uid), JSON.stringify(list.slice(-TRAINER_MAX_THREAD)), 0o600);
}
const trainerKeyHash = TRAINER_KEY ? crypto.createHash('sha256').update(TRAINER_KEY).digest() : null;
// Constant-time: both sides are hashed first so the compare is always 32 bytes against 32 bytes,
// whatever length the caller sent.
function requireTrainer(req, res) {
  const raw = (req.headers.authorization || '').replace(/^Bearer /i, '').trim();
  if (!trainerKeyHash || !raw) { json(res, 401, { error: 'trainer key required' }); return false; }
  const got = crypto.createHash('sha256').update(raw).digest();
  if (!crypto.timingSafeEqual(got, trainerKeyHash)) { json(res, 401, { error: 'trainer key required' }); return false; }
  return true;
}
const trainerSent = new Map();          // uid -> [ts...] within the rate window, in memory only
function trainerRateOk(uid) {
  const now = Date.now();
  const recent = (trainerSent.get(uid) || []).filter(x => now - x < TRAINER_RATE.ms);
  if (recent.length >= TRAINER_RATE.n) { trainerSent.set(uid, recent); return false; }
  recent.push(now); trainerSent.set(uid, recent);
  return true;
}
const shortStr = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
function cleanContext(c) {
  const out = {};
  if (c && typeof c === 'object') for (const k of ['workoutId', 'exId', 'routineId']) {
    const v = shortStr(c[k], 64); if (v) out[k] = v;
  }
  return out;
}
// The proposal shapes from the contract, re-built field by field so nothing else rides along.
// Returns null for anything that isn't one of them. Routine kinds name a routineId; `today`
// changes only the session in progress, `schedule` only the day plan, `custom` makes a new lift.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOM_ID = /^c[a-z0-9]{2,39}$/;
const CUSTOM_USES = ['cable', 'smith machine', 'body weight'];
const optReps = v => { const n = Number(v); return v != null && Number.isFinite(n) && n >= 1 && n <= 24 ? Math.round(n) : null; };
function cleanProposal(p) {
  if (!p || typeof p !== 'object') return null;
  const routineId = shortStr(p.routineId, 64);
  const reason = shortStr(p.reason, 500) || '';
  if (p.kind === 'today') {
    const exId = shortStr(p.exId, 64), toEx = shortStr(p.toEx, 64);
    if (!exId || !['skip', 'swap', 'add'].includes(p.action) || (p.action === 'swap' && !toEx)) return null;
    const reps = optReps(p.reps);
    return { kind: 'today', action: p.action, exId, ...(p.action === 'swap' ? { toEx } : {}), ...(p.action === 'add' && reps ? { reps } : {}), reason };
  }
  if (p.kind === 'schedule') {
    const date = typeof p.date === 'string' && ISO_DAY.test(p.date) ? p.date : null;
    return date && routineId ? { kind: 'schedule', date, routineId, ...(p.slide === true ? { slide: true } : {}), reason } : null;
  }
  if (p.kind === 'custom') {
    const e = p.ex && typeof p.ex === 'object' ? p.ex : {};
    const id = typeof e.id === 'string' && CUSTOM_ID.test(e.id) ? e.id : null;
    const n = shortStr(e.n, 60), tg = shortStr(e.tg, 40), desc = shortStr(e.desc, 400);
    const uses = CUSTOM_USES.includes(e.uses) ? e.uses : null;
    if (!id || !n || !tg || !desc || !uses) return null;
    const after = shortStr(p.after, 64);
    return { kind: 'custom', ex: { id, n, tg, bp: shortStr(e.bp, 40) || '', desc, uses }, ...(routineId ? { routineId } : {}), ...(routineId && after ? { after } : {}), reason };
  }
  if (!routineId) return null;
  if (p.kind === 'swap') {
    const fromEx = shortStr(p.fromEx, 64), toEx = shortStr(p.toEx, 64);
    return fromEx && toEx && fromEx !== toEx ? { kind: 'swap', routineId, fromEx, toEx, reason } : null;
  }
  if (p.kind === 'edit') {
    const exId = shortStr(p.exId, 64);
    const changes = {};
    for (const k of ['sets', 'reps', 'weight']) {
      const n = Number(p.changes?.[k]);
      if (p.changes?.[k] != null && Number.isFinite(n) && n >= 0 && n <= 2000) changes[k] = n;
    }
    return exId && Object.keys(changes).length ? { kind: 'edit', routineId, exId, changes, reason } : null;
  }
  if (p.kind === 'add') {
    const exId = shortStr(p.exId, 64), after = shortStr(p.after, 64), reps = optReps(p.reps);
    return exId ? { kind: 'add', routineId, exId, ...(after ? { after } : {}), ...(reps ? { reps } : {}), reason } : null;
  }
  if (p.kind === 'remove' || p.kind === 'unsuperset') {
    const exId = shortStr(p.exId, 64);
    return exId ? { kind: p.kind, routineId, exId, reason } : null;
  }
  if (p.kind === 'superset') {
    const exId = shortStr(p.exId, 64), withEx = shortStr(p.withEx, 64);
    return exId && withEx && exId !== withEx ? { kind: 'superset', routineId, exId, withEx, reason } : null;
  }
  if (p.kind === 'reorder') {
    const order = Array.isArray(p.order) ? p.order.map(x => shortStr(x, 64)).filter(Boolean).slice(0, 60) : [];
    return order.length ? { kind: 'reorder', routineId, order, reason } : null;
  }
  return null;
}
// One Apply can carry several changes (at most 5). Any one that isn't valid rejects the lot.
const MAX_PROPOSALS = 5;
function cleanProposals(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_PROPOSALS) return null;
  const out = list.map(cleanProposal);
  return out.every(Boolean) ? out : null;
}
const newMsgId = () => crypto.randomBytes(9).toString('base64url');
// A 'me' message is pending until some trainer message names it in replyTo.
function pendingIn(list) {
  const answered = new Set(list.filter(m => m.from === 'trainer' && m.replyTo).map(m => m.replyTo));
  return list.filter(m => m.from === 'me' && !answered.has(m.id));
}

// Spotify's currently-playing, by refresh token. The access token is kept until a minute before
// it expires; the answer is cached for 10 s so a watch polling every 15 s costs one call each.
const spotify = { token: '', exp: 0, at: 0, last: { playing: false } };
async function nowPlaying() {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: refresh } = process.env;
  if (!id || !secret || !refresh) return { playing: false };
  if (Date.now() - spotify.at < 10_000) return spotify.last;
  try {
    if (Date.now() > spotify.exp - 60_000) {
      const r = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
                   'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
        signal: AbortSignal.timeout(5000)
      });
      const t = await r.json();
      if (!r.ok || !t.access_token) throw new Error('token ' + r.status);
      spotify.token = t.access_token; spotify.exp = Date.now() + (t.expires_in || 3600) * 1000;
    }
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: 'Bearer ' + spotify.token }, signal: AbortSignal.timeout(5000)
    });
    const p = r.status === 200 ? await r.json() : null;
    const item = p && p.item;
    spotify.last = item && p.is_playing
      ? { playing: true, title: item.name || '', artist: (item.artists || []).map(a => a.name).join(', ') || item.show?.name || '' }
      : { playing: false };
    spotify.at = Date.now();
  } catch (e) {
    console.log('now-playing:', e.message);
    spotify.exp = 0;
    return { playing: false };
  }
  return spotify.last;
}

// Routes with a path parameter. The table below is exact-match, so these are tried after it.
const paramRoutes = [
  // Health summary for a user, for an outside dashboard. Same TRAINER_KEY bearer as the trainer side.
  ['GET', /^\/api\/vitals\/summary\/([A-Za-z0-9_-]{1,40})$/, async (req, res, uid) => {
    if (!requireTrainer(req, res)) return;
    if (!db.users.some(u => u.id === uid)) return json(res, 404, { error: 'no such user' });
    json(res, 200, vitalsSummary(uid));
  }],
  // Weigh-ins + e1RM history for the Vitals iOS app's charts. Read-only, same TRAINER_KEY bearer.
  ['GET', /^\/api\/vitals\/history\/([A-Za-z0-9_-]{1,40})$/, async (req, res, uid) => {
    if (!requireTrainer(req, res)) return;
    if (!db.users.some(u => u.id === uid)) return json(res, 404, { error: 'no such user' });
    const state = readState(uid);
    const tz = state?.reminder?.tz || state?.weighIn?.tz || 'America/Chicago';
    const today = userNow(tz)?.date || new Date().toISOString().slice(0, 10);
    json(res, 200, vitalsHistoryOf(state, readVitals(uid).liftNames, today));
  }],
  // The user's whole synced state, so the trainer answers from his real routines and gear.
  ['GET', /^\/api\/trainer\/context\/([A-Za-z0-9_-]{1,40})$/, async (req, res, uid) => {
    if (!requireTrainer(req, res)) return;
    if (!db.users.some(u => u.id === uid)) return json(res, 404, { error: 'no such user' });
    const state = readState(uid);
    if (state) delete state.active;
    json(res, 200, { state });
  }],
  ['POST', /^\/api\/trainer\/messages\/([A-Za-z0-9_-]{1,40})\/proposal$/, async (req, res, id) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    if (!['applied', 'dismissed'].includes(body.state)) return json(res, 400, { error: "state must be 'applied' or 'dismissed'" });
    const list = readThread(user.id);
    const m = list.find(x => x.id === id);
    if (!m || m.from !== 'trainer' || !(m.proposal || m.proposals?.length)) return json(res, 404, { error: 'no such proposal' });
    m.proposalState = body.state;
    m.proposalTs = Date.now();
    saveThread(user.id, list);
    json(res, 200, { message: m });
  }]
];

/* ---------- routes ---------- */
const routes = {

  /* ---------- trainer thread: user side (session or device token) ---------- */
  'GET /api/trainer/messages': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    json(res, 200, { messages: readThread(user.id) });
  },

  'POST /api/trainer/messages': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length > TRAINER_MAX_TEXT) return json(res, 413, { error: `keep it under ${TRAINER_MAX_TEXT} characters` });
    const tags = [...new Set((Array.isArray(body.tags) ? body.tags : []).filter(x => TRAINER_TAGS.includes(x)))];
    if (!text && !tags.length) return json(res, 400, { error: 'say what happened — a tag or a note' });
    if (!trainerRateOk(user.id)) return json(res, 429, { error: 'that is a lot of messages — give your trainer a minute' });
    const msg = { id: newMsgId(), from: 'me', text, tags, context: cleanContext(body.context), ts: Date.now() };
    const list = readThread(user.id);
    list.push(msg);
    saveThread(user.id, list);
    json(res, 200, { message: msg });
  },

  /* ---------- trainer thread: trainer side (TRAINER_KEY) ---------- */
  'GET /api/trainer/pending': async (req, res) => {
    if (!requireTrainer(req, res)) return;
    const items = [];
    for (const u of db.users) {
      if (u.disabled) continue;
      const list = readThread(u.id);
      if (!list.length) continue;
      const thread = list.slice(-20);
      for (const message of pendingIn(list)) items.push({ userId: u.id, message, thread });
    }
    json(res, 200, { items });
  },

  'POST /api/trainer/reply': async (req, res) => {
    if (!requireTrainer(req, res)) return;
    const body = await readBody(req);
    const u = db.users.find(x => x.id === body.userId);
    if (!u) return json(res, 404, { error: 'no such user' });
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return json(res, 400, { error: 'text required' });
    if (text.length > TRAINER_MAX_REPLY) return json(res, 413, { error: `reply over ${TRAINER_MAX_REPLY} characters` });
    const list = readThread(u.id);
    // replyTo null = the trainer speaking first (the Sunday week scan). Its caller is idempotent.
    const orig = body.replyTo == null ? null : list.find(m => m.id === body.replyTo && m.from === 'me');
    if (body.replyTo != null && !orig) return json(res, 404, { error: 'replyTo is not one of this user\'s messages' });
    let proposal = null, proposals = null;
    if (body.proposals != null) {
      proposals = cleanProposals(body.proposals);
      if (!proposals) return json(res, 400, { error: `proposals must be 1-${MAX_PROPOSALS} valid proposals` });
      if (proposals.length === 1) { proposal = proposals[0]; proposals = null; }
    } else if (body.proposal != null) {
      proposal = cleanProposal(body.proposal);
      if (!proposal) return json(res, 400, { error: 'proposal is not a valid proposal shape' });
    }
    // A retried poll must not answer the same message twice.
    const dupe = orig && list.find(m => m.from === 'trainer' && m.replyTo === orig.id);
    if (dupe) return json(res, 409, { error: 'already answered', message: dupe });
    const msg = { id: newMsgId(), from: 'trainer', text, tags: [], context: orig?.context || {}, ts: Date.now(), replyTo: orig ? orig.id : null };
    if (proposal) { msg.proposal = proposal; msg.proposalState = 'open'; }
    else if (proposals) { msg.proposals = proposals; msg.proposalState = 'open'; }
    list.push(msg);
    saveThread(u.id, list);
    json(res, 200, { message: msg });
  },

  // Post a body weight from outside the app (phone automation, scale bridge, curl).
  //   Authorization: Bearer <token>
  //   { "w": 175.4, "unit": "lb"|"kg", "d": "YYYY-MM-DD", "t": <epoch ms>, "dry": true }
  // `d` and `t` are optional and default to now. `dry` routes and reports without writing, which
  // is how you check a household token picks the right person before trusting it.
  'POST /api/weight': async (req, res) => {
    const tok = findToken(req);
    if (!tok) return json(res, 401, { error: 'bad or missing token' });

    const body = await readBody(req);
    // Shortcuts hands a Health sample's value over as text with its unit attached ("175.4 lbs"),
    // and locales vary on the decimal separator, so pull the first number out rather than
    // demanding a bare numeral. A plain number still passes straight through.
    const raw = typeof body.w === 'number'
      ? body.w
      : parseFloat((String(body.w ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/) || [''])[0]);
    if (!Number.isFinite(raw) || raw <= 0) {
      console.log('weight: rejected w =', JSON.stringify(body.w), 'full body:', JSON.stringify(body).slice(0, 300));
      return json(res, 400, { error: 'w must be a positive number', got: String(body.w ?? '').slice(0, 60) });
    }
    const unit = /kg/i.test(String(body.unit ?? '') + String(body.w ?? '')) ? 'kg' : 'lb';
    const lb = toLb(raw, unit);
    // Anything outside this is a bad reading, not a person — a scale reporting 0 or 900 lb means
    // someone leaned on it or the units were wrong. Reject rather than write nonsense into history.
    if (lb < 40 || lb > 700) return json(res, 400, { error: 'reading out of range: ' + lb.toFixed(1) + ' lb' });

    let user;
    if (tok.uid) {
      user = db.users.find(u => u.id === tok.uid);
      if (!user) return json(res, 404, { error: 'token names a profile that no longer exists' });
    } else {
      const r = routeByWeight(lb);
      if (r.error) {
        db.unrouted.unshift({ lb: +lb.toFixed(1), at: Date.now(), why: r.error });
        db.unrouted = db.unrouted.slice(0, 20);
        saveDb();
        return json(res, 409, { error: r.error, hint: 'set wRange on the profiles that share this scale' });
      }
      user = r.user;
    }

    // `t` takes epoch ms or any parseable date string, so a phone automation can hand over a
    // Health sample's own timestamp without first formatting it. The reading is then dated by
    // when it was actually taken — a Shortcut posts the *latest* sample, which may be days old.
    const t = Number.isFinite(Number(body.t)) && Number(body.t) > 0
      ? Number(body.t)
      : (body.t ? Date.parse(body.t) : NaN);
    const when = Number.isFinite(t) ? t : Date.now();
    const d = typeof body.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.d) ? body.d : null;
    if (body.dry) return json(res, 200, { dry: true, routedTo: user.name, lb: +lb.toFixed(1) });

    const saved = recordWeight(user.id, lb, d, when);
    if (!saved) {
      console.log(`weight: no readable state for ${user.name} — reading dropped rather than written over the profile`);
      return json(res, 409, { error: 'no readable state for ' + user.name + ' yet — open the app once so it syncs, then retry' });
    }
    tok.lastUsed = Date.now();
    tok.uses = (tok.uses || 0) + 1;
    saveDb();
    console.log(`weight: ${saved.w} ${saved.unit} -> ${user.name} on ${saved.d} (token ${tok.name})`);
    json(res, 200, { ok: true, routedTo: user.name, ...saved });
  },

  /* ---------- vitals: Apple Health days + workouts (session or device token) ---------- */
  // { days: [{ d, steps, active, ... }], workouts: [{ id, type, start, end, ... }], liftNames: {} }
  // Upsert by day and by workout id, so the app can resend recent days on every open.
  'POST /api/vitals': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req).catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'send a JSON object' });
    if ((body.days && !Array.isArray(body.days)) || (body.workouts && !Array.isArray(body.workouts)))
      return json(res, 400, { error: 'days and workouts must be arrays' });
    if ((body.days || []).length > 800 || (body.workouts || []).length > 2000) return json(res, 413, { error: 'send fewer at a time' });
    const store = readVitals(user.id);
    const days = mergeDays(store, body.days);
    const workouts = mergeWorkouts(store, body.workouts);
    mergeLiftNames(store, body.liftNames);
    if (days || workouts) store.updated = Date.now();   // a names-only post is not a sync
    saveVitals(user.id, store);
    json(res, 200, { ok: true, days, workouts });
  },

  'GET /api/vitals': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const from = new URL(req.url, 'http://x').searchParams.get('from');
    const store = readVitals(user.id);
    const days = DAY_RE.test(from || '') ? Object.fromEntries(Object.entries(store.days).filter(([d]) => d >= from)) : store.days;
    json(res, 200, { days, workouts: Object.values(store.workouts), updated: store.updated || null });
  },

  'GET /api/vitals/summary': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    json(res, 200, vitalsSummary(user.id));
  },

  // The song playing on Spotify, one line for the watch app. Off (always "not playing") unless the
  // SPOTIFY_* refresh-token trio is in .env.
  'GET /api/now-playing': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    json(res, 200, await nowPlaying());
  },

  'GET /api/health': async (req, res) => json(res, 200, { ok: true, users: db.users.length }),

  // Public config the login screen needs before anyone is signed in.
  'GET /api/config': async (req, res) => json(res, 200, { invite_only: INVITE_ONLY }),

  'GET /api/me': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    json(res, 200, { user: { id: user.id, name: user.name, admin: isAdmin(user) } });
  },

  'POST /api/register/options': async (req, res) => {
    const body = await readBody(req);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return json(res, 400, { error: 'name required' });
    const code = String(body.code || '').trim().toUpperCase();
    if (INVITE_ONLY && !db.invites.some(i => i.code === code && !i.usedBy && !i.revoked))
      return json(res, 403, { error: 'a valid invite code is required' });
    const uid = crypto.randomBytes(12).toString('base64url');
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID,
      userID: Buffer.from(uid), userName: name, userDisplayName: name,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials: []
    });
    const cid = putChallenge({ challenge: options.challenge, name, uid, code });
    json(res, 200, { cid, options });
  },

  'POST /api/register/verify': async (req, res) => {
    const body = await readBody(req);
    const c = takeChallenge(body.cid);
    if (!c || !c.uid) return json(res, 400, { error: 'challenge expired — try again' });
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.credential,
        expectedChallenge: c.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false
      });
    } catch (e) { return json(res, 400, { error: 'verification failed: ' + e.message }); }
    if (!verification.verified) return json(res, 400, { error: 'not verified' });
    const { credential } = verification.registrationInfo;
    if (db.creds.find(x => x.id === credential.id)) return json(res, 409, { error: 'credential already registered' });
    // Re-check the invite at the last moment (it may have been used/revoked since options), then burn it.
    let invite = null;
    if (INVITE_ONLY) {
      invite = db.invites.find(i => i.code === c.code && !i.usedBy && !i.revoked);
      if (!invite) return json(res, 403, { error: 'invite code is no longer valid — ask for a new one' });
    }
    const user = { id: c.uid, name: c.name, created: new Date().toISOString() };
    // The first profile on a fresh instance owns it. Without this, a self-hoster has an admin
    // dashboard, live presence and invite codes they can never reach — ADMIN_UIDS has to be set
    // from an env var before the uid it wants even exists.
    if (db.users.length === 0) user.admin = true;
    if (invite) { user.invitedBy = invite.code; invite.usedBy = user.id; invite.usedAt = user.created; }
    db.users.push(user);
    db.creds.push({
      id: credential.id, userId: user.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter || 0,
      transports: body.credential?.response?.transports || []
    });
    saveDb();
    json(res, 200, { user: { id: user.id, name: user.name, admin: isAdmin(user) } }, { 'Set-Cookie': sessionCookie(user) });
  },

  'GET /api/device-login': async (req, res) => {
    const raw = (new URL(req.url, 'http://x').searchParams.get('t') || '').trim();
    if (!raw) return json(res, 400, { error: 'no token' });
    const hit = findDeviceToken(raw);
    if (!hit) return json(res, 401, { error: 'unknown device token' });
    const user = db.users.find(u => u.id === hit.uid);
    if (!user) return json(res, 404, { error: 'device token names a profile that no longer exists' });
    if (user.disabled) return json(res, 403, { error: 'this account has been disabled' });
    hit.lastUsed = new Date().toISOString();
    saveDb();
    // 302 rather than JSON so the app lands on the PWA already signed in; the token never
    // appears in the address the web layer then runs under.
    res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie(user) });
    res.end();
  },

  'POST /api/login/options': async (req, res) => {
    const options = await generateAuthenticationOptions({
      rpID: RP_ID, userVerification: 'preferred', allowCredentials: []
    });
    const cid = putChallenge({ challenge: options.challenge });
    json(res, 200, { cid, options });
  },

  'POST /api/login/verify': async (req, res) => {
    const body = await readBody(req);
    const c = takeChallenge(body.cid);
    if (!c) return json(res, 400, { error: 'challenge expired — try again' });
    const cred = db.creds.find(x => x.id === body.credential?.id);
    if (!cred) return json(res, 404, { error: 'unknown passkey — create a profile first' });
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.credential,
        expectedChallenge: c.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false,
        credential: {
          id: cred.id,
          publicKey: b64uToBuf(cred.publicKey),
          counter: cred.counter,
          transports: cred.transports
        }
      });
    } catch (e) { return json(res, 400, { error: 'verification failed: ' + e.message }); }
    if (!verification.verified) return json(res, 400, { error: 'not verified' });
    cred.counter = verification.authenticationInfo.newCounter;
    saveDb();
    const user = db.users.find(u => u.id === cred.userId);
    if (!user) return json(res, 500, { error: 'user missing' });
    if (user.disabled) return json(res, 403, { error: 'this account has been disabled' });
    json(res, 200, { user: { id: user.id, name: user.name, admin: isAdmin(user) } }, { 'Set-Cookie': sessionCookie(user) });
  },

  /* ---------- extra passkeys for an existing profile ----------
     register/* creates a NEW profile; these attach another credential to the one you are already
     signed in as. Without them a lost phone is a locked-out account with no recovery path. */

  'GET /api/credentials': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const list = db.creds.filter(c => c.userId === user.id).map(c => ({
      id: c.id, added: c.added || null, label: c.label || '', transports: c.transports || []
    }));
    json(res, 200, { credentials: list });
  },

  'POST /api/credential/options': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID,
      userID: Buffer.from(user.id), userName: user.name, userDisplayName: user.name,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      // Stops the phone already enrolled from silently overwriting itself instead of adding one.
      excludeCredentials: db.creds.filter(c => c.userId === user.id)
        .map(c => ({ id: c.id, transports: c.transports || [] }))
    });
    const cid = putChallenge({ challenge: options.challenge, addFor: user.id });
    json(res, 200, { cid, options });
  },

  'POST /api/credential/verify': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    const c = takeChallenge(body.cid);
    // addFor is checked against the live session so a challenge minted for one profile can never
    // attach a key to another.
    if (!c || c.addFor !== user.id) return json(res, 400, { error: 'challenge expired — try again' });
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.credential,
        expectedChallenge: c.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false
      });
    } catch (e) { return json(res, 400, { error: 'verification failed: ' + e.message }); }
    if (!verification.verified) return json(res, 400, { error: 'not verified' });
    const { credential } = verification.registrationInfo;
    if (db.creds.find(x => x.id === credential.id)) return json(res, 409, { error: 'that passkey is already registered' });
    db.creds.push({
      id: credential.id, userId: user.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter || 0,
      transports: body.credential?.response?.transports || [],
      label: String(body.label || '').trim().slice(0, 40),
      added: new Date().toISOString()
    });
    saveDb();
    json(res, 200, { ok: true, count: db.creds.filter(x => x.userId === user.id).length });
  },

  'POST /api/credential/remove': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    const mine = db.creds.filter(c => c.userId === user.id);
    // Removing the last one locks the account out permanently — there is no password to fall back on.
    if (mine.length <= 1) return json(res, 400, { error: 'that is your only passkey — add another first' });
    const i = db.creds.findIndex(c => c.userId === user.id && c.id === body.id);
    if (i < 0) return json(res, 404, { error: 'unknown passkey' });
    db.creds.splice(i, 1);
    saveDb();
    json(res, 200, { ok: true, count: mine.length - 1 });
  },

  'POST /api/logout': async (req, res) => json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie }),

  // "Sign out everywhere" — bumps this user's session version, which invalidates every cookie
  // ever issued for the account, on every device, including a copy someone else walked off with.
  // The caller's own cookie is cleared here too, so the browser doing it doesn't sit on a token
  // it no longer accepts. Passkeys are untouched: signing back in works immediately.
  'POST /api/logout/all': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    user.sv = sessionVersion(user) + 1;
    saveDb();
    json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
  },

  'GET /api/data': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    try {
      const state = JSON.parse(fs.readFileSync(stateFile(user.id), 'utf8'));
      json(res, 200, { state });
    } catch { json(res, 200, { state: null }); }
  },

  // Whole-state sync from a client. Two things write this file now — this route and recordWeight
  // (scale ingest) — so a blind replace can silently erase whatever landed while the phone held an
  // older copy. `baseTs` is the stored _ts the client last read: sending it back makes the write a
  // compare-and-set, which is the only check that survives a client stamping a *fresh* _ts onto
  // stale contents (edit something on the phone after the scale posted, and its _ts is newer while
  // its data is older — the case that actually lost data). A client that doesn't send one is not
  // locked out: it falls back to refusing a push stamped older than the file on disk, which is
  // still better than nothing and keeps old bundles and curl working.
  // Either way a conflict is a 409 carrying the stored _ts — the client pulls, merges and retries.
  'PUT /api/data': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    if (!body.state || typeof body.state !== 'object') return json(res, 400, { error: 'state required' });
    delete body.state.active;              // in-progress workouts stay device-local
    const cur = readState(user.id);
    const curTs = Number(cur && cur._ts) || 0;
    // curTs 0 = nothing on file, or a file we can't read/date — there is no newer copy to protect.
    if (curTs) {
      const base = Number(body.baseTs);
      const inTs = Number(body.state._ts) || 0;
      const stale = Number.isFinite(base) && base > 0 ? base < curTs : (inTs > 0 && inTs < curTs);
      if (stale) return json(res, 409, {
        error: 'stale write — the server has newer data; pull, merge and retry',
        stale: true, ts: curTs
      });
    }
    atomicWrite(stateFile(user.id), JSON.stringify(body.state));
    json(res, 200, { ok: true, ts: body.state._ts || null });
  },

  // Live-workout heartbeat: client pings while a workout is on screen; { active:false } drops it.
  'POST /api/activity': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    if (body.active) {
      presence.set(user.id, {
        name: String(body.name || '').slice(0, 60),
        exIdx: +body.exIdx || 0, exTotal: +body.exTotal || 0,
        setsDone: +body.setsDone || 0, setsTotal: +body.setsTotal || 0,
        startedAt: +body.startedAt || Date.now(),
        updatedAt: Date.now()
      });
    } else presence.delete(user.id);
    json(res, 200, { ok: true });
  },

  /* ---------- admin dashboard ---------- */
  // One row per user, cheap enough for a personal instance (reads each state file once).
  'GET /api/admin/users': async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const users = db.users.map(u => {
      const S = readState(u.id) || {};
      const workouts = S.workouts || [];
      const last = workouts[workouts.length - 1];
      return {
        id: u.id, name: u.name, created: u.created || null,
        disabled: !!u.disabled, admin: isAdmin(u), invitedBy: u.invitedBy || null,
        workouts: workouts.length,
        lastWorkout: last ? last.d : null,
        lastSync: S._ts || null,
        live: livePresence(u.id)
      };
    });
    json(res, 200, { users, invite_only: INVITE_ONLY, now: Date.now() });
  },

  // Drill-down: full workout history + body-weight log for one user.
  'GET /api/admin/user': async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const u = db.users.find(x => x.id === id);
    if (!u) return json(res, 404, { error: 'no such user' });
    const S = readState(u.id) || {};
    json(res, 200, {
      user: { id: u.id, name: u.name, created: u.created || null, disabled: !!u.disabled, admin: isAdmin(u), invitedBy: u.invitedBy || null },
      unit: S.unit || 'kg',
      lastSync: S._ts || null,
      routines: (S.routines || []).map(r => ({ id: r.id, name: r.name, emoji: r.emoji, count: (r.ex || []).length })),
      bodyweight: S.bodyweight || [],
      workouts: (S.workouts || []).slice().reverse()   // newest first for display
    });
  },

  'POST /api/admin/user/disable': async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const u = db.users.find(x => x.id === body.id);
    if (!u) return json(res, 404, { error: 'no such user' });
    if (isAdmin(u)) return json(res, 400, { error: 'cannot disable an admin' });
    u.disabled = !!body.disabled;
    if (u.disabled) presence.delete(u.id);   // drop them off "training now" at once
    saveDb();
    json(res, 200, { ok: true, id: u.id, disabled: u.disabled });
  },

  'GET /api/admin/invites': async (req, res) => {
    if (!requireAdmin(req, res)) return;
    // resolve usedBy uid → name for display
    const invites = db.invites.map(i => ({
      ...i, usedByName: i.usedBy ? (db.users.find(u => u.id === i.usedBy) || {}).name || null : null
    }));
    json(res, 200, { invites, invite_only: INVITE_ONLY });
  },

  'POST /api/admin/invites/new': async (req, res) => {
    const admin = requireAdmin(req, res); if (!admin) return;
    const body = await readBody(req);
    let code;
    // 16 hex chars = 64 bits, up from 8 chars / 32 bits. The app has no rate limiting by design
    // (that's the reverse proxy's job) and /api/register/options tells a caller whether a code is
    // good, so the code itself has to be the thing that isn't worth guessing. Codes already in
    // db.json keep working — validation is an exact string compare, never a length or format check.
    do { code = crypto.randomBytes(8).toString('hex').toUpperCase(); } while (db.invites.some(i => i.code === code));
    const invite = { code, note: String(body.note || '').slice(0, 60), createdBy: admin.id, created: new Date().toISOString() };
    db.invites.push(invite);
    saveDb();
    json(res, 200, { invite });
  },

  'POST /api/admin/invites/revoke': async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const inv = db.invites.find(i => i.code === String(body.code || '').toUpperCase());
    if (!inv) return json(res, 404, { error: 'no such code' });
    if (inv.usedBy) return json(res, 400, { error: 'already used — cannot revoke' });
    db.invites = db.invites.filter(i => i.code !== inv.code);
    saveDb();
    json(res, 200, { ok: true });
  }
};

// The iOS app runs on capacitor://localhost and calls this server cross-origin, so the API has
// to say so out loud or the webview blocks every response. Only that origin and a local dev
// server are allowed — never `*`, and no Allow-Credentials: the app authenticates with the
// bearer header and sends no cookies, so there is nothing for a hostile page to ride on.
const CORS_ORIGINS = new Set(['capacitor://localhost', 'http://localhost']);
function cors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (!origin || !CORS_ORIGINS.has(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const key = req.method + ' ' + url.pathname;
  let handler = routes[key], arg;
  if (!handler) for (const [m, re, h] of paramRoutes) {
    const hit = m === req.method && url.pathname.match(re);
    if (hit) { handler = h; arg = hit[1]; break; }
  }
  if (!handler) return json(res, 404, { error: 'not found' });
  try { await handler(req, res, arg); }
  catch (e) {
    console.error(key, e);
    if (!res.headersSent) json(res, 500, { error: 'server error' });
  }
}).listen(PORT, () => console.log(`gym-api on :${PORT} (rpID=${RP_ID}, origin=${ORIGIN})`));
