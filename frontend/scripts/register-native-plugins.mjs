/* Re-adds this app's OWN Capacitor plugins to the generated iOS config.

   Capacitor 7 does not discover plugins by scanning the Objective-C runtime. `registerPlugins()`
   in CapacitorBridge.swift reads `capacitor.config.json` out of the app bundle and registers
   exactly the classes named in `packageClassList`, resolved by NSClassFromString.

   `cap sync` builds that list from installed npm plugin *packages*, so a plugin living in the app
   target is silently left out — no warning, no error. The symptom is
   `Capacitor.isPluginAvailable('X') === false` and a plugin list in the JS console that is missing
   your class. Setting packageClassList in the source capacitor.config.json does not help: sync
   overwrites it.

   So this runs after every sync. Keep it chained to `cap sync` in package.json. */
import fs from 'node:fs'

// Swift classes in the App target that conform to CAPBridgedPlugin.
const APP_PLUGINS = ['LiveActivityPlugin', 'KeepAwakePlugin', 'WatchWorkoutPlugin']

const target = 'ios/App/App/capacitor.config.json'
const cfg = JSON.parse(fs.readFileSync(target, 'utf8'))
const before = cfg.packageClassList || []
const added = APP_PLUGINS.filter(p => !before.includes(p))

cfg.packageClassList = [...before, ...added]
fs.writeFileSync(target, JSON.stringify(cfg, null, '\t') + '\n')

console.log(added.length
  ? `registered app plugins: ${added.join(', ')}`
  : 'app plugins already registered')
