import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { PhotoCamera, Room, RoomPhoto } from '../types'
import { projectToPhoto } from '../geometry/cameraSolve'
import { wallSegments } from '../geometry/plan'
import { handleLabel, roomHandles } from './handles'

type V3 = [number, number, number]

/** Projects a 3D segment into the photo, split into pieces so the parts behind the camera drop out cleanly. */
function projectSegment(cam: PhotoCamera, a: V3, b: V3, w: number, h: number): string[] {
  const steps = 32
  const runs: string[] = []
  let run: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = projectToPhoto(cam, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], w, h)
    if (p && Math.abs(p[0]) < w * 4 && Math.abs(p[1]) < h * 4) run.push(`${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    else if (run.length) {
      if (run.length > 1) runs.push(run.join(' '))
      run = []
    }
  }
  if (run.length > 1) runs.push(run.join(' '))
  return runs
}

function wireframe(room: Room, cam: PhotoCamera, w: number, h: number) {
  const segs: { pts: string; kind: 'edge' | 'opening' }[] = []
  const H = room.height
  const n = room.corners.length
  room.corners.forEach((c, i) => {
    const d = room.corners[(i + 1) % n]
    const lines: [V3, V3][] = [
      [[c.x, 0, c.z], [d.x, 0, d.z]],
      [[c.x, H, c.z], [d.x, H, d.z]],
      [[c.x, 0, c.z], [c.x, H, c.z]],
    ]
    for (const [a, b] of lines) projectSegment(cam, a, b, w, h).forEach((pts) => segs.push({ pts, kind: 'edge' }))
  })
  const walls = wallSegments(room.corners)
  for (const o of room.openings) {
    const wall = walls[o.wall]
    if (!wall) continue
    const at = (along: number, y: number): V3 => [wall.start.x + wall.dir.x * along, y, wall.start.z + wall.dir.z * along]
    const x0 = o.offset - o.width / 2
    const x1 = o.offset + o.width / 2
    const rect: V3[] = [at(x0, o.sill), at(x1, o.sill), at(x1, o.sill + o.height), at(x0, o.sill + o.height)]
    rect.forEach((p, i) => projectSegment(cam, p, rect[(i + 1) % 4], w, h).forEach((pts) => segs.push({ pts, kind: 'opening' })))
  }
  return segs
}

export function PhotoMatch({ photo, room, activeHandle, onPin, onPinsCommitted }: {
  photo: RoomPhoto
  room: Room
  /** Handle the next click on the photo will place. */
  activeHandle: string | null
  onPin: (handleId: string, pixel: [number, number]) => void
  /** Called when the user finishes placing or dragging a pin, so the camera can be re-solved. */
  onPinsCommitted: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 1, h: 1 })
  const dragging = useRef<string | null>(null)

  useEffect(() => {
    const el = boxRef.current!
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const k = Math.min(box.w / photo.width, box.h / photo.height)
  const dw = photo.width * k
  const dh = photo.height * k
  // Pin and label sizes in photo pixels, so they look the same on screen at any photo resolution.
  const px = 1 / k

  const handles = useMemo(() => roomHandles(room), [room])
  const segs = useMemo(
    () => (photo.camera ? wireframe(room, photo.camera, photo.width, photo.height) : []),
    [room, photo.camera, photo.width, photo.height],
  )

  const toPhoto = (e: { clientX: number; clientY: number }, el: Element): [number, number] => {
    const r = el.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * photo.width, ((e.clientY - r.top) / r.height) * photo.height]
  }

  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !activeHandle) return
    onPin(activeHandle, toPhoto(e, e.currentTarget))
    onPinsCommitted()
  }

  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (dragging.current) onPin(dragging.current, toPhoto(e, e.currentTarget))
  }

  const onUp = () => {
    if (!dragging.current) return
    dragging.current = null
    onPinsCommitted()
  }

  return (
    <div className="photo-match" ref={boxRef}>
      <div className="photo-frame" style={{ width: dw, height: dh }}>
        <img src={photo.dataUrl} alt="" draggable={false} />
        <svg
          viewBox={`0 0 ${photo.width} ${photo.height}`}
          className={activeHandle ? 'placing' : ''}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {segs.map((s, i) => (
            <polyline key={i} points={s.pts} className={`wire ${s.kind}`} style={{ strokeWidth: 2 * px }} />
          ))}
          {photo.camera &&
            handles
              .filter((h) => !photo.pins[h.id])
              .map((h) => {
                const p = projectToPhoto(photo.camera!, h.world, photo.width, photo.height)
                if (!p || p[0] < 0 || p[1] < 0 || p[0] > photo.width || p[1] > photo.height) return null
                return (
                  <g key={h.id} className="ghost-handle">
                    <circle cx={p[0]} cy={p[1]} r={4 * px} />
                    <text x={p[0] + 8 * px} y={p[1] - 8 * px} style={{ fontSize: 12 * px }}>
                      {h.corner + 1}
                    </text>
                  </g>
                )
              })}
          {Object.entries(photo.pins).map(([id, [x, y]]) => {
            const h = handles.find((h) => h.id === id)
            if (!h) return null
            const predicted = photo.camera ? projectToPhoto(photo.camera, h.world, photo.width, photo.height) : null
            return (
              <g
                key={id}
                className={`pin ${h.level}${activeHandle === id ? ' active' : ''}`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  dragging.current = id
                  ;(e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId)
                }}
              >
                {predicted && (
                  <line x1={x} y1={y} x2={predicted[0]} y2={predicted[1]} className="residual" style={{ strokeWidth: 1.5 * px }} />
                )}
                <circle cx={x} cy={y} r={9 * px} style={{ strokeWidth: 2.5 * px }} />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10 * px }}>
                  {h.corner + 1}
                </text>
                <title>{handleLabel(h)}</title>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
