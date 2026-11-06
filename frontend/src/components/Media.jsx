import { useState } from 'react'
import { imgSrc, gifSrc } from '../lib/exercises.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// Big autoplaying animation; tap toggles to the still frame. `compact` shrinks it (superset cards).
// Custom exercises have no media — the animation stays blank by design (issue #11).
// `minimizable` (workout view) adds a persistent minimize/expand control so the animation stops
// eating the screen; the chosen size is saved to settings and carries across exercises and
// future workouts (issue #12).
export default function Media({ ex, id, compact, minimizable }) {
  const [playing, setPlaying] = useState(true)
  // Sources that failed to load on this mount. The media lives on the server, and a phone in a
  // gym is one dropped connection away from losing a fetch — an <img> never retries on its own,
  // so without this the card keeps WebKit's broken-image glyph for the whole exercise.
  const [failed, setFailed] = useState([])
  const gifSize = useStore(s => s.S.gifSize)
  const update = useStore(s => s.update)
  if (!ex.gif) return null
  const mini = minimizable && gifSize === 'mini'
  const toggleSize = e => { e.stopPropagation(); update(s => { s.gifSize = mini ? 'full' : 'mini' }) }
  // The animation is the big download and the one that realistically drops. Falling back to the
  // still frame is both a cheaper ask and a fresh request, so a blip that cost the GIF usually
  // still leaves a picture of the movement. Only when that is gone too is there nothing to show
  // — and then it's the dumbbell placeholder, not a broken-image icon.
  const wanted = playing ? gifSrc(ex) : imgSrc(ex)
  const still = imgSrc(ex)
  const src = !failed.includes(wanted) ? wanted : failed.includes(still) ? null : still
  return (
    <div className={'exmedia' + (compact ? ' compact' : '') + (mini ? ' mini' : '')} id={id} onClick={() => setPlaying(p => !p)}>
      {src
        ? <img decoding="async" src={src} alt={ex.n} onError={() => setFailed(f => f.includes(src) ? f : [...f, src])} />
        : <div className="exmedia-x"><Icon name="dumbbell" /></div>}
      {minimizable && (
        <button className="giftoggle" onClick={toggleSize}>
          <Icon name={mini ? 'expand' : 'minimize'} />{mini ? t('Expand') : t('Minimize')}
        </button>
      )}
      {!mini && (
        <span className="gifhint">
          <Icon name={playing ? 'pause' : 'play'} />{playing ? t('tap to pause') : t('tap to play')}
        </span>
      )}
    </div>
  )
}

export function Thumb({ ex }) {
  if (!ex.img) return <div className="thumb thumb-x"><Icon name="dumbbell" /></div>
  return <img className="thumb" loading="lazy" decoding="async" src={imgSrc(ex)} alt="" />
}
