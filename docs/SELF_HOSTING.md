# Self-hosting Lift Book

Lift Book is two small containers (a web server and an API) plus a folder of your data.
This guide takes you from "just cloned it" to "using it from my phone over the internet".

## 1. Run it locally (5 minutes)

Requirements: [Docker](https://docs.docker.com/get-docker/) with the Compose plugin.

```bash
git clone https://github.com/HeartlessTime/lift-book
cd lift-book
cp .env.example .env
docker compose up -d --build
```

- First start downloads the exercise images/GIFs (~140 MB) once into `app/img` and `app/gif`.
- Open **http://localhost:8080** and create a profile with a passkey.
- Rather build from source than pull prebuilt images? Skip `docker compose pull` and run
  `docker compose up -d --build` instead — no Node needed locally either way.

Check it's healthy:

```bash
docker compose ps
curl http://localhost:8080/api/health      # {"ok":true,...}
```

Logs: `docker compose logs -f`. Stop: `docker compose down`.

## 2. Understand the passkey requirement (important)

Lift Book signs you in with **passkeys** (WebAuthn). Browsers enforce two rules:

1. Passkeys are bound to an exact **hostname** (`RP_ID`).
2. They only work over **HTTPS** — with one exception: `http://localhost`.

So `http://localhost:8080` works on the machine running Docker, but **another device (your
phone) cannot use `http://<your-LAN-ip>:8080`** — that's neither localhost nor HTTPS, so the
passkey prompt won't appear. To use Lift Book from your phone you need a real HTTPS hostname.

(You can still open it over LAN in **guest mode**, which stores data only in that browser.)

## 3. Expose it over HTTPS on your own domain

Put Lift Book behind something that terminates TLS for a hostname you control, then point it at
the `web` container. Pick whichever you already run:

### Option A — Cloudflare Tunnel (no open ports)

1. Create a tunnel and route `gym.example.com` → `http://<docker-host>:8080`.
2. Cloudflare gives you HTTPS automatically.

### Option B — Caddy (automatic Let's Encrypt)

```caddy
gym.example.com {
    reverse_proxy localhost:8080
}
```

### Option C — Traefik / nginx / Nginx Proxy Manager

Route `gym.example.com` (HTTPS) → `web:80` (or `<docker-host>:8080`). Any reverse proxy works —
Lift Book only needs the browser to reach it over `https://gym.example.com`.

Then set your domain in `.env` and restart:

```bash
# .env
RP_ID=gym.example.com
ORIGIN=https://gym.example.com
WEB_PORT=8080
RP_NAME=Lift Book
```

```bash
docker compose up -d --build
```

Visit `https://gym.example.com` and create your profile. That hostname is also what the iPhone
app syncs against — see **[MOBILE.md](MOBILE.md)**.

> Changing `RP_ID` later invalidates existing passkeys (they were bound to the old hostname).
> Pick your domain before people register.

## 4. Multiple users

Anyone who can reach the URL can create their own profile — each gets isolated data. That's the
default: open signup, no admin.

If you'd rather control who gets in, two optional settings in `.env` turn that around:

```bash
ADMIN_UIDS=youruserid      # comma-separated; these users get the admin dashboard
INVITE_ONLY=1              # new profiles need an invite code
```

Register your own passkey profile first, then find your id in `./data/db.json` under `users[].id`
and put it in `ADMIN_UIDS`. You'll get an **Admin dashboard** link in Settings: who's training
right now, each user's workout history and body weight, the ability to disable an account (signed
out and locked out everywhere until you re-enable it), and — with `INVITE_ONLY=1` — generating and
revoking invite codes. Existing accounts keep working when you switch invite-only on. Admin access
is gated by your passkey and enforced server-side, so it needs no separate login.

Prefer to keep the whole thing off the open internet? A VPN or an auth proxy (Authelia, Cloudflare
Access…) in front still works, and composes with the above.

## 5. Backups

Everything is in `./data`:

```bash
tar czf liftbook-backup-$(date +%F).tar.gz data/
```

That archive contains all profiles, passkeys and workout history. Restore by unpacking it back
into the project folder. (Individual users can also export their own data as JSON from Settings.)

## 6. Notifications

Both alerts — rest-timer-over, and a reminder on days you have a workout planned but haven't
logged one yet — come from the **iPhone app**, as iOS local notifications scheduled on the phone
itself (**[MOBILE.md](MOBILE.md)**). Turn the reminder on in **Settings → Notifications** in the
app.

There is nothing to configure on the server: it sends no notifications, holds no keys, and the
reminder fires at the phone's own local time regardless of what timezone the server runs in. A
browser tab gets no notifications — that's the trade for the app not needing anything from you
here.

**Keep screen awake** (Settings → *During a workout*) has the same transport requirement: the
Wake Lock API is only available over HTTPS or on `http://localhost`, so on a plain-LAN-IP
instance the switch shows as unsupported. Nothing to configure server-side either way, and iOS
refuses the lock while the phone is in Low Power Mode.

## 7. Updating

Running prebuilt images:

```bash
git pull                    # picks up compose/config changes
docker compose pull
docker compose up -d --build
```

Building from source instead:

```bash
git pull
docker compose up -d --build
```

Browsers pick up the new build on their next load; the iPhone app needs a rebuild from Xcode
(**[MOBILE.md](MOBILE.md)**). Your `./data` and the downloaded media are untouched.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No passkey prompt on my phone | You're on `http://` or an IP, not HTTPS. Set up a domain (section 3). |
| "verification failed" on login | `RP_ID`/`ORIGIN` don't match the URL in the address bar. Make them exact, restart. |
| Media didn't download | `docker compose logs media`. Re-run `docker compose up -d`, or run `./scripts/fetch-media.sh`. |
| Port 8080 already used | Set `WEB_PORT=9090` in `.env` (and update `ORIGIN` for local testing). |
| No "Notifications" option in Settings | Notifications are an iPhone-app feature (section 6); a browser doesn't have them. |
| Day reminder never fires | Check iOS Settings → Notifications → Lift Book. The app only asks for permission when you switch the reminder on, so a refusal there is silent afterwards. |
| Want to reset a stuck login | Delete the cookie in your browser; sessions are just signed cookies. |
| `docker compose pull` fails with "denied" / "unauthorized" | The prebuilt images aren't published yet, or need to be, or the GHCR package is still private — build from source instead (`docker compose up -d --build`). |
