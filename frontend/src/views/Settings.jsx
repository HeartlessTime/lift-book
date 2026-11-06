import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, DEF, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { ACCENTS, todayISO, localTZ, fmtDate } from '../lib/format.js'
import { effortOf } from '../lib/history.js'
import { api, webauthnOK, passkeyLogin, passkeyRegister, passkeyAdd, passkeyList, passkeyRemove } from '../lib/api.js'
import { wakeLockSupported } from '../lib/wakelock.js'
import { t, LANGS, INSTR_LANGS } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { NATIVE, shareExport, syncReminder } from '../lib/native.js'
import { loadStarterPlan, confirmSheet, importFromApp } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Section, Row, SelectRow, Switch, Segmented, Button, TextField, Stepper } from '../components/ui.jsx'
import { gearOf, ATTACH_NAME } from '../lib/gear.js'

export default function Settings() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const { update, replaceState, setUser, pullState, pushState, signOut, signOutAll, resetDemo } = useStore()
  const toast = useUI(s => s.toast)
  const fileRef = useRef(null)
  const importRef = useRef(null)
  const wakeOK = wakeLockSupported()

  const doExport = async () => {
    const json = JSON.stringify(S, null, 2)
    const name = 'liftbook-backup-' + todayISO() + '.json'
    // WKWebView can't download blob URLs — the native build hands the file to the share sheet.
    // Three outcomes, three different things to say: shared (confirm it), dismissed (say nothing,
    // the user chose that), failed (say so). The old code treated every rejection as a dismissal,
    // which meant a write that never happened still looked like a backup that did.
    if (NATIVE) {
      try { if (await shareExport(json, name)) toast(t('Backup exported')) }
      catch (e) { toast(t('Export failed: {0}', e.message || t('unknown error'))) }
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
    toast(t('Backup exported'))
  }
  const doImport = ev => {
    const f = ev.target.files[0]; if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result)
        if (!data.workouts || !data.routines) throw new Error('not a Lift Book backup')
        confirmSheet({ title: t('Import backup?'), message: t('This replaces all current data with the backup file.'), confirmText: t('Import'), danger: true, onConfirm: () => { replaceState(Object.assign(JSON.parse(JSON.stringify(DEF)), data), true); toast(t('Backup imported')) } })
      } catch (e) { toast(t('Import failed: {0}', e.message)) }
    }
    rd.readAsText(f)
  }
  const signInHere = async () => {
    try { const u = await passkeyLogin(); setUser(u); await pullState(); toast(t('Welcome back, {0}', u.name)) }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(e.message || t('Sign-in failed')) }
  }
  const registerHere = () => useUI.getState().openSheet(close => <RegisterInline close={close} setUser={setUser} pushState={pushState} pullState={pullState} toast={toast} />)
  // Both sign-out rows are browser-only (see the account section). In the native app they would
  // be a trap door: it authenticates with a device token compiled into the build, so "sign out"
  // cannot revoke this device's access — /api/logout only clears a cookie the app never sends,
  // and /api/logout/all bumps the session version, which invalidates cookies and leaves device
  // tokens working. What they DO reach is clearLocalSession(), which wipes the local copy and
  // drops the app on the Login screen, where the only way back in is a passkey WKWebView will
  // not run. The way out is force-quitting the app so boot() re-authenticates with the token —
  // a control whose recovery step is "kill the app" does not belong on the screen. Revoking a
  // phone is a server-side act anyway: delete its token from db.dtokens.
  //
  // Ends the profile's sessions on every device — this one included, so on success it lands in
  // the same place as the plain sign-out above (home, local data cleared). On failure nothing
  // local is touched: still signed in here, and say so rather than leaving a half-signed-out app.
  const signOutEverywhere = () => confirmSheet({
    title: t('Sign out everywhere?'),
    message: t('Signs this profile out on every device, including this one. Your passkeys keep working — sign in with them again anytime.'),
    confirmText: t('Sign out everywhere'), danger: true,
    onConfirm: async () => {
      try { await signOutAll(); nav('/home'); toast(t('Signed out on all devices')) }
      catch (e) { toast(t('Could not sign out everywhere — you are still signed in.')) }
    },
  })

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Settings')}</h1></div>
    </div>

    {/* ---------- account ----------
        The native app is a real signed-in client, not a standalone island: it authenticates with
        the device token baked into its build and syncs to the same profile the browser does. What
        it cannot do is passkeys — WKWebView refuses WebAuthn (see webauthnOK) — so every control
        that only leads somewhere through a passkey is left out of this build rather than offered
        and failed. Only the demo build genuinely has nothing to sign in to. */}
    <Section title={DEMO ? t('Demo') : t('Account')}
      footer={NATIVE && user ? t('The app signs itself in with a key built into it, so there is nothing to sign out of here. Manage this device from the server that issued the key.') : undefined}>
      {DEMO ? <>
        <Row icon="play" title={t('You’re in the demo')} subtitle={t('Example data, stored only in this browser — change anything you like.')} />
        <Row icon="reset" iconTint="var(--blue)" title={t('Reset demo data')} accessory="chevron"
          onClick={() => confirmSheet({ title: t('Reset demo data?'), message: t('Puts the example plan, workouts and weigh-ins back the way they started.'), confirmText: t('Reset'), onConfirm: () => { resetDemo(); nav('/home'); toast(t('Demo data reset')) } })} />
        <Row icon="rocket" iconTint="var(--indigo)" title={t('Self-host Lift Book')} subtitle={t('Passkey sign-in, sync across your devices, your own data.')} accessory="chevron"
          onClick={() => window.open(REPO, '_blank', 'noopener')} />
      </> : user ? <>
        <Row icon="personCircle" iconTint="var(--grey)" title={user.name}
          subtitle={NATIVE ? t('Signed in on this device — data syncs to this profile.') : t('Signed in with passkey — data syncs to this profile.')} />
        {user.admin && <Row icon="wrench" iconTint="var(--indigo)" title={t('Admin dashboard')} accessory="chevron" onClick={() => nav('/admin')} />}
        {/* Passkeys and sign-out are browser-only, and deliberately so — see the note above the
            sign-out handlers for why a sign-out button in the app is a trap door, not a feature. */}
        {!NATIVE && <>
          <PasskeyRow toast={toast} />
          <Row icon="signOut" iconTint="var(--red)" title={t('Sign out')} danger onClick={() => confirmSheet({ title: t('Sign out?'), message: t('Your data is synced to your profile first, then cleared from this device.'), confirmText: t('Sign out'), danger: true, onConfirm: () => { signOut(); nav('/home') } })} />
          <Row icon="shield" iconTint="var(--red)" title={t('Sign out everywhere')} subtitle={t('Ends this profile’s sessions on all your devices.')} danger onClick={signOutEverywhere} />
        </>}
      </> : NATIVE ? (
        // Only reachable in guest mode after the server refused the device token (see boot()).
        // Nothing here can fix that — the token lives in the build — so say what is true and
        // where the data is, instead of offering a sign-in that cannot run.
        <Row icon="globe" iconTint="var(--orange)" title={t('Not signed in')}
          subtitle={t('The server didn’t accept this app’s key. Your workouts are safe on this device and will sync once it does — export a backup if you want a copy in the meantime.')} />
      ) : webauthnOK() ? <>
        <Row icon="key" title={t('Create passkey profile')} subtitle={t('Keeps your data safe and separate per person.')} accessory="chevron" onClick={registerHere} />
        <Row icon="person" iconTint="var(--blue)" title={t('Sign in with passkey')} accessory="chevron" onClick={signInHere} />
      </> : (
        <Row icon="lock" iconTint="var(--grey)" title={t('Passkeys not supported in this browser.')} />
      )}
    </Section>
    {!user && !DEMO && !NATIVE && <p className="sect-f" style={{ marginTop: -18, marginBottom: 22 }}>{t('Guest mode — data lives only in this browser.')}</p>}

    {/* ---------- general ---------- */}
    <Section title={t('General')} footer={t('Note: switching units only changes the label — logged numbers are not converted.')}>
      <SelectRow
        icon="globe" iconTint="var(--blue)" title={t('Language')}
        value={S.lang || 'en'} onChange={v => update(s => { s.lang = v })}
        options={Object.entries(LANGS).map(([k, name]) => ({
          value: k, label: name,
          subtitle: INSTR_LANGS.includes(k) ? null : t("Exercise instructions aren't available in this language yet — they stay in English."),
        }))}
      />
      <Row icon="scale" iconTint="var(--teal)" title={t('Weight unit')}>
        <Segmented className="seg-inline"
          options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
          value={S.unit} onChange={v => update(s => { s.unit = v })} />
      </Row>
    </Section>

    {/* ---------- during a workout ---------- */}
    <Section title={t('During a workout')} footer={wakeOK ? t('The screen stays on while a workout is running, so you don’t have to unlock your phone between sets.') : null}>
      <SelectRow icon="timer" iconTint="var(--orange)" title={t('Rest timer')}
        value={S.restSec} onChange={v => update(s => { s.restSec = v })}
        options={[60, 90, 120, 150, 180].map(v => ({ value: v, label: v + 's' }))} />
      {(wakeOK || !NATIVE) && (
        <Row icon="sun" iconTint="var(--yellow)" title={t('Keep screen awake')}
          subtitle={wakeOK ? null : t('Not supported in this browser.')}>
          <Switch checked={wakeOK && S.keepAwake !== false} disabled={!wakeOK}
            onChange={v => update(s => { s.keepAwake = v })} />
        </Row>
      )}
      <Row icon="bell" iconTint="var(--pink)" title={t('Sounds')}>
        <Switch checked={!!S.sound} onChange={v => update(s => { s.sound = v })} />
      </Row>
      {/* Two names for the same judgement, so the column asks in the scale you already think in.
          The (i) sits before the control — you read it on the way to the choice, not after it. */}
      <Row icon="target" iconTint="var(--purple)" title={t('Effort per set')}>
        <button className="helpbtn" aria-label={t('What are RIR and RPE?')} onClick={effortHelpSheet}><Icon name="info" /></button>
        <Segmented className="seg-inline"
          options={[{ value: 'none', label: t('Off') }, { value: 'rir', label: t('RIR') }, { value: 'rpe', label: t('RPE') }]}
          value={effortOf(S)} onChange={v => update(s => { s.effort = v; delete s.showRir })} />
      </Row>
    </Section>

    {/* ---------- gear: what the planner may load (lib/gear.js) ---------- */}
    <GearSection S={S} update={update} />

    {/* No `user` check: the reminder is a local notification the OS fires, so it keeps working
        when the server is unreachable and the app is running as a guest — the one case where
        `user` is null on the phone. */}
    {NATIVE && <NativeReminderCard S={S} update={update} toast={toast} />}

    {/* ---------- appearance ---------- */}
    <Section title={t('Appearance')} footer={DEMO || NATIVE ? undefined : t('synced with your profile')}>
      <Row icon="moon" iconTint="var(--indigo)" title={t('Theme')}>
        <Segmented
          className="seg-inline"
          options={[{ value: 'dark', icon: 'moon', label: t('Dark') }, { value: 'light', icon: 'sun', label: t('Light') }]}
          value={S.theme === 'light' ? 'light' : 'dark'}
          onChange={v => update(s => { s.theme = v })}
        />
      </Row>
      {/* Purely how the muscle map is drawn — nothing else in the app reads this. */}
      <Row icon="figureStrength" iconTint="var(--teal)" title={t('Body diagram')}>
        <Segmented
          className="seg-inline"
          options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]}
          value={S.body === 'female' ? 'female' : 'male'}
          onChange={v => update(s => { s.body = v })}
        />
      </Row>
      <div className="lrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, paddingTop: 13, paddingBottom: 14 }}>
        <span className="lrow-t">{t('Accent color')}</span>
        <div className="swatches">
          {Object.entries(ACCENTS).map(([k, c]) => (
            <button key={k} className={'swatch' + ((S.accent || 'lime') === k ? ' on' : '')}
              style={{ background: c }} onClick={() => update(s => { s.accent = k })} aria-label={k} />
          ))}
        </div>
      </div>
    </Section>

    {/* ---------- data: fill it, bring things over, back it up, wipe it ---------- */}
    <Section title={t('Data')}>
      <Row icon="clipboard" title={t('Load starter plan (PPL)')} accessory="chevron" onClick={loadStarterPlan} />
      <Row icon="shuffle" iconTint="var(--teal)" title={t('Import from another app')}
        subtitle={t('FitNotes, Strong, Hevy — or body weight from Apple Health')}
        accessory="chevron" onClick={() => importRef.current.click()} />
      <Row icon="upload" iconTint="var(--blue)" title={t('Import backup')} accessory="chevron" onClick={() => fileRef.current.click()} />
      <Row icon="download" iconTint="var(--blue)" title={t('Export backup (JSON)')} accessory="chevron" onClick={doExport} />
      <Row icon="trash" iconTint="var(--red)" title={t('Reset everything')} danger onClick={() => confirmSheet({ title: t('Reset everything?'), message: t('Deletes your plan, workouts and body weight on this device. This cannot be undone.'), confirmText: t('Delete everything'), danger: true, onConfirm: () => { replaceState(JSON.parse(JSON.stringify(DEF)), true); nav('/home'); toast(t('All data reset')) } })} />
    </Section>
    <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={doImport} />
    {/* Reset after reading so picking the same file twice still fires onChange. */}
    <input ref={importRef} type="file" accept=".csv,.xml,text/csv,text/xml" style={{ display: 'none' }}
      onChange={ev => { const f = ev.target.files[0]; if (f) importFromApp(f); ev.target.value = '' }} />

    <div className="dim small" style={{ textAlign: 'center', marginTop: 4, lineHeight: 1.6 }}>
      Lift Book · based on openGym by Duarte Santos · {t('free & open source (AGPL v3)')}<br />
      <a href="https://github.com/HeartlessTime/lift-book" target="_blank" rel="noopener">source code</a> · exercise data: hasaneyldrm/exercises-dataset (CC)
    </div>
  </div>
}

// The whole point is that the two scales are one judgement counted from opposite ends, and a
// paragraph is a bad way to say that — the conversion table shows it in one look. Reading down
// a column is the answer to "what do I put here", so the numbers get their own aligned columns.
const EFFORT_ROWS = [
  ['0', '10', 'Nothing left — went to failure'],
  ['1', '9', 'One more rep in the tank'],
  ['2', '8', 'Two more reps'],
  ['3', '7', 'Three more reps'],
  ['4+', '≤6', 'Easy — warm-up territory'],
]
// RIR 2 / RPE 8: the row a working set usually lands on — the anchor the others are read
// against. Not where the stepper starts; + walks up from the bottom of the scale.
const EFFORT_TYPICAL = 2

function effortHelpSheet() {
  useUI.getState().openSheet(close => <>
    <h3>{t('Effort per set')}</h3>
    <div className="muted small" style={{ lineHeight: 1.5 }}>
      {t('How hard a set was, logged next to weight and reps. Two scales for the same judgement, counted from opposite ends.')}
    </div>
    <div className="efftbl">
      <div className="r hd"><span className="n">{t('RIR')}</span><span className="n">{t('RPE')}</span><span className="f">{t('How it felt')}</span></div>
      {EFFORT_ROWS.map(([rir, rpe, feel], i) => (
        <div key={rir} className={'r' + (i === EFFORT_TYPICAL ? ' on' : '')}>
          <span className="n">{rir}</span><span className="n">{rpe}</span><span className="f">{t(feel)}</span>
        </div>
      ))}
    </div>
    <div className="dim small" style={{ lineHeight: 1.5, display: 'grid', gap: 8 }}>
      <div>{t('RIR counts the reps you left; RPE reads the same effort off a 10-point scale — so RPE ≈ 10 − RIR. Pick the one you already think in.')}</div>
      <div>{t('The highlighted row is where most working sets land. Sets you have already logged keep their own scale, and nothing else reads the value — progression and estimated 1RM are unaffected.')}</div>
    </div>
    <div style={{ height: 8 }} />
  </>)
}

// Native app: the reminder is a local notification the OS schedules on the device, on the
// weekdays that have a routine planned. It doesn't go through the push server — which is why it
// still fires with the server asleep or the phone off Wi-Fi, and why the reminder time is the
// only setting here (there is no subscription to turn on, and no "test push" to send). The
// reminder itself lives in the synced state, so changing it here changes it on the profile; only
// the OS-level schedule is per-device. That schedule is (re)synced by the store on every persist,
// so this card owns just one thing the store can't: the permission prompt, which must be asked
// for by a tap rather than by a background resync.
function NativeReminderCard({ S, update, toast }) {
  const setReminder = patch => update(s => { s.reminder = { ...(s.reminder || DEF.reminder), ...patch, tz: localTZ() } })
  const setWeighIn = patch => update(s => { s.weighIn = { ...(s.weighIn || DEF.weighIn), ...patch, tz: localTZ() } })
  // Both toggles share one OS permission, so both ask the same way: try the schedule first with
  // the switch already flipped on, and only commit it if the schedule actually took.
  const toggleWeighIn = async () => {
    const on = !S.weighIn?.on
    if (on) {
      const ok = await syncReminder({ ...S, weighIn: { ...(S.weighIn || DEF.weighIn), on: true } }, true)
      if (!ok) { toast(t('Allow notifications for Lift Book in your device settings first')); return }
    }
    setWeighIn({ on })
  }
  const toggle = async () => {
    const on = !S.reminder?.on
    if (on) {
      const ok = await syncReminder({ ...S, reminder: { ...(S.reminder || DEF.reminder), on: true } }, true)
      // The one way this fails in practice is a refused (or previously refused) OS permission,
      // and iOS only ever asks once — so point at the place the user can actually change it
      // instead of reporting a failure they can do nothing about from here.
      if (!ok) { toast(t('Allow notifications for Lift Book in your device settings first')); return }
    }
    setReminder({ on })
  }
  return (
    <Section title={t('Notifications')}
      footer={S.reminder?.on
        ? t('Your phone reminds you at this time on days that have a routine planned. Works offline — nothing is sent from the server.')
        : null}>
      <Row icon="calendar" iconTint="var(--orange)" title={t('Workout day reminder')}>
        <Switch checked={!!S.reminder?.on} onChange={toggle} />
      </Row>
      {S.reminder?.on && (
        <Row icon="clock" iconTint="var(--purple)" title={t('Reminder time')}>
          <input type="time" className="timef" value={S.reminder?.time || DEF.reminder.time}
            onChange={e => setReminder({ time: e.target.value })} />
        </Row>
      )}
      <Row icon="scale" iconTint="var(--teal)" title={t('Weigh-in reminder')}
        subtitle={t('Skipped on days you have already logged a weight.')}>
        <Switch checked={!!S.weighIn?.on} onChange={toggleWeighIn} />
      </Row>
      {S.weighIn?.on && (
        <Row icon="clock" iconTint="var(--purple)" title={t('Weigh-in time')}>
          <input type="time" className="timef" value={S.weighIn?.time || DEF.weighIn.time}
            onChange={e => setWeighIn({ time: e.target.value })} />
        </Row>
      )}
    </Section>
  )
}

// The same registration as the sign-in screen's, reached from Settings instead. It asks for
// the invite code on the same terms: an invite-only instance rejects a registration without
// one, so a form that cannot collect it is a form that cannot succeed.

/* ---------- extra passkeys ----------
   One passkey and no way to add a second means a lost phone is a lost account — there is no
   password to fall back on and no reset email. The row states the count plainly, because the
   difference between one and two is the whole point of it. */
function PasskeySheet({ toast, close }) {
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const load = () => passkeyList().then(r => setList(r.credentials)).catch(() => setList([]))
  useEffect(() => { load() }, [])
  const add = async () => {
    setBusy(true)
    try { await passkeyAdd(label.trim()); setLabel(''); await load(); toast(t('Passkey added')) }
    catch (e) {
      // A cancelled Face ID prompt is not an error worth shouting about.
      if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(e.message || t('Could not add that passkey'))
    }
    setBusy(false)
  }
  const remove = id => confirmSheet({
    title: t('Remove this passkey?'), message: t('The device it lives on will no longer be able to sign in.'),
    confirmText: t('Remove'), danger: true,
    onConfirm: async () => { try { await passkeyRemove(id); await load(); toast(t('Passkey removed')) } catch (e) { toast(e.message || t('Could not remove it')) } },
  })
  return <>
    <h3>{t('Your passkeys')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t('Add one on a second device — a laptop, a spare phone, a security key. With only one, losing that device locks you out for good.')}
    </div>
    {list === null ? <div className="muted small">{t('Loading…')}</div> : <>
      <div className="list" style={{ marginBottom: 14 }}>
        {list.map(c => <div key={c.id} className="item">
          <span className="lrow-i"><Icon name="lock" /></span>
          <div className="grow">
            <div className="tt">{c.label || t('Passkey')}</div>
            <div className="ss">{c.added ? fmtDate(c.added.slice(0, 10)) : t('added before this was tracked')}</div>
          </div>
          {list.length > 1 && <button className="iconbtn" aria-label={t('Remove')} onClick={() => remove(c.id)}><Icon name="trash" /></button>}
        </div>)}
      </div>
      {list.length < 2 && <div className="progline warn" style={{ marginBottom: 12 }}>
        <Icon name="shield" /><span>{t('Only one passkey. Add another before you need it.')}</span>
      </div>}
    </>}
    <TextField value={label} maxLength={40} onChange={e => setLabel(e.target.value)} placeholder={t('Name it (optional) — e.g. laptop, spare phone')} />
    <div style={{ height: 10 }} />
    <Button variant="primary" icon="plus" disabled={busy} onClick={add}>{t('Add a passkey on this device')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" onClick={close}>{t('Done')}</Button>
  </>
}
function PasskeyRow({ toast }) {
  const [n, setN] = useState(null)
  useEffect(() => { passkeyList().then(r => setN(r.credentials.length)).catch(() => setN(null)) }, [])
  return <Row icon="lock" iconTint={n === 1 ? 'var(--orange)' : 'var(--acc)'} title={t('Passkeys')} accessory="chevron"
    subtitle={n === null ? t('Sign in on more than one device.') : n === 1 ? t('Only one — a lost phone locks you out.') : t('{0} devices can sign in.', n)}
    onClick={() => useUI.getState().openSheet(close => <PasskeySheet toast={toast} close={close} />)} />
}

function RegisterInline({ close, setUser, pushState, pullState, toast }) {
  const nameRef = useRef(null)
  const [code, setCode] = useState('')
  const [inviteOnly, setInviteOnly] = useState(false)
  useEffect(() => { api('/api/config').then(c => setInviteOnly(!!c.invite_only)).catch(() => {}) }, [])
  const go = async () => {
    const n = (nameRef.current.value || '').trim()
    if (!n) { toast(t('Enter a name')); return }
    if (inviteOnly && !code.trim()) { toast(t('An invite code is required')); return }
    try {
      const u = await passkeyRegister(n, code.trim()); setUser(u); close()
      if (hasData(useStore.getState().S)) { await pushState(); toast(t('Profile created — data moved into it')) }
      else { await pullState(); toast(t('Welcome, {0}', u.name)) }
    } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(e.message || t('Registration failed')) }
  }
  return <>
    <h3>{t('Create your profile')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Pick a name, then confirm with your device.')}</div>
    <TextField ref={nameRef} placeholder={t('Your name')} maxLength={40} />
    {inviteOnly && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={t('Invite code')} maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
      <div className="dim small" style={{ marginTop: 6 }}>{t('This app is invite-only — enter the code you were given.')}</div>
    </>}
    <div style={{ height: 12 }} /><Button variant="primary" onClick={go}>{t('Create passkey')}</Button>
  </>
}

// The plates in the gym and what hangs on the rack. The planner builds every routine from this:
// plates are one shared pile across the Smith, the barbell and both cable horns.
function GearSection({ S, update }) {
  const g = gearOf(S)
  const sizes = Object.keys(g.plates).map(Number).sort((a, b) => b - a)
  const total = sizes.reduce((sum, p) => sum + p * (g.plates[p] || 0), 0)
  const setCount = (p, v) => update(s => {
    const cur = gearOf(s)
    s.gear = { ...(s.gear || cur), plates: { ...cur.plates, [p]: Math.max(0, Math.round(v)) } }
  })
  return <Section title={t('Gear')} footer={t('One pile of plates shared by the Smith, the barbell and both cable horns. The planner only programs what this gear can do.')}>
    <div className="lrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, paddingTop: 13, paddingBottom: 14 }}>
      <div className="row between"><span className="lrow-t">{t('Plates')}</span><span className="lrow-v">{total} {S.unit === 'kg' ? 'kg' : 'lb'}</span></div>
      {sizes.map(p => <Stepper key={p} label={p + ' ' + (S.unit === 'kg' ? 'kg' : 'lb')} value={g.plates[p] || 0} step={1} decimal={false} onChange={v => setCount(p, v)} />)}
    </div>
    <Row icon="plate" iconTint="var(--teal)" title={t('Bars')} value={t('Smith {0} · barbell {1}', g.smithBar, g.barbell)} />
    <Row icon="machine" iconTint="var(--blue)" title={t('Cable attachments')} subtitle={(g.attachments || []).map(a => ATTACH_NAME[a] || a).join(', ')} />
    <Row icon="wrench" iconTint="var(--orange)" title={t('Bench')} value={(g.bench || []).join(' · ')} />
  </Section>
}
