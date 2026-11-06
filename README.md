# Lift Book

**A gym and body-weight tracker you own.** Plan your week, run guided workouts, log every set,
and watch your progress, on your iPhone and Apple Watch. There are no accounts, subscriptions,
ads or tracking.

You can run it two ways:

- **On your phone only.** Everything stays on the phone, with no server. See
  **[docs/PHONE_ONLY.md](docs/PHONE_ONLY.md)**.
- **With your own server.** Sync across your phone and laptop, with passkey sign-in. See
  [Self-hosting](#self-hosting) below.

## Features

**Training**
- **Weekly plan:** a routine for each weekday, picked from **1,324 exercises** with animated demos. Move any day's workout when life gets in the way.
- **Guided workouts:** today's session opens with last time's weights filled in, a rest timer and PR detection. The screen stays awake while you train.
- **Progression rules:** linear, Greyskull LP, double progression, or adding time. Each routine picks one, and every target says why it's that number.
- **Supersets, timed sets, cardio, bodyweight and per-side reps,** all logged the way they're actually done.
- **Effort per set** (optional), as RIR or RPE.

**On the iPhone and Apple Watch**
- **Lock-screen rest timer:** a Live Activity counts the rest down on the lock screen and in the Dynamic Island, with a Set-done button.
- **Smart Stack card:** shows the current workout on the lock screen.
- **Apple Watch app:** starting a workout on the phone starts it on the watch. The watch shows the set, weight × reps, rest timer and heart rate. Finishing saves it to Apple Health as a strength workout.
- **Apple Health:** a Health page with weight, heart rate, HRV, VO2 max, steps and workouts. Weigh-ins you log by hand are written back to Health.
- **Local notifications:** rest timer alerts and a workout-day reminder, scheduled on the phone itself.

**Progress**
- **Body weight:** a chart with your goal line.
- **Lifts:** estimated 1RM and working weight for each lift.
- **History:** a year-long activity heatmap.
- **Muscle map:** shows what you've trained, and what you haven't, over a week, a month or all time.

**Your data**
- **Backups:** one-tap JSON export and import.
- **Bring your history:** import from FitNotes, Strong, Hevy or an Apple Health export.
- **Share a plan:** send it as a small file or print it as a PDF.
- **12 languages,** light and dark themes, and no telemetry.

## The iPhone app

You build it yourself in Xcode and install it on your own phone. There is no App Store listing.
You need:

- a Mac with Xcode
- a paid Apple developer account, for the watch app, the widget and Apple Health
- your own Team and bundle IDs in `frontend/ios/App/App.xcodeproj`. The project ships with
  `com.example.liftbook` placeholders.

Walkthrough: **[docs/MOBILE.md](docs/MOBILE.md)**. For the no-server version, start with
**[docs/PHONE_ONLY.md](docs/PHONE_ONLY.md)**.

## Self-hosting

You need [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
git clone https://github.com/HeartlessTime/lift-book
cd lift-book
cp .env.example .env
docker compose up -d --build
```

Open **http://localhost:8080** and create a profile. The first launch downloads the exercise
media (about 140 MB) once. To reach it from your phone with passkeys, you need an HTTPS address
(two lines in `.env`). See **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

Your data lives in `./data` on the server. **Back up `./data` and you've backed up everything.**

## How it's built

- **frontend/:** React and Vite. It's wrapped for iOS with Capacitor, and the watch app and widget are written in Swift.
- **api/:** Node with no framework. It stores everything as plain JSON files in `./data`.
- **web/:** nginx, which serves the app and passes `/api` to the backend.

## Credits and license

Lift Book is a fork of **openGym** by Duarte Santos, whose original repository is no longer
online. Its history up to the fork is in [CHANGELOG.md](CHANGELOG.md).

Licensed under the **GNU AGPL v3.0** (see [LICENSE](LICENSE)). If you share a modified copy, or
run one for other people, you must make your source code available too. The third-party credits,
including the exercise data and the body-map drawings, are in [NOTICE.md](NOTICE.md).
