/* Health data from Apple Health (via the iOS app) — pure logic, no I/O, so it can be tested.

   Storage is one JSON file per user, data/vitals-<uid>.json:
     { days: { 'YYYY-MM-DD': { steps, active, exercise, rhr, hrv, vo2, walkHr, hrMin, hrMax, hrAvg,
                               hrr, h: [{ h, steps, active, hrMin, hrMax }], t } },
       workouts: { <id>: { id, type, start, end, dur, kcal, dist, src } },
       liftNames: { <exId>: 'Bench Press' }, updated }

   Every write is an upsert by day: a field that arrives replaces that field for that day, a field
   that does not arrive is left alone. So the phone can resend the last few days on every open
   (late-arriving watch samples, a day still in progress) and nothing ever duplicates. The day key
   is the sample's own local date, worked out on the phone — never the server's "today".

   Body weight is NOT stored here. It lives in the profile's state (S.bodyweight), the one place the
   app and the weight charts already read it from. */

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MIN_DAY = '2000-01-01';

// A real calendar day (no 2026-13-45, no Feb 30) no later than `maxDay`. The phone dates samples
// in its own zone, which can be up to a day ahead of UTC, so the default ceiling is UTC tomorrow.
// A far-future day would otherwise become every metric's "latest" reading forever.
export const maxDayFor = (now = Date.now()) => new Date(now + 86400000).toISOString().slice(0, 10);
export function validDay(d, maxDay = maxDayFor()) {
  if (typeof d !== 'string' || !DAY_RE.test(d) || d < MIN_DAY || d > maxDay) return false;
  const t = new Date(d + 'T00:00:00Z');
  return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

// Field -> [min, max]. Anything outside is a bad sample, not a reading, and is dropped.
export const DAY_FIELDS = {
  steps: [0, 200000],
  active: [0, 20000],      // active energy, kcal
  exercise: [0, 1440],     // exercise minutes
  rhr: [20, 200],          // resting heart rate, bpm
  walkHr: [30, 220],       // walking heart rate average, bpm
  hrv: [1, 400],           // HRV (SDNN), ms
  vo2: [5, 100],           // VO2 max, mL/kg/min
  hrMin: [20, 250],
  hrMax: [20, 250],
  hrAvg: [20, 250],
  hrr: [0, 120]            // heart-rate recovery, bpm drop after one minute
};
const HOUR_FIELDS = { steps: [0, 50000], active: [0, 5000], hrMin: [20, 250], hrMax: [20, 250] };

export const MAX_DAYS = 800;       // a bit over two years; the year view needs 365
export const MAX_WORKOUTS = 2000;

const num = (v, [lo, hi]) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : undefined;
};

export function emptyStore() { return { days: {}, workouts: {}, liftNames: {}, updated: 0 }; }

// One incoming day, cleaned. Returns null when it carries nothing usable.
export function cleanDay(raw, maxDay = maxDayFor()) {
  if (!raw || typeof raw !== 'object' || !validDay(raw.d, maxDay)) return null;
  const out = {};
  for (const [k, range] of Object.entries(DAY_FIELDS)) {
    const v = num(raw[k], range);
    if (v !== undefined) out[k] = v;
  }
  if (Array.isArray(raw.h)) {
    const hours = [];
    for (const x of raw.h.slice(0, 24)) {
      if (!x || !Number.isInteger(x.h) || x.h < 0 || x.h > 23) continue;
      const row = { h: x.h };
      for (const [k, range] of Object.entries(HOUR_FIELDS)) {
        const v = num(x[k], range);
        if (v !== undefined) row[k] = v;
      }
      if (Object.keys(row).length > 1) hours.push(row);
    }
    if (hours.length) out.h = hours.sort((a, b) => a.h - b.h);
  }
  return Object.keys(out).length ? { d: raw.d, fields: out } : null;
}

// Upsert a batch of days into the store (mutates and returns it). Returns how many days changed.
export function mergeDays(store, incoming, now = Date.now(), maxDay = maxDayFor()) {
  let n = 0;
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const c = cleanDay(raw, maxDay);
    if (!c) continue;
    const prev = store.days[c.d] || {};
    store.days[c.d] = { ...prev, ...c.fields, t: now };
    n++;
  }
  const keys = Object.keys(store.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DAYS))) delete store.days[k];
  return n;
}

export function cleanWorkout(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 80) : null;
  const start = Date.parse(raw.start), end = Date.parse(raw.end);
  if (!id || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  // Same sanity bounds as a day: nothing before 2000, nothing that has not happened yet (an hour of
  // slack for clock skew), nothing longer than a day.
  if (start < Date.parse(MIN_DAY) || end > now + 3600000 || end - start > 86400000) return null;
  const s = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : undefined);
  const w = {
    id, type: s(raw.type) || 'other', start: new Date(start).toISOString(), end: new Date(end).toISOString(),
    dur: num(raw.dur ?? (end - start) / 1000, [0, 86400]),
    kcal: num(raw.kcal, [0, 20000]), dist: num(raw.dist, [0, 1000000]),
    hrAvg: num(raw.hrAvg, [20, 250]), src: s(raw.src), d: validDay(raw.d, maxDayFor(now)) ? raw.d : undefined
  };
  for (const k of Object.keys(w)) if (w[k] === undefined) delete w[k];
  return w;
}

// Upsert by HealthKit UUID, so a resend replaces rather than duplicates.
export function mergeWorkouts(store, incoming, now = Date.now()) {
  let n = 0;
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const w = cleanWorkout(raw, now);
    if (!w) continue;
    store.workouts[w.id] = w;
    n++;
  }
  const ids = Object.values(store.workouts).sort((a, b) => (a.start < b.start ? -1 : 1)).map(w => w.id);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_WORKOUTS))) delete store.workouts[id];
  return n;
}

export function mergeLiftNames(store, names) {
  if (!names || typeof names !== 'object') return;
  for (const [id, name] of Object.entries(names).slice(0, 50)) {
    if (/^[A-Za-z0-9_-]{1,40}$/.test(id) && typeof name === 'string' && name.trim()) store.liftNames[id] = name.trim().slice(0, 80);
  }
}

/* ---------- summary (for briefs and anything else that wants the short version) ---------- */

const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mean = xs => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// Average of a metric over [from, to] inclusive, from whichever days have it.
function windowAvg(days, key, from, to) {
  const xs = [];
  for (const [d, row] of Object.entries(days)) if (d >= from && d <= to && typeof row[key] === 'number') xs.push(row[key]);
  return { avg: mean(xs), n: xs.length };
}

function latest(days, key) {
  const ds = Object.keys(days).filter(d => typeof days[d][key] === 'number').sort();
  const d = ds[ds.length - 1];
  return d ? { d, v: days[d][key] } : null;
}

const epley = (w, r) => (r === 1 ? w : w * (1 + r / 30));
function e1rmPoints(state, exId) {
  const pts = [];
  for (const w of state?.workouts || []) {
    const e = (w.entries || []).find(x => x.id === exId);
    if (!e) continue;
    let best = 0;
    for (const s of e.sets || []) {
      const wt = Number(s.w), r = Math.round(Number(s.r));
      if (s.done && wt > 0 && r >= 1 && r <= 12) best = Math.max(best, epley(wt, r));
    }
    if (best) pts.push({ d: w.d, v: Math.round(best * 10) / 10 });
  }
  return pts;
}

// Working weight (the owner, 2026-11-03: change in the weight he uses for regular reps, not an
// estimated 1RM). A session's working weight is the weight of most of its completed sets (a tie
// goes to the heavier), with the reps most of those sets got; undone sets, warm-ups and zero-weight
// sets do not count. Mirrors frontend/src/lib/vitals.js workingSet; keep the two in step.
export function workingSet(sets) {
  const ok = (sets || []).filter(s => s && s.done && !s.warm && !s.warmup && Number(s.w) > 0 && Math.round(Number(s.r)) >= 1);
  if (!ok.length) return null;
  const modeOf = xs => {
    const n = new Map();
    for (const x of xs) n.set(x, (n.get(x) || 0) + 1);
    return [...n].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0][0];
  };
  const w = modeOf(ok.map(s => Number(s.w)));
  const r = modeOf(ok.filter(s => Number(s.w) === w).map(s => Math.round(Number(s.r))));
  return { w, r };
}
export function workingPoints(state, exId) {
  const pts = [];
  const ws = [...(state?.workouts || [])].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.start || 0) - (b.start || 0)));
  for (const w of ws) {
    const e = (w.entries || []).find(x => x.id === exId);
    const set = e && workingSet(e.sets);
    if (set) pts.push({ d: w.d, w: set.w, r: set.r });
  }
  return pts;
}
// Latest session vs the latest one on or before 30 days ago (else the first). change null = one
// session so far; since = the date compared with, run back to the start of an unchanged streak.
export function workingChange(pts, today) {
  if (!pts.length) return { change: null, since: null };
  const last = pts[pts.length - 1], monthAgo = addDays(today, -30);
  let i = pts.length - 1;
  while (i >= 0 && pts[i].d > monthAgo) i--;
  if (i < 0) i = 0;
  if (i === pts.length - 1) return { change: null, since: null };
  const change = Math.round((last.w - pts[i].w) * 10) / 10;
  if (change === 0) while (i > 0 && pts[i - 1].w === last.w) i--;
  return { change, since: pts[i].d };
}

// Main lifts = the most-trained weighted lifts in the last 90 days.
function liftSummary(state, names, today) {
  const since = addDays(today, -90), monthAgo = addDays(today, -30);
  const count = {};
  for (const w of state?.workouts || []) {
    if (w.d < since) continue;
    for (const e of w.entries || []) if (workingSet(e.sets)) count[e.id] = (count[e.id] || 0) + 1;
  }
  const custom = Object.fromEntries((state?.customEx || []).map(c => [c.id, c.n]));
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, sessions]) => {
    const pts = e1rmPoints(state, id);
    const last = pts[pts.length - 1] || null;
    const before = [...pts].reverse().find(p => p.d <= monthAgo) || pts[0] || null;
    const wp = workingPoints(state, id), wl = wp[wp.length - 1] || null, wc = workingChange(wp, today);
    return {
      // Working weight (what both apps show since 2026-11-03).
      working: wl, workingChange30: wc.change, workingSince: wc.since,
      // Estimated 1RM: kept for older Vitals builds; nothing current reads it.
      id, name: names[id] || custom[id] || id, sessions,
      e1rm: last ? last.v : null, d: last ? last.d : null,
      change30: last && before && before !== last ? Math.round((last.v - before.v) * 10) / 10 : null
    };
  });
}

export function summarize(store, state, today) {
  const days = store?.days || {};
  const w7 = [addDays(today, -6), today], w30 = [addDays(today, -29), today], prev30 = [addDays(today, -59), addDays(today, -30)];
  const metric = (key, unit) => {
    const a7 = windowAvg(days, key, ...w7), a30 = windowAvg(days, key, ...w30), p30 = windowAvg(days, key, ...prev30);
    return {
      unit, latest: latest(days, key), avg7: a7.avg, avg30: a30.avg, prevAvg30: p30.avg,
      change30: a30.avg != null && p30.avg != null ? Math.round((a30.avg - p30.avg) * 10) / 10 : null
    };
  };
  const bw = (state?.bodyweight || []).filter(b => b && b.d && Number.isFinite(b.w));
  const bwIn = (from, to) => mean(bw.filter(b => b.d >= from && b.d <= to).map(b => b.w));
  const lastBw = bw[bw.length - 1] || null;
  const wk = Object.values(store?.workouts || {}).filter(w => (w.d || w.start.slice(0, 10)) >= w7[0]);
  const gym7 = (state?.workouts || []).filter(w => w.d >= w7[0] && w.d <= today).length;
  return {
    today,
    synced: store?.updated ? new Date(store.updated).toISOString() : null,
    weight: {
      unit: state?.unit === 'kg' ? 'kg' : 'lb',
      latest: lastBw ? { d: lastBw.d, v: lastBw.w } : null,
      avg7: bwIn(...w7), avg30: bwIn(...w30), prevAvg30: bwIn(...prev30)
    },
    restingHr: metric('rhr', 'bpm'),
    walkingHr: metric('walkHr', 'bpm'),
    hrv: metric('hrv', 'ms'),
    vo2max: metric('vo2', 'mL/kg/min'),
    steps: metric('steps', 'steps'),
    activeEnergy: metric('active', 'kcal'),
    exercise: metric('exercise', 'min'),
    workouts7: { health: wk.length, gym: gym7, minutes: Math.round(wk.reduce((a, w) => a + (w.dur || 0), 0) / 60) },
    lifts: liftSummary(state, store?.liftNames || {}, today)
  };
}

/* ---------- history (for the Vitals iOS app's charts) ---------- */
// Weigh-ins and the working weight (plus the old estimated 1RM) over time for the main lifts, so a client can chart them.
// Read-only and derived on the fly; nothing new is stored.
export function history(state, names, today) {
  const bw = (state?.bodyweight || []).filter(b => b && b.d && Number.isFinite(b.w)).map(b => ({ d: b.d, v: b.w }));
  bw.sort((a, b) => (a.d < b.d ? -1 : 1));
  const lifts = liftSummary(state, names || {}, today).map(l => ({ ...l, points: e1rmPoints(state, l.id), workPoints: workingPoints(state, l.id) }));
  return { today, unit: state?.unit === 'kg' ? 'kg' : 'lb', weight: bw, lifts };
}
