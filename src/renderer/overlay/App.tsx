import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject, PointerEvent as RPointerEvent } from 'react'
import type { OverlayStatus, SessionState, Settings } from '../../shared/types'
import { startCapture, stopCapture } from '../audio/capture'

/** Хулгана товч дээр ирэхэд гарах сэжүүр (title). */
const TOOLTIPS: Record<SessionState, string> = {
  idle: 'Дарж эхлүүлэх',
  listening: 'Сонсож байна — дарж зогсооно',
  speech: 'Ярьж байна — дарж зогсооно',
  transcribing: 'Хөрвүүлж байна…',
  error: 'Алдаа гарлаа'
}

const BAR_COUNT = 13

export default function App(): JSX.Element {
  const [status, setStatus] = useState<OverlayStatus>({ state: 'idle' })
  const [hot, setHot] = useState(false)
  const levelRef = useRef(0)
  const pillRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ sx: number; sy: number; lx: number; ly: number; moved: boolean } | null>(
    null
  )

  // main process-оос ирэх төлөв
  useEffect(() => window.yriya.onStatus(setStatus), [])

  // аудио эхлүүлэх / зогсоох
  useEffect(() => {
    const offStart = window.yriya.onAudioStart((settings: Settings) => {
      void startCapture(settings, {
        onSegmentWav: (wav) => window.yriya.sendSegment(wav),
        onActivity: (speaking) => window.yriya.sendActivity(speaking),
        onLevel: (rms) => {
          levelRef.current = rms
        },
        onError: (msg) => window.yriya.sendAudioError(msg)
      })
    })
    const offStop = window.yriya.onAudioStop(() => {
      void stopCapture()
      levelRef.current = 0
    })
    // Цуцлалт: дуусаагүй сегментийг flush ХИЙХГҮЙ зогсооно — текст оруулахгүй.
    const offCancel = window.yriya.onAudioCancel(() => {
      void stopCapture(false)
      levelRef.current = 0
    })
    return () => {
      offStart()
      offStop()
      offCancel()
      void stopCapture()
    }
  }, [])

  // Хулгана товч дээр ирэхэд л цонхыг click авдаг болгоно (бусад үед нэвт өнгөрүүлнэ).
  useEffect(() => {
    let inside = false
    const setInteractive = (next: boolean): void => {
      if (next === inside) return
      inside = next
      setHot(next)
      window.yriya.setOverlayInteractive(next)
    }
    const onMove = (e: MouseEvent): void => {
      if (drag.current) return
      const el = pillRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setInteractive(
        e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
      )
    }
    const onLeave = (): void => {
      if (!drag.current) setInteractive(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Дарах (toggle) ба чирэх (зөөх) — хөдөлгөөн багатай бол дарсан гэж үзнэ.
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>): void => {
    pillRef.current?.setPointerCapture(e.pointerId)
    drag.current = { sx: e.screenX, sy: e.screenY, lx: e.screenX, ly: e.screenY, moved: false }
  }
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.screenX - d.sx) > 4 || Math.abs(e.screenY - d.sy) > 4) d.moved = true
    if (d.moved) {
      const dx = e.screenX - d.lx
      const dy = e.screenY - d.ly
      if (dx || dy) {
        window.yriya.dragOverlayBy(dx, dy)
        d.lx = e.screenX
        d.ly = e.screenY
      }
    }
  }
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    drag.current = null
    pillRef.current?.releasePointerCapture(e.pointerId)
    if (!d) return
    if (d.moved) window.yriya.endOverlayDrag()
    else window.yriya.toggleSession()
  }

  const state = status.state
  const active = state === 'listening' || state === 'speech'
  const busy = state === 'transcribing'
  const tip = state === 'error' ? status.message || TOOLTIPS.error : TOOLTIPS[state]

  return (
    <div className="wrap">
      <div
        ref={pillRef}
        className={`pill state-${state} ${hot ? 'hot' : ''} ${active ? 'on' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault()
          window.yriya.showOverlayMenu()
        }}
        role="button"
        title={tip}
      >
        {busy ? (
          <span className="spinner" />
        ) : state === 'error' ? (
          <span className="err-mark">!</span>
        ) : active ? (
          <Waveform levelRef={levelRef} active={active} />
        ) : null}
      </div>
    </div>
  )
}

/** Микрофоны түвшинд хариу үзүүлэх амьд waveform — rAF-аар DOM-г шууд хөдөлгөнө. */
function Waveform({
  levelRef,
  active
}: {
  levelRef: MutableRefObject<number>
  active: boolean
}): JSX.Element {
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    let raf = 0
    let t = 0
    const heights = new Array<number>(BAR_COUNT).fill(0.12)
    // голдоо өндөр, захдаа намхан жинлэлт
    const mid = (BAR_COUNT - 1) / 2
    const weight = Array.from({ length: BAR_COUNT }, (_, i) => {
      const d = Math.abs(i - mid) / mid
      return 0.34 + 0.66 * (1 - d * d)
    })
    const phase = Array.from({ length: BAR_COUNT }, (_, i) => i * 0.7)

    const tick = (): void => {
      t += 0.09
      const on = activeRef.current
      const lvl = Math.min(1, levelRef.current * 12)
      for (let i = 0; i < BAR_COUNT; i++) {
        let target: number
        if (on) {
          const wob = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.6 + phase[i]))
          target = 0.14 + lvl * weight[i] * wob
        } else {
          target = 0.12 + 0.05 * Math.sin(t + phase[i])
        }
        heights[i] += (target - heights[i]) * 0.3
        const el = bars.current[i]
        if (el) el.style.height = `${3 + Math.min(1, heights[i]) * 15}px`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [levelRef])

  return (
    <div className="wave">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el
          }}
          className="wbar"
        />
      ))}
    </div>
  )
}
