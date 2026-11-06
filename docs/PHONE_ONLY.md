# Running Lift Book on the phone only (no server)

This copy is set up for a self-hosted server, but most of the app already works without one.
This note explains how to build it as a phone-only app where every workout, plan and weigh-in
lives on the phone. **None of this has been built or tested yet. It is the plan.**

## What already works without a server

- **"Continue without account"** on the sign-in screen (`frontend/src/views/Login.jsx`) starts
  guest mode. Guest mode keeps the whole profile in the browser's `localStorage`
  (`frontend/src/store/useStore.js`).
- In the iOS app, the same state is also mirrored to a file in the app's own data folder
  (`nativeSave` / `nativeLoad` in `frontend/src/lib/native.js`). That file survives the
  web view clearing its storage.
- The weekly plan, guided workouts, timers, progression, 1RM, history, charts, muscle map,
  CSV/backup export and import, the lock-screen rest timer and the workout reminder are all
  on-device features.
- There is also a demo build (`VITE_DEMO=1`, `frontend/src/lib/demo.js`) that runs with no
  API at all. It is the closest existing example of a serverless build.

## What needs the server, and goes away

| Feature | Server route | Phone-only plan |
|---|---|---|
| Passkey sign-in, profiles, admin | `/api/register`, `/api/login`, `/api/admin/*`, `/api/me` | Drop it. One person per phone, always guest mode. |
| Sync across devices | `/api/data` | Drop it. Use the backup export/import to move data. |
| Health dashboard history (Stats → Health) | `/api/vitals` | Read HealthKit directly on the phone instead of storing it on the server (see `frontend/src/lib/healthSync.js`). |
| "Tell my trainer" thread | `/api/trainer/*` | Drop it, or hide the tab. |
| "Now training" activity ping | `/api/activity` | Drop it. Calls already fail quietly. |
| Invite-only flag | `/api/config` | Drop it. The call already fails quietly. |
| Exercise pictures and animations | served from `<server>/img/`, `<server>/gif/` | Set `VITE_IMG_BASE` / `VITE_GIF_BASE` to the CDN in `frontend/.env.local.example`, or copy the media into `frontend/public/` so it ships inside the app and works offline. |

## Steps to make it phone-only

1. **Start in guest mode.** Make the native build call `setGuest(true)` on first launch and
   skip the sign-in screen, the same way the demo build does in `Login.jsx`.
2. **Build with no API.** Leave `VITE_API_BASE` and `VITE_DEVICE_TOKEN` empty in
   `frontend/.env.local`. Add a flag (for example `VITE_LOCAL_ONLY=1`) that hides
   sign-in, sync, admin, the trainer thread and the activity ping, following how `DEMO`
   hides them now.
3. **Handle the exercise media** as in the table above.
4. **Health dashboard.** Either hide it, or change `Health.jsx` to read from HealthKit on
   the phone instead of `GET /api/vitals`.
5. **Back up the data.** With no server, the phone holds the only copy. Remind users to
   export a backup now and then, and/or add iCloud backup of the app's data file.
6. **Sign it as your own app.** In Xcode, set your Team in `frontend/ios/App/App.xcodeproj`
   and change the `com.example.liftbook` bundle IDs and the `group.com.example.liftbook`
   App Group to your own. You need a Mac with Xcode, and a paid Apple developer account for
   the watch app, widget and HealthKit. Then run `npm run sync:ios` in `frontend/`.

## Not needed for phone-only

`api/`, `docker-compose.yml`, `Dockerfile`, `web/` and `docs/SELF_HOSTING.md`
are only for the server.
