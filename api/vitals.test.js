// node --test — no dependencies. Covers the upsert-by-day rules the iOS sync relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, mergeDays, mergeWorkouts, summarize, cleanDay } from './vitals.js';

test('resending a day replaces its fields instead of duplicating', () => {
  const s = emptyStore();
  mergeDays(s, [{ d: '2026-11-01', steps: 4000, rhr: 60 }], 1);
  mergeDays(s, [{ d: '2026-11-01', steps: 9000 }], 2);
  assert.deepEqual(Object.keys(s.days), ['2026-11-01']);
  assert.equal(s.days['2026-11-01'].steps, 9000);   // newer value wins
  assert.equal(s.days['2026-11-01'].rhr, 60);       // field not resent is kept
  assert.equal(s.days['2026-11-01'].t, 2);
});

test('the same payload twice leaves the store identical', () => {
  const a = emptyStore(), b = emptyStore();
  const batch = [{ d: '2026-10-30', steps: 1, hrv: 40 }, { d: '2026-10-31', vo2: 41.2 }];
  mergeDays(a, batch, 5);
  mergeDays(b, batch, 5); mergeDays(b, batch, 5);
  assert.deepEqual(a, b);
});

test('bad days and out-of-range values are dropped', () => {
  assert.equal(cleanDay({ d: 'yesterday', steps: 10 }), null);
  assert.equal(cleanDay({ d: '2026-11-01', rhr: 5 }), null);          // 5 bpm is not a person
  assert.deepEqual(cleanDay({ d: '2026-11-01', rhr: '58', steps: -3 }).fields, { rhr: 58 });
});

test('workouts upsert by id', () => {
  const s = emptyStore();
  const w = { id: 'A', type: 'walking', start: '2026-11-01T14:00:00Z', end: '2026-11-01T14:30:00Z', kcal: 100 };
  mergeWorkouts(s, [w]); mergeWorkouts(s, [{ ...w, kcal: 120 }]);
  assert.equal(Object.keys(s.workouts).length, 1);
  assert.equal(s.workouts.A.kcal, 120);
  assert.equal(s.workouts.A.dur, 1800);
});

test('summary averages windows and reads weight from state', () => {
  const s = emptyStore();
  mergeDays(s, [{ d: '2026-11-03', rhr: 56 }, { d: '2026-11-01', rhr: 60 }, { d: '2026-09-20', rhr: 64 }]);
  const state = { unit: 'lb', bodyweight: [{ d: '2026-11-02', w: 175 }], workouts: [] };
  const out = summarize(s, state, '2026-11-03');
  assert.equal(out.restingHr.avg7, 58);
  assert.equal(out.restingHr.prevAvg30, 64);
  assert.equal(out.restingHr.change30, -6);
  assert.deepEqual(out.weight.latest, { d: '2026-11-02', v: 175 });
});

test('history returns weigh-ins and e1RM points for the main lifts', async () => {
  const { history } = await import('./vitals.js');
  const state = { unit: 'lb', bodyweight: [{ d: '2026-11-02', w: 175 }, { d: '2026-10-01', w: 172 }],
    workouts: [{ d: '2026-11-01', entries: [{ id: 'bench', sets: [{ done: true, w: 185, r: 5 }] }] }] };
  const out = history(state, { bench: 'Bench Press' }, '2026-11-03');
  assert.deepEqual(out.weight.map(p => p.d), ['2026-10-01', '2026-11-02']);
  assert.equal(out.lifts[0].name, 'Bench Press');
  assert.equal(out.lifts[0].points[0].v, 215.8);
});

// Backend audit 2026-11-03: impossible and future dates used to be stored, and a far-future day
// became every metric's "latest" reading for good.
test('only real calendar days up to tomorrow (UTC) are stored', () => {
  const now = Date.parse('2026-11-03T23:30:00Z');          // 5:30 pm in Chicago
  const max = '2026-11-04';
  for (const d of ['2026-13-45', '2026-02-30', '2026-11-00', '1999-12-31', '2026-11-05', '2099-01-01'])
    assert.equal(cleanDay({ d, steps: 10 }, max), null, d);
  // The phone's own local "today" can be UTC tomorrow (or the other way round): both stand.
  for (const d of ['2026-11-03', '2026-11-04', '2024-02-29'])
    assert.ok(cleanDay({ d, steps: 10 }, max), d);
  const s = emptyStore();
  assert.equal(mergeDays(s, [{ d: '2099-01-01', rhr: 50 }, { d: '2026-11-03', rhr: 60 }], now, max), 1);
  assert.equal(summarize(s, null, '2026-11-03').restingHr.latest.d, '2026-11-03');
});

test('workouts from the future, before 2000 or over a day long are dropped', () => {
  const now = Date.parse('2026-11-03T18:00:00Z');
  const s = emptyStore();
  const n = mergeWorkouts(s, [
    { id: 'future', start: '2026-11-04T10:00:00Z', end: '2026-11-04T11:00:00Z' },
    { id: 'old', start: '1990-01-01T10:00:00Z', end: '1990-01-01T11:00:00Z' },
    { id: 'long', start: '2026-10-01T10:00:00Z', end: '2026-10-03T11:00:00Z' },
    { id: 'ok', start: '2026-11-03T00:30:00Z', end: '2026-11-03T01:30:00Z', d: '2026-11-02' }  // 7:30 pm CT
  ], now);
  assert.equal(n, 1);
  assert.deepEqual(Object.keys(s.workouts), ['ok']);
  assert.equal(s.workouts.ok.d, '2026-11-02');            // the phone's local day, not the UTC date
});

// the owner 2026-11-03: working weight replaces the estimated 1RM in both apps.
test('working weight: mode of completed sets, a tie to the heavier, undone and zero-weight sets ignored', async () => {
  const { workingSet } = await import('./vitals.js');
  const set = (w, r, done = true) => ({ w, r, done });
  assert.deepEqual(workingSet([set(10, 15), set(12.5, 12), set(12.5, 12)]), { w: 12.5, r: 12 });
  assert.deepEqual(workingSet([set(185, 8), set(205, 6)]), { w: 205, r: 6 });
  assert.deepEqual(workingSet([set(225, 5, false), set(225, 5, false), set(185, 8)]), { w: 185, r: 8 });
  assert.deepEqual(workingSet([{ w: 95, r: 10, done: true, warmup: true }, set(135, 8)]), { w: 135, r: 8 });
  assert.equal(workingSet([set(0, 20), set(0, 20)]), null);
});

test('working weight change is against the latest session on or before 30 days ago', async () => {
  const { history, summarize } = await import('./vitals.js');
  const s = (w, r = 8) => ({ done: true, w, r });
  const wk = (d, w) => ({ d, entries: [{ id: 'bench', sets: [s(w), s(w), s(w)] }, { id: 'pushup', sets: [s(0, 20)] }] });
  const state = { unit: 'lb', workouts: [wk('2026-09-20', 175), wk('2026-10-01', 180), wk('2026-10-10', 185), wk('2026-11-01', 190)] };
  const out = history(state, { bench: 'Bench Press' }, '2026-11-03');
  assert.deepEqual(out.lifts.map(l => l.id), ['bench']);          // the bodyweight lift is left off
  const l = out.lifts[0];
  assert.deepEqual(l.working, { d: '2026-11-01', w: 190, r: 8 });
  assert.equal(l.workingChange30, 10);
  assert.equal(l.workingSince, '2026-10-01');
  assert.equal(l.workPoints.length, 4);
  assert.equal(summarize({}, state, '2026-11-03').lifts[0].workingChange30, 10);
  // A short history falls back to the first session; a single session has no change yet.
  assert.equal(history({ workouts: state.workouts.slice(2) }, {}, '2026-11-03').lifts[0].workingSince, '2026-10-10');
  assert.equal(history({ workouts: state.workouts.slice(3) }, {}, '2026-11-03').lifts[0].workingChange30, null);
});

test('an unchanged working weight reads since the start of the run (his cable lateral raise)', async () => {
  const { history } = await import('./vitals.js');
  const wk = (d, ws) => ({ d, entries: [{ id: '0178', sets: ws.map(w => ({ done: true, w, r: 12 })) }] });
  const state = { workouts: [wk('2026-08-24', [10, 12.5, 12.5]), wk('2026-08-31', [17.5, 17.5, 17.5]), wk('2026-09-10', [15, 15, 15]),
    wk('2026-09-21', [15, 15, 15]), wk('2026-10-05', [15, 15, 15]), wk('2026-10-29', [15, 15, 15])] };
  const l = history(state, {}, '2026-11-03').lifts[0];
  assert.deepEqual([l.working.w, l.working.r, l.workingChange30, l.workingSince], [15, 12, 0, '2026-09-10']);
});
