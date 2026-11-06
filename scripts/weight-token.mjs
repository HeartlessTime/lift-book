#!/usr/bin/env node
/* weight-token — manage tokens and weight ranges for POST /api/weight.
 *
 * The API keeps db.json in memory and rewrites it on every save, so it will happily overwrite
 * anything this script does. ALWAYS `docker compose restart api` afterwards — the script says so
 * on every run that changes something.
 *
 *   node scripts/weight-token.mjs users
 *   node scripts/weight-token.mjs new "my phone" --user Me
 *   node scripts/weight-token.mjs new "household scale"          # no --user = route by weight
 *   node scripts/weight-token.mjs range Me 160 260
 *   node scripts/weight-token.mjs list
 *   node scripts/weight-token.mjs revoke <id>
 *   node scripts/weight-token.mjs unrouted
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const dbFile = path.join(DATA, 'db.json');
if (!fs.existsSync(dbFile)) { console.error('no db.json at ' + dbFile + ' — run from the repo root, or set DATA_DIR'); process.exit(1); }

const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
db.wtokens = db.wtokens || [];
db.unrouted = db.unrouted || [];

const save = () => {
  fs.writeFileSync(dbFile + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(dbFile + '.tmp', dbFile);
  console.log('\n⚠  Now run:  docker compose restart api');
  console.log('   The running API holds db.json in memory and will overwrite this if you don\'t.');
};
const findUser = q => db.users.find(u => u.id === q || (u.name || '').toLowerCase() === String(q).toLowerCase());

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'users') {
  if (!db.users.length) console.log('no profiles yet');
  else for (const u of db.users) console.log(`${u.id}  ${u.name}  range=${u.wRange ? u.wRange.join('-') + ' lb' : '(none)'}`);

} else if (cmd === 'new') {
  const name = rest.find(a => !a.startsWith('--'));
  if (!name) { console.error('usage: new "<label>" [--user <name|uid>]'); process.exit(1); }
  const ui = rest.indexOf('--user');
  let uid = null;
  if (ui !== -1) {
    const u = findUser(rest[ui + 1]);
    if (!u) { console.error('no such profile: ' + rest[ui + 1]); process.exit(1); }
    uid = u.id;
  }
  const token = crypto.randomBytes(24).toString('base64url');
  db.wtokens.push({
    id: crypto.randomBytes(4).toString('hex'), name, uid,
    hash: crypto.createHash('sha256').update(token).digest('hex'),
    created: Date.now(), uses: 0
  });
  console.log('\nToken (shown once — copy it now):\n\n  ' + token + '\n');
  console.log(uid ? '  → writes to ' + findUser(uid).name : '  → household token: routed by weight range');
  save();

} else if (cmd === 'range') {
  const [who, min, max] = rest;
  const u = findUser(who);
  if (!u) { console.error('no such profile: ' + who); process.exit(1); }
  if (!(+min > 0) || !(+max > +min)) { console.error('usage: range <name> <minLb> <maxLb>'); process.exit(1); }
  // Overlapping ranges make a household token ambiguous, which the API refuses to guess at.
  const clash = db.users.find(o => o.id !== u.id && Array.isArray(o.wRange) && +min <= o.wRange[1] && +max >= o.wRange[0]);
  if (clash) console.log(`⚠  overlaps ${clash.name} (${clash.wRange.join('-')} lb) — readings in the overlap will be rejected, not guessed`);
  u.wRange = [+min, +max];
  console.log(`${u.name}: ${min}-${max} lb`);
  save();

} else if (cmd === 'list') {
  if (!db.wtokens.length) console.log('no tokens');
  else for (const t of db.wtokens) {
    const who = t.uid ? (findUser(t.uid) || {}).name || '(deleted profile)' : 'auto-route';
    console.log(`${t.id}  ${t.name}  → ${who}  uses=${t.uses || 0}  last=${t.lastUsed ? new Date(t.lastUsed).toISOString().slice(0, 16) : 'never'}`);
  }

} else if (cmd === 'revoke') {
  const before = db.wtokens.length;
  db.wtokens = db.wtokens.filter(t => t.id !== rest[0]);
  if (db.wtokens.length === before) { console.error('no token with id ' + rest[0]); process.exit(1); }
  console.log('revoked ' + rest[0]);
  save();

} else if (cmd === 'unrouted') {
  if (!db.unrouted.length) console.log('nothing unrouted');
  else for (const u of db.unrouted) console.log(`${new Date(u.at).toISOString().slice(0, 16)}  ${u.lb} lb — ${u.why}`);

} else {
  console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0].split('\n').slice(1).map(l => l.replace(/^ \* ?/, '')).join('\n'));
}
