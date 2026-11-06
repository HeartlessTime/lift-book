/* Mint a long-lived device sign-in token for the iOS shell.
   Usage:  node scripts/device-token.js <uid> [label]
           node scripts/device-token.js --list
           node scripts/device-token.js --revoke <id>

   Deliberately a script and not an HTTP route: minting one requires shell access on the server,
   so a token can never be created by anything that merely reaches the API. The plaintext is
   printed once and stored only as a SHA-256 hash — exactly how the weigh-in tokens work. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = process.env.DATA_DIR || path.join(process.cwd(), '..', 'data');
const dbFile = path.join(DATA, 'db.json');
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
db.dtokens = db.dtokens || [];

const save = () => {
  const tmp = dbFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile);
};
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const [cmd, arg] = process.argv.slice(2);

if (cmd === '--list') {
  if (!db.dtokens.length) console.log('no device tokens');
  for (const t of db.dtokens) {
    const who = db.users.find(u => u.id === t.uid);
    console.log(`${t.id}  ${t.label || '(no label)'}  uid=${t.uid} (${who ? who.name : 'MISSING'})  created=${t.created}  lastUsed=${t.lastUsed || 'never'}`);
  }
} else if (cmd === '--revoke') {
  const before = db.dtokens.length;
  db.dtokens = db.dtokens.filter(t => t.id !== arg);
  if (db.dtokens.length === before) { console.error('no token with id ' + arg); process.exit(1); }
  save();
  console.log('revoked ' + arg);
} else if (cmd && !cmd.startsWith('--')) {
  const user = db.users.find(u => u.id === cmd);
  if (!user) {
    console.error('no profile with uid ' + cmd + '. Known profiles:');
    for (const u of db.users) console.error(`  ${u.id}  ${u.name}`);
    process.exit(1);
  }
  const plain = crypto.randomBytes(32).toString('base64url');
  db.dtokens.push({
    id: crypto.randomBytes(4).toString('hex'),
    uid: user.id,
    label: arg || 'device',
    hash: hash(plain),
    created: new Date().toISOString(),
    lastUsed: null
  });
  save();
  console.log(`token for ${user.name}:\n\n${plain}\n\nShown once. Put it in frontend/.env.local (see .env.local.example) as:`);
  console.log(`  VITE_DEVICE_TOKEN=${plain}`);
  console.log(`\nthen rebuild the app:  cd frontend && npm run sync:ios`);
} else {
  console.error('usage: device-token.js <uid> [label] | --list | --revoke <id>');
  process.exit(1);
}
