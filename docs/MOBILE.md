# Building the iPhone app

Lift Book has a native iOS app: a Capacitor 7 shell around WKWebView, carrying the built web app
inside the binary and talking to your own server over the network for sync. It is not a browser
pointed at your instance — it ships its own copy of the app, and what it fetches from the server
is your data.

It is not on the App Store and there are no plans to put it there. You build it in Xcode and
install it on your own iPhone.

What it adds over the same app in a browser:

- **Local notifications** for the rest timer and the workout-day reminder, scheduled on the
  phone. Nothing goes through the server.
- **A Live Activity** showing the rest countdown on the lock screen and in the Dynamic Island,
  with the next set and a Set-done button on it.
- **Haptics** on the parts of the workout flow you're not looking at the screen for.
- **Backups through the OS share sheet** (Files, AirDrop, mail…) — WKWebView can't do blob-URL
  downloads, so the export goes out to a temp file and then to the share sheet.
- **A durable copy of your state on the phone.** WKWebView localStorage is evicted under storage
  pressure, so the state is mirrored into a JSON file in the app's private data directory and
  restored from there on launch.
- **Sign-in without a passkey.** WKWebView won't run WebAuthn, so the app carries a long-lived
  device token instead (see below). Passkeys are still how you sign in from a browser.

## Prerequisites

- A Mac with **Xcode 15+** and **CocoaPods** (`brew install cocoapods`).
- **Node 20+** for the web build.
- An Apple ID. A free one is enough to run the app on your own iPhone; paid membership only
  matters for App Store distribution, which Lift Book doesn't do.

## Mint a device token first

The app can't use a passkey, so it authenticates with a **device token**: 32 random bytes minted
on your server and sent as `Authorization: Bearer …` on every request. The server keeps only a
SHA-256 hash of it and matches in constant time, exactly like the weigh-in tokens.

Minting one is deliberately a script and not an HTTP route — it needs shell access on the box, so
nothing that merely reaches the API can create one:

```sh
cd api
node scripts/device-token.js --list              # what exists, and when each was last used
node scripts/device-token.js <uid> "my iPhone"   # mint one
node scripts/device-token.js --revoke <id>       # kill one
```

`<uid>` is a profile id from `data/db.json` (`users[].id`). Pass the wrong one and the script
prints the profiles it knows about, so you don't have to go reading JSON.

The plaintext is printed **once**; after that only the hash exists. Lose it and you mint a new
one. Tokens don't expire — revoke by id when a phone goes away. `POST /api/logout/all` is not a
substitute: it ends the sessions, and the token simply mints another.

Treat the token as a password. Anyone holding it is that profile, from anywhere.

## Build & run

Configuration for the native build is build-time env, copied from the example and filled in:

```sh
cd frontend
npm install
cp .env.local.example .env.local    # then edit it — see below
npm run sync:ios
npx cap open ios                    # Xcode → set your signing team, then run onto your iPhone
```

Two values in `.env.local` matter:

- `VITE_API_BASE` — your server, as the phone sees it, no trailing slash. The app serves its own
  bundle from `capacitor://localhost`, so a relative `/api/...` would go nowhere; this is
  prefixed onto every request. It must be `https` — WKWebView refuses cleartext.
- `VITE_DEVICE_TOKEN` — the plaintext from the step above.

Both are baked into the bundle at build time, so re-run `npm run sync:ios` after changing either.
`.env.local` is gitignored and must stay that way — the token is in it. A browser build leaves
both unset and stays same-origin, so nothing about self-hosting changes.

Exercise images and animations resolve against `VITE_API_BASE` (`<server>/img/`, `<server>/gif/`)
unless you set `VITE_IMG_BASE` / `VITE_GIF_BASE` to pull them off a CDN instead — the example file
has the jsDelivr URLs commented out.

`npm run sync:ios` is the whole loop: `vite build`, then `cap sync ios`, then
`scripts/register-native-plugins.mjs`. Run it after every web-code change before building in Xcode.

> **Don't run a bare `cap sync`.** Capacitor builds `packageClassList` in
> `ios/App/App/capacitor.config.json` from installed npm packages, so `LiveActivityPlugin` —
> which lives in the app target, not in a package — is silently left out, and the lock-screen
> timer stops appearing with no error anywhere. `register-native-plugins.mjs` puts it back, which
> is why it's chained onto the sync.

## App icons & splash screens

`frontend/resources/icon.svg` is the 1024×1024 source (the app's dumbbell glyph on the app
background). Generate the platform assets from it on a machine with the tooling:

```sh
cd frontend
npx @capacitor/assets generate --iconBackgroundColor '#0c0e12' --splashBackgroundColor '#0c0e12'
```

(If the generator won't take the SVG directly, export it to `resources/icon.png` at 1024×1024
first — any image tool can do it.)

## Getting it onto the phone, and keeping it there

Apple doesn't allow installing apps outside the App Store, so there's no `.ipa` download that
would simply install. Building it yourself is the route:

- **Xcode free signing:** open `ios/` in Xcode with a free Apple ID as the team and run it onto
  your own iPhone. Apple expires that signature after 7 days; re-run from Xcode to renew.
- **A paid developer account** stretches the signature to a year, if you'd rather not think
  about it weekly.
- **AltStore** automates the 7-day re-signing over Wi-Fi via a Mac companion app.

## Notes for maintainers

- Keep the marketing version and build number in Xcode in step with `frontend/package.json`.
- **License:** Lift Book is AGPL-3.0, which by itself sits badly with app-store terms of service.
  `NOTICE.md` carries an app-store exception (an additional permission under AGPL §7) granted by
  the copyright holder — relevant only if store distribution ever happens.
- The app asks for notification permission only when the workout-day reminder is switched on,
  never on launch.
- The Live Activity is handed the moment the rest *ends* and iOS renders the countdown itself, so
  a three-minute rest costs one call in and one call out rather than 180 updates. Taps on the
  Set-done button land in native state while the webview is suspended and are drained on the next
  foreground — see `frontend/src/lib/liveActivity.js` and `frontend/src/lib/nativeSets.js`.
