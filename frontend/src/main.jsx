import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { watchNativeSets } from './lib/nativeSets.js'
import { watchWorkouts } from './lib/watchWorkout.js'
import { bindPress } from './lib/press.js'
import './index.css'
// Motion loads after the design system so it always has the last word, and it is split by
// area so a change to the workout beat can never collide with a change to the tab bar.
// _motion.css owns the tokens' mechanics, press feedback, sheet exits and reduced motion.
import './styles/_motion.css'
import './styles/workout-motion.css'
import './styles/reward-motion.css'
import './styles/nav-motion.css'
import './styles/list-motion.css'
import './styles/data-motion.css'

// One delegated pointerdown listener that marks whatever is being pressed, so a tap is
// acknowledged on touch rather than whenever WKWebView finishes deciding it wasn't a scroll.
bindPress()

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Collects the sets ticked off from the iPhone lock screen while the webview was suspended.
// No-ops everywhere else.
watchNativeSets()

// Starts and ends the Apple Watch strength workout with the Lift Book session (iOS only), and
// saves the session to Apple Health from the phone when the watch did not run it.
watchWorkouts()
