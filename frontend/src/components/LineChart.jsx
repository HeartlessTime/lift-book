import { useEffect, useMemo, useRef } from 'react'
import { fmtNum, fmtDate, MONTHS, isoOf } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { reducedMotion } from '../lib/motion.js'

const DRAW_MS = 420   // must match the chart-draw animation in styles/data-motion.css

const W = 340   // viewBox width; the svg stretches to its container, height comes from `h`

// First x at or past `vx`, then the left neighbour if it is the closer of the two. The old
// code swept every point with a forEach on every single touch event; xs is sorted (points
// come in by time and X is monotonic in t), so a bisect answers the same question in ~5
// comparisons instead of 300. The `<=` keeps the original tie-break: on a dead heat the
// earlier point wins, which is what a forEach starting at index 0 with a strict `<` did.
function nearest(xs, vx) {
  let lo = 0, hi = xs.length - 1
  if (hi <= 0) return 0
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (xs[mid] < vx) lo = mid + 1; else hi = mid
  }
  return (lo > 0 && Math.abs(xs[lo - 1] - vx) <= Math.abs(xs[lo] - vx)) ? lo - 1 : lo
}

// points: [{ t: ms, y: num, d?: iso, m?: 0..1, note?: str }] sorted by t.
//   m    marks the point — a second reading carried by the same dot (bigger and more solid =
//        more of it). Used for effort on the weight curve, where the two belong on one line:
//        the same weight with less left in the tank is not the same session.
//   note extra text for that point's tooltip.
// opts: { h, unit, color, axes, goal, invert }
//   invert flips the y axis, for a scale that counts down as it gets harder (RIR). Without it
//   a curve of reps-in-reserve reads upside down, with the hardest sets at the floor.
export default function LineChart({ points, h = 150, unit = '', color = 'var(--acc)', axes = true, goal = null, invert = false }) {
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const tipRef = useRef(null)
  const lineRef = useRef(null)
  const crossRef = useRef(null)   // the <g> holding the crosshair, hidden until a pointer lands
  const vlRef = useRef(null)
  const hlRef = useRef(null)
  const dotRef = useRef(null)

  // Everything the scrub needs lives in refs rather than state, on purpose — see the block
  // comment above the handlers.
  const geoRef = useRef(null)
  const boxRef = useRef(null)     // cached svg rect + container size; null means "re-measure"
  const sizeRef = useRef([])      // tooltip [w, h] per point index, measured lazily once each
  const idxRef = useRef(-1)       // point the crosshair is currently on; -1 = hidden
  const rafRef = useRef(0)
  const xRef = useRef(0)          // latest clientX, read by the one scheduled frame

  // All of the chart's geometry, built once per data change instead of once per touch event.
  // The old version recomputed every line of this inside the render — so a finger moving
  // across the chart rebuilt the gridline array, re-joined the polyline with toFixed over
  // every point, and re-derived the scales, sixty to a hundred and twenty times a second.
  const geo = useMemo(() => {
    if (!points || points.length === 0) return null
    const H = h
    const P = { l: axes ? 34 : 8, r: 12, t: 10, b: axes ? 22 : 8 }
    const single = points.length === 1
    const pts = single ? [points[0], points[0]] : points
    const ys = pts.map(p => p.y)
    let ymin = Math.min(...ys), ymax = Math.max(...ys)
    if (goal != null && isFinite(goal)) { ymin = Math.min(ymin, goal); ymax = Math.max(ymax, goal) }
    if (ymin === ymax) { ymin -= 1; ymax += 1 }
    const pad = (ymax - ymin) * 0.12; ymin -= pad; ymax += pad
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1
    const X = tv => (t1 === t0 ? (P.l + W - P.r) / 2 : P.l + (tv - t0) / (t1 - t0) * (W - P.l - P.r))
    const Y = y => {
      const f = (y - ymin) / (ymax - ymin)
      return P.t + (invert ? f : 1 - f) * (H - P.t - P.b)
    }

    const gridlines = []
    if (axes) {
      const range = ymax - ymin, raw = range / 3
      const pow = Math.pow(10, Math.floor(Math.log10(raw)))
      let step = 10 * pow
      for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) { step = m * pow; break }
      for (let v = Math.ceil(ymin / step) * step; v <= ymax + 1e-9; v += step) {
        const y = Y(v)
        gridlines.push(<g key={'y' + v}>
          <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="var(--sep-op)" strokeWidth="1" strokeDasharray="2 4" />
          <text x={P.l - 5} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="var(--label-2)">{fmtNum(v)}</text>
        </g>)
      }
      const d0 = new Date(t0), d1 = new Date(t1)
      const ticks = []
      let m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1)
      while (m <= d1) { ticks.push({ t: +m, txt: t(MONTHS[m.getMonth()]) }); m = new Date(m.getFullYear(), m.getMonth() + 1, 1) }
      if (ticks.length === 0 && !single) {
        for (let i = 0; i <= 2; i++) {
          const tv = t0 + (t1 - t0) * i / 2, dd = new Date(tv)
          ticks.push({ t: tv, txt: dd.getDate() + ' ' + t(MONTHS[dd.getMonth()]), anchor: i === 0 ? 'start' : i === 2 ? 'end' : 'middle' })
        }
      }
      const every = Math.max(1, Math.ceil(ticks.length / 7))
      ticks.forEach((tk, i) => {
        if (i % every) return
        const x = X(tk.t)
        gridlines.push(<g key={'x' + i}>
          <line x1={x} y1={P.t} x2={x} y2={H - P.b} stroke="var(--sep-op)" strokeWidth="1" strokeDasharray="2 4" />
          <text x={x} y={H - 7} textAnchor={tk.anchor || 'middle'} fontSize="9.5" fill="var(--label-2)">{tk.txt}</text>
        </g>)
      })
    }

    const poly = pts.map(p => X(p.t).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')
    const last = pts[pts.length - 1]
    const hp = (single ? [points[0]] : points).map(p => ({ x: X(p.t), y: Y(p.y) }))
    // The tooltip's text is built here too, once per point, so a move is a single
    // textContent assignment with no formatting work behind it. fmtDate/fmtNum are
    // called with exactly the arguments the render used to pass them.
    const labels = (single ? [points[0]] : points).map(p => {
      const iso = p.d || isoOf(new Date(p.t))
      return fmtDate(iso, true) + ' · ' + fmtNum(p.y) + (unit ? ' ' + unit : '') + (p.note ? ' · ' + p.note : '')
    })
    return {
      H, P, pts, poly, last, X, Y, gridlines, labels,
      gid: 'g' + Math.round(t0 % 1e7) + '_' + H,
      xs: hp.map(p => p.x), pys: hp.map(p => p.y),
      marked: points.some(p => p.m != null),
    }
  }, [points, h, unit, axes, goal, invert])

  // The curve draws itself on, once, when the chart first appears — not on every render.
  // The empty dependency list is what makes that true. It used to be load-bearing against
  // hover re-renders; those are gone now, but a parent re-render would still wipe the line
  // out from under a finger tracing it, so it stays empty.
  //
  // Length is measured rather than computed: the polyline is built from a point list whose
  // segment lengths depend on the y scale, which depends on the data. getTotalLength() is
  // the one honest answer, and it costs a single layout read at mount.
  useEffect(() => {
    const el = lineRef.current
    if (!el) return
    // Reduced motion gets no draw-on: a line unspooling is travel with no confirmation in
    // it — nothing has changed, the chart has merely arrived (lib/motion.js).
    if (reducedMotion()) return
    let len = 0
    try { len = el.getTotalLength() } catch (e) { return }
    // A single point renders as a zero-length polyline, and dashing zero either does
    // nothing or blanks the stroke outright depending on the engine. Leave it alone.
    if (!isFinite(len) || len < 1) return

    // Stripping it again afterwards is not tidiness. `stroke-dasharray` left pinned to
    // this length outlives the animation, so a point appended later makes the path longer
    // than the dash and the new tail renders as a gap in the line.
    const strip = () => { el.classList.remove('draw'); el.style.removeProperty('--draw') }
    el.style.setProperty('--draw', len + 'px')
    el.classList.add('draw')
    // A timer rather than `animationend`, so the cleanup still runs if the chart is
    // scrolled away or display:none'd before the animation ever fires.
    const id = setTimeout(strip, DRAW_MS + 60)
    // Also strips on unmount — and so, in dev, on StrictMode's throwaway first pass, which
    // leaves the node clean for the real one to draw again.
    return () => { clearTimeout(id); strip() }
  }, [])

  // ------------------------------------------------------------------ scrubbing --
  // The crosshair, its dot and the tooltip are mounted once and then moved by writing
  // transforms straight onto those four nodes. Nothing below calls setState.
  //
  // What this replaces: every touchmove used to call setHover(), which re-rendered the
  // whole component (gridlines rebuilt, polyline re-joined, the entire svg reconciled),
  // and a useLayoutEffect with no dependency array then ran after that render and read
  // offsetWidth/offsetHeight/clientWidth/clientHeight — three more forced synchronous
  // layouts. A full React render plus four layout reads, at up to 120 events a second,
  // inside WKWebView. The finger won.
  //
  // Two things make the new path nearly free. Events are coalesced into one
  // requestAnimationFrame, so a burst of moves inside a single frame does the work once;
  // and the crosshair snaps to a data point, so if the nearest point has not changed there
  // is by definition nothing to move and the frame exits early.

  // The rect is cached because getBoundingClientRect is a layout read and the answer only
  // changes when the chart moves. Scroll counts as moving: the chart sits inside a
  // scrolling view, so a cached left goes stale the moment that view travels.
  const measure = () => {
    const svg = svgRef.current, wrap = wrapRef.current
    if (!svg || !wrap) return null
    const r = svg.getBoundingClientRect()
    if (!r.width) return null
    return (boxRef.current = { left: r.left, w: r.width, cw: wrap.clientWidth || r.width, ch: wrap.clientHeight || r.height })
  }

  const place = i => {
    const g = geoRef.current, box = boxRef.current
    const cross = crossRef.current, tip = tipRef.current
    if (!g || !box || !cross || !tip) return
    const first = idxRef.current === -1
    if (first) { cross.style.visibility = 'visible'; tip.style.visibility = 'visible' }
    else if (i === idxRef.current) return
    idxRef.current = i

    const x = g.xs[i], y = g.pys[i]
    // Attribute transforms rather than new x1/y1/x2/y2 on each line: one property to write
    // per node, and the geometry the browser already resolved stays resolved.
    vlRef.current.setAttribute('transform', 'translate(' + x + ' 0)')
    hlRef.current.setAttribute('transform', 'translate(0 ' + y + ')')
    dotRef.current.setAttribute('transform', 'translate(' + x + ' ' + y + ')')
    tip.textContent = g.labels[i]

    // The tooltip is placed from its own measured size because the chart lives in an
    // overflow-clipped box: a fixed half-width offset (what this used to do) hangs the
    // label off the edge on the first and last point and the clip then eats it. Measuring
    // forces a layout, so it happens once per point and is cached — the label only changes
    // when the point does, so crossing one costs nothing. Reading offsetWidth also covers
    // translated labels, which are not all the same length.
    let s = sizeRef.current[i]
    if (!s) s = sizeRef.current[i] = [tip.offsetWidth, tip.offsetHeight]
    const M = 4                                   // breathing room against the clip
    const cx = x / W * box.cw, cy = y / g.H * box.ch
    const tx = Math.max(M, Math.min(box.cw - s[0] - M, cx - s[0] / 2))
    // Parked at the top, but dropped below the point when the point sits high
    // enough that the label would cover the very value it is reporting.
    const ty = cy < s[1] + 14 ? Math.min(box.ch - s[1] - M, cy + 14) : M
    // translate3d, not left/top: moving the label must not relayout the card around it.
    tip.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)'
  }

  const frame = () => {
    rafRef.current = 0
    const g = geoRef.current
    const box = boxRef.current || measure()
    if (!g || !box) return
    place(nearest(g.xs, (xRef.current - box.left) / box.w * W))
  }

  const onMove = e => {
    xRef.current = e.clientX
    if (rafRef.current) return          // a frame is already owed; it will read the latest x
    rafRef.current = requestAnimationFrame(frame)
  }

  const hide = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    if (idxRef.current === -1) return
    idxRef.current = -1
    if (crossRef.current) crossRef.current.style.visibility = 'hidden'
    if (tipRef.current) tipRef.current.style.visibility = 'hidden'
  }

  const onDown = e => {
    measure()
    // Capture so a drag that wanders off the chart — above it, below it, past the last
    // point — keeps reporting, and releases by itself on pointerup. Not for the mouse:
    // capturing a mouse press would swallow the pointerleave that hides the crosshair.
    if (e.pointerType !== 'mouse') { try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* synthetic id */ } }
    onMove(e)
  }
  // A mouse keeps its crosshair after the click and loses it on the way out; a finger
  // loses it when it lifts. pointercancel is the page deciding the gesture was a scroll.
  const onUp = e => { if (e.pointerType !== 'mouse') hide() }
  const onEnter = e => { if (e.pointerType === 'mouse') measure() }

  // Geometry and the size cache are swapped in from an effect rather than during render,
  // so the handlers never see a half-built chart. Hiding on a data change is deliberate:
  // the crosshair's old index points at a value that is no longer there.
  useEffect(() => { geoRef.current = geo; sizeRef.current = []; boxRef.current = null; hide() }, [geo])

  useEffect(() => {
    const drop = () => { boxRef.current = null }
    window.addEventListener('resize', drop)
    // capture, so a scroll in any ancestor container counts and not just the window's own.
    window.addEventListener('scroll', drop, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', drop)
      window.removeEventListener('scroll', drop, { capture: true })
    }
  }, [])

  if (!geo) return <div className="empty small">{t('No data yet')}</div>
  const { H, P, pts, poly, last, X, Y, gid, gridlines, marked } = geo

  return (
    <div className="chart-i" ref={wrapRef}
      onPointerDown={onDown} onPointerMove={onMove} onPointerEnter={onEnter}
      onPointerUp={onUp} onPointerCancel={hide} onPointerLeave={hide}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ aspectRatio: `${W}/${H}` }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient></defs>
        {gridlines}
        {goal != null && isFinite(goal) && <>
          <line x1={P.l} y1={Y(goal)} x2={W - P.r} y2={Y(goal)} stroke="var(--yellow)" strokeWidth="1.6" strokeDasharray="7 4" />
          <text x={W - P.r - 2} y={Y(goal) - 5} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--yellow)">{fmtNum(goal)}</text>
        </>}
        <polygon points={`${P.l},${H - P.b} ${poly} ${X(last.t).toFixed(1)},${H - P.b}`} fill={`url(#${gid})`} />
        <polyline ref={lineRef} className="cline" points={poly} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {marked && pts.map((p, i) => (p.m == null ? null :
          <circle key={'m' + i} cx={X(p.t)} cy={Y(p.y)} r={2.4 + p.m * 3} fill={color} opacity={0.3 + p.m * 0.7} />))}
        <circle cx={X(last.t)} cy={Y(last.y)} r="4" fill={color} />
        {/* Mounted from the start and moved by transform, never added and removed. Staying
            inside a <g> also keeps it on the right side of data-motion.css, which exempts
            `.chart-i g circle` from the entrance fade the other dots get: the crosshair
            belongs to the finger and has to be there on the frame it lands. */}
        <g ref={crossRef} style={{ visibility: 'hidden' }}>
          <line ref={vlRef} className="cvl" x1="0" y1={P.t} x2="0" y2={H - P.b} stroke="var(--label-3)" strokeWidth="1" strokeDasharray="3 3" />
          <line ref={hlRef} className="chl" x1={P.l} y1="0" x2={W - P.r} y2="0" stroke="var(--label-3)" strokeWidth="1" strokeDasharray="3 3" />
          <circle ref={dotRef} cx="0" cy="0" r="5" fill={color} stroke="var(--bg)" strokeWidth="2" />
        </g>
      </svg>
      {/* Empty: the text is written straight onto the node while scrubbing, so the label
          changing is not a render. */}
      <div className="ctip" ref={tipRef} style={{ visibility: 'hidden' }} />
    </div>
  )
}
