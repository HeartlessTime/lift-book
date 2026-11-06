// Charts for the Health screens: bars (daily totals), line + dots (readings), a min–max band
// (heart rate), and a tiny sparkline for the Summary cards. Plain SVG, measured to its box so
// dots stay round. Touch and drag picks a bucket; the parent shows it in the headline.
import { useLayoutEffect, useRef, useState } from 'react'

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// Round axis bounds with three gridlines.
function niceScale(lo, hi, zero) {
  if (zero) lo = 0
  if (lo === hi) { lo = zero ? 0 : lo - 1; hi = hi + 1 }
  const span = hi - lo
  const raw = span / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw
  const a = Math.floor(lo / step) * step
  const b = Math.ceil(hi / step) * step
  const ticks = []
  for (let v = a; v <= b + step / 2; v += step) ticks.push(Math.round(v * 100) / 100)
  return { lo: a, hi: b, ticks }
}

const fmtTick = v => (Math.abs(v) >= 10000 ? Math.round(v / 1000) + 'k' : v.toLocaleString())

export default function HealthChart({ buckets, type, color, sel, onSel, height = 220 }) {
  const [ref, W] = useWidth()
  const H = height
  const padR = 36, padB = 22, padT = 8
  const plotW = Math.max(0, W - padR), plotH = H - padB - padT
  const vals = buckets.flatMap(b => (b.v == null ? [] : type === 'band' ? [b.lo, b.hi] : [b.v]))
  const sc = vals.length ? niceScale(Math.min(...vals), Math.max(...vals), type === 'bar') : niceScale(0, 1, true)
  const y = v => padT + plotH - ((v - sc.lo) / (sc.hi - sc.lo || 1)) * plotH
  const n = buckets.length
  const slot = n ? plotW / n : 0
  const cx = i => slot * i + slot / 2
  const barW = Math.max(2, Math.min(18, slot * 0.62))

  const pick = e => {
    if (!onSel || !slot) return
    const r = ref.current.getBoundingClientRect()
    const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / slot)))
    onSel(buckets[i].v == null ? null : i)
  }
  const pts = buckets.map((b, i) => (b.v == null ? null : [cx(i), y(b.v)])).filter(Boolean)
  if (!vals.length) return <div ref={ref} className="hx-chart hx-chart-empty" style={{ height: 96 }} aria-hidden="true" />
  const line = pts.length > 1 ? 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') : ''

  return (
    <div ref={ref} className="hx-chart" style={{ height: H }}
      onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); pick(e) }}
      onPointerMove={e => { if (e.buttons) pick(e) }}
      onPointerUp={() => onSel && onSel(null)} onPointerCancel={() => onSel && onSel(null)}>
      {W > 0 && <svg width={W} height={H} role="img" aria-hidden="true">
        {sc.ticks.map(t => <g key={t}>
          <line x1="0" x2={plotW} y1={y(t)} y2={y(t)} className="hx-grid" />
          <text x={W - 2} y={y(t) + 4} textAnchor="end" className="hx-tick">{fmtTick(t)}</text>
        </g>)}
        {buckets.map((b, i) => b.label ? <text key={'l' + b.key} x={cx(i)} y={H - 6} textAnchor="middle" className="hx-tick">{b.label}</text> : null)}
        {sel != null && buckets[sel] && <line x1={cx(sel)} x2={cx(sel)} y1={padT} y2={padT + plotH} className="hx-cursor" />}
        {type === 'bar' && buckets.map((b, i) => b.v == null || b.v <= 0 ? null :
          <rect key={b.key} x={cx(i) - barW / 2} y={y(b.v)} width={barW} height={Math.max(1, padT + plotH - y(b.v))}
            rx={Math.min(4, barW / 2)} fill={color} opacity={sel == null || sel === i ? 1 : 0.35} />)}
        {type === 'band' && buckets.map((b, i) => b.v == null ? null :
          <rect key={b.key} x={cx(i) - barW / 2} y={y(b.hi)} width={barW} height={Math.max(barW, y(b.lo) - y(b.hi))}
            rx={barW / 2} fill={color} opacity={sel == null || sel === i ? 1 : 0.35} />)}
        {type === 'line' && <>
          {line && <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" opacity={sel == null ? 0.85 : 0.4} />}
          {buckets.map((b, i) => b.v == null ? null :
            <circle key={b.key} cx={cx(i)} cy={y(b.v)} r={sel === i ? 5.5 : n > 40 ? 2.5 : n > 14 ? 3.25 : 4} fill={color} stroke="var(--hx-card)" strokeWidth={sel === i ? 2 : 1.5} />)}
        </>}
      </svg>}
    </div>
  )
}

// Summary-card mini chart: last few buckets, no axes.
export function Spark({ buckets, type, color }) {
  const W = 92, H = 40
  const vals = buckets.flatMap(b => (b.v == null ? [] : type === 'band' ? [b.lo, b.hi] : [b.v]))
  if (!vals.length) return <svg width={W} height={H} aria-hidden="true" />
  let lo = type === 'bar' ? 0 : Math.min(...vals), hi = Math.max(...vals)
  if (hi === lo) { hi += 1; lo -= type === 'bar' ? 0 : 1 }
  const y = v => 3 + (H - 6) * (1 - (v - lo) / (hi - lo))
  const slot = W / buckets.length
  const cx = i => slot * i + slot / 2
  const bw = Math.max(2, slot * 0.55)
  const pts = buckets.map((b, i) => (b.v == null ? null : [cx(i), y(b.v)])).filter(Boolean)
  return (
    <svg width={W} height={H} aria-hidden="true" className="hx-spark">
      {type === 'bar' && buckets.map((b, i) => b.v ? <rect key={i} x={cx(i) - bw / 2} y={y(b.v)} width={bw} height={H - 3 - y(b.v)} rx={bw / 2} fill={i === buckets.length - 1 ? color : 'var(--hx-spark)'} /> : null)}
      {type === 'band' && buckets.map((b, i) => b.v != null ? <rect key={i} x={cx(i) - bw / 2} y={y(b.hi)} width={bw} height={Math.max(bw, y(b.lo) - y(b.hi))} rx={bw / 2} fill={i === buckets.length - 1 ? color : 'var(--hx-spark)'} /> : null)}
      {type === 'line' && <>
        {pts.length > 1 && <path d={'M' + pts.map(p => p.join(' ')).join('L')} fill="none" stroke="var(--hx-spark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={color} />}
      </>}
    </svg>
  )
}
