import { useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react'
import { Viewport, type ViewHandle } from '../scene/Viewport'
import { joystick } from '../scene/TourControls'
import { LOOKS, captureWithLook, lookById } from '../scene/filters'
import { useStore } from '../store'
import { PhotorealOverlay, type PhotorealMode } from '../render/PhotorealOverlay'
import { PanoTour } from '../render/PanoTour'

/** On-screen stick for phones and tablets. Writes into the shared `joystick` input the tour reads each frame. */
function Joystick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const R = 44
  const move = (e: RPointerEvent) => {
    const r = base.current!.getBoundingClientRect()
    let x = e.clientX - (r.left + r.width / 2)
    let y = e.clientY - (r.top + r.height / 2)
    const m = Math.hypot(x, y)
    if (m > R) {
      x = (x / m) * R
      y = (y / m) * R
    }
    setKnob({ x, y })
    joystick.x = x / R
    joystick.y = -y / R
  }
  const end = () => {
    setKnob({ x: 0, y: 0 })
    joystick.x = 0
    joystick.y = 0
  }
  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

export function TourStep({ capture, lookId, setLookId }: {
  capture: MutableRefObject<ViewHandle | null>
  lookId: string
  setLookId: (id: string) => void
}) {
  const name = useStore((s) => s.project.room.name)
  const panoCount = useStore((s) => s.project.panoramas?.length ?? 0)
  const [tracing, setTracing] = useState<PhotorealMode | null>(null)
  const [vr, setVr] = useState(false)
  const save = () => {
    const canvas = capture.current?.snapshot()
    if (!canvas) return
    const a = document.createElement('a')
    a.href = captureWithLook(canvas, lookById(lookId))
    a.download = `${name || 'room'}-tour.png`
    a.click()
  }
  return (
    <main className="main tour">
      <Viewport mode="tour" editable={false} lookId={lookId} capture={capture} />
      <div className="tour-help">드래그로 둘러보기 · <b>W A S D</b> / 방향키로 걷기</div>
      <div className="tour-bar">
        {LOOKS.map((l) => (
          <button key={l.id} className={lookId === l.id ? 'on' : ''} onClick={() => setLookId(l.id)}>
            {l.name}
          </button>
        ))}
        <button onClick={save}>화면 저장</button>
        <button className="shot" onClick={() => capture.current && setTracing('view')}>✨ 실사 사진</button>
        <button className="shot" onClick={() => capture.current && setTracing('pano')}>📷 여기서 360° 찍기</button>
        <button className="shot" disabled={!panoCount} onClick={() => setVr(true)}>🥽 VR 투어 ({panoCount})</button>
      </div>
      <Joystick />
      {tracing && capture.current && <PhotorealOverlay view={capture.current} mode={tracing} onClose={() => setTracing(null)} />}
      {vr && <PanoTour onClose={() => setVr(false)} />}
    </main>
  )
}
