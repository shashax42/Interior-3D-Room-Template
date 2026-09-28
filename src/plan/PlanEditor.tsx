import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent } from 'react'
import { useStore } from '../store'
import type { OpeningKind, Vec2 } from '../types'
import { bounds, centroid, dist, nearestWall, wallSegments } from '../geometry/plan'
import { footprint, placeAt } from '../furniture/placement'

export type PlanTool = 'select' | 'draw' | 'calibrate' | 'door' | 'window'

type View = { s: number; tx: number; ty: number }

const HIT_PX = 12
const OPENING_DEFAULTS: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.5, height: 1.3, sill: 0.8 },
}

const cm = (m: number) => `${Math.round(m * 100)}`

type Drag =
  | { type: 'pan'; x: number; y: number; tx: number; ty: number }
  | { type: 'corner'; index: number }
  | { type: 'opening'; id: string }
  | { type: 'furniture'; id: string; offset: Vec2 }

export function PlanEditor({ tool, setTool }: { tool: PlanTool; setTool: (t: PlanTool) => void }) {
  const project = useStore((s) => s.project)
  const { room, planImage, furniture } = project
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const checkpoint = useStore((s) => s.checkpoint)
  const setCorners = useStore((s) => s.setCorners)
  const updateRoom = useStore((s) => s.updateRoom)
  const addOpening = useStore((s) => s.addOpening)
  const updateOpening = useStore((s) => s.updateOpening)
  const updateFurniture = useStore((s) => s.updateFurniture)
  const setPlanImage = useStore((s) => s.setPlanImage)
  const setProject = useStore((s) => s.setProject)

  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ s: 80, tx: 400, ty: 300 })
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const [draft, setDraft] = useState<Vec2[]>([])
  const [calib, setCalib] = useState<Vec2[]>([])
  const [calibInput, setCalibInput] = useState('')
  const drag = useRef<Drag | null>(null)

  const walls = useMemo(() => wallSegments(room.corners), [room.corners])

  // Track the element size.
  useEffect(() => {
    const el = svgRef.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = () => {
    const pts = [...room.corners]
    if (planImage) {
      pts.push(planImage.origin, { x: planImage.origin.x + planImage.width * planImage.scale, z: planImage.origin.z + planImage.height * planImage.scale })
    }
    const b = bounds(pts)
    const w = Math.max(1, b.maxX - b.minX)
    const h = Math.max(1, b.maxZ - b.minZ)
    const s = Math.min(size.w / (w * 1.25), size.h / (h * 1.25))
    setView({ s, tx: size.w / 2 - ((b.minX + b.maxX) / 2) * s, ty: size.h / 2 - ((b.minZ + b.maxZ) / 2) * s })
  }
  // Fit once the element has been measured, and again whenever a new plan image arrives.
  const fitKey = `${size.w}x${size.h}-${planImage?.dataUrl.length ?? 0}`
  const fitted = useRef('')
  useEffect(() => {
    const key = `${planImage?.dataUrl.length ?? 0}`
    if (!size.w || !size.h || fitted.current === key) return
    fitted.current = key
    fit()
  }, [fitKey])

  // Leave drawing/calibration state behind when switching tools.
  useEffect(() => {
    setDraft([])
    setCalib([])
    setCalibInput('')
  }, [tool])

  const toScreen = (p: Vec2) => ({ x: p.x * view.s + view.tx, y: p.z * view.s + view.ty })
  const toWorld = (x: number, y: number): Vec2 => ({ x: (x - view.tx) / view.s, z: (y - view.ty) / view.s })
  const eventWorld = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return toWorld(e.clientX - r.left, e.clientY - r.top)
  }

  /** Nudges a point onto the same x or z as its neighbours, so traced walls come out straight. */
  const snap = (p: Vec2, neighbours: Vec2[]) => {
    const tol = 8 / view.s
    let { x, z } = p
    for (const n of neighbours) {
      if (Math.abs(n.x - x) < tol) x = n.x
      if (Math.abs(n.z - z) < tol) z = n.z
    }
    return { x, z }
  }

  const wallUnder = (p: Vec2) => {
    const near = nearestWall(p, room.corners)
    return near.distance * view.s <= HIT_PX ? near : null
  }

  const onWheel = (e: WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    const k = Math.exp(-e.deltaY * 0.0015)
    setView((v) => {
      const s = Math.min(800, Math.max(8, v.s * k))
      const f = s / v.s
      return { s, tx: mx - (mx - v.tx) * f, ty: my - (my - v.ty) * f }
    })
  }

  const onBackgroundDown = (e: RPointerEvent<SVGSVGElement>) => {
    const p = eventWorld(e)
    if (e.button === 1 || (e.button === 0 && tool === 'select')) {
      if (tool === 'select' && e.button === 0) select(null)
      drag.current = { type: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
      svgRef.current!.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    if (tool === 'draw') {
      if (draft.length >= 3 && dist(p, draft[0]) * view.s <= HIT_PX) {
        finishDraft()
        return
      }
      setDraft((d) => [...d, snap(p, d.length ? [d[d.length - 1], d[0]] : [])])
      return
    }
    if (tool === 'calibrate') {
      if (calib.length >= 2) setCalib([p])
      else setCalib((c) => [...c, p])
      return
    }
    if (tool === 'door' || tool === 'window') {
      const w = wallUnder(p)
      if (!w) return
      checkpoint()
      addOpening({ kind: tool, wall: w.wall.index, offset: w.along, ...OPENING_DEFAULTS[tool] })
      setTool('select')
    }
  }

  const finishDraft = () => {
    if (draft.length < 3) return
    checkpoint()
    // A new outline means new walls; openings from the old one no longer apply.
    updateRoom({ openings: [] })
    setCorners(draft)
    setDraft([])
    setTool('select')
  }

  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = eventWorld(e)
    setCursor(p)
    const d = drag.current
    if (!d) return
    if (d.type === 'pan') {
      setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }))
    } else if (d.type === 'corner') {
      const n = room.corners.length
      const next = room.corners.map((c, i) =>
        i === d.index ? snap(p, [room.corners[(i - 1 + n) % n], room.corners[(i + 1) % n]]) : c,
      )
      updateRoom({ corners: next })
    } else if (d.type === 'opening') {
      const o = room.openings.find((o) => o.id === d.id)
      if (!o) return
      const w = walls[o.wall]
      const along = (p.x - w.start.x) * w.dir.x + (p.z - w.start.z) * w.dir.z
      updateOpening(o.id, { offset: along })
    } else if (d.type === 'furniture') {
      const item = furniture.find((f) => f.id === d.id)
      if (!item) return
      updateFurniture(item.id, placeAt(item, { x: p.x + d.offset.x, z: p.z + d.offset.z }, room, furniture))
    }
  }

  const endDrag = () => {
    if (drag.current?.type === 'corner') {
      // Normalize the winding once the drag is over (dragging can flip the outline inside out).
      setCorners(useStore.getState().project.room.corners)
    }
    drag.current = null
  }

  const startDrag = (e: RPointerEvent, d: Drag) => {
    if (tool !== 'select' || e.button !== 0) return
    e.stopPropagation()
    checkpoint()
    drag.current = d
    svgRef.current!.setPointerCapture(e.pointerId)
  }

  // Keyboard: Enter/Escape for drawing, Delete for the selected corner or opening.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      if (tool === 'draw') {
        if (e.key === 'Enter') finishDraft()
        if (e.key === 'Escape') setDraft([])
        if (e.key === 'Backspace') setDraft((d) => d.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const applyCalibration = () => {
    const real = parseFloat(calibInput) / 100
    if (calib.length < 2 || !(real > 0)) return
    const measured = dist(calib[0], calib[1])
    const f = real / measured
    const sc = (p: Vec2) => ({ x: p.x * f, z: p.z * f })
    checkpoint()
    setProject({
      ...project,
      planImage: planImage ? { ...planImage, scale: planImage.scale * f, origin: sc(planImage.origin) } : null,
      room: { ...room, corners: room.corners.map(sc), openings: room.openings.map((o) => ({ ...o, offset: o.offset * f })) },
      furniture: furniture.map((it) => ({ ...it, position: sc(it.position) })),
    })
    setView((v) => ({ ...v, s: v.s / f }))
    setCalib([])
    setCalibInput('')
    setTool('select')
  }

  // Grid lines every 50 cm (1 m emphasized), only across the visible area.
  const grid = useMemo(() => {
    const tl = toWorld(0, 0)
    const br = toWorld(size.w, size.h)
    const step = view.s > 40 ? 0.5 : 1
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = []
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
      const sx = x * view.s + view.tx
      lines.push({ x1: sx, y1: 0, x2: sx, y2: size.h, major: Math.abs(x - Math.round(x)) < 1e-6 })
    }
    for (let z = Math.floor(tl.z / step) * step; z <= br.z; z += step) {
      const sy = z * view.s + view.ty
      lines.push({ x1: 0, y1: sy, x2: size.w, y2: sy, major: Math.abs(z - Math.round(z)) < 1e-6 })
    }
    return lines
  }, [view, size])

  const hoverWall = cursor && (tool === 'door' || tool === 'window') ? wallUnder(cursor) : null
  const outline = room.corners.map(toScreen)
  const c = toScreen(centroid(room.corners))

  return (
    <div className="plan-editor">
      <svg
        ref={svgRef}
        className={`plan-svg tool-${tool}`}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setCursor(null)}
        onWheel={onWheel}
        onDoubleClick={() => tool === 'draw' && finishDraft()}
      >
        {grid.map(({ major, ...l }, i) => (
          <line key={i} {...l} className={major ? 'grid major' : 'grid'} />
        ))}

        {planImage && (
          <image
            href={planImage.dataUrl}
            x={planImage.origin.x * view.s + view.tx}
            y={planImage.origin.z * view.s + view.ty}
            width={planImage.width * planImage.scale * view.s}
            height={planImage.height * planImage.scale * view.s}
            opacity={0.55}
            preserveAspectRatio="none"
            pointerEvents="none"
          />
        )}

        {/* Room fill and walls */}
        <polygon points={outline.map((p) => `${p.x},${p.y}`).join(' ')} className="room-fill" />
        {walls.map((w) => {
          const a = toScreen(w.start)
          const b = toScreen(w.end)
          const t = room.wallThickness * view.s
          const ox = -w.inward.x * t
          const oy = -w.inward.z * t
          const selected = selection?.type === 'wall' && selection.index === w.index
          const mid = { x: (a.x + b.x) / 2 - w.inward.x * (t + 14), y: (a.y + b.y) / 2 - w.inward.z * (t + 14) }
          return (
            <g key={w.index}>
              <polygon
                points={`${a.x},${a.y} ${b.x},${b.y} ${b.x + ox},${b.y + oy} ${a.x + ox},${a.y + oy}`}
                className={selected ? 'wall selected' : 'wall'}
                onPointerDown={(e) => {
                  if (tool !== 'select' || e.button !== 0) return
                  e.stopPropagation()
                  select({ type: 'wall', index: w.index })
                }}
              />
              <text x={mid.x} y={mid.y} className="dim" textAnchor="middle" dominantBaseline="middle">
                {cm(w.length)}
              </text>
            </g>
          )
        })}

        {/* Doors and windows */}
        {room.openings.map((o) => {
          const w = walls[o.wall]
          if (!w) return null
          const p0 = toScreen({ x: w.start.x + w.dir.x * (o.offset - o.width / 2), z: w.start.z + w.dir.z * (o.offset - o.width / 2) })
          const p1 = toScreen({ x: w.start.x + w.dir.x * (o.offset + o.width / 2), z: w.start.z + w.dir.z * (o.offset + o.width / 2) })
          const t = room.wallThickness * view.s
          const selected = selection?.type === 'opening' && selection.id === o.id
          const swing = o.width * view.s
          return (
            <g
              key={o.id}
              className={`opening ${o.kind}${selected ? ' selected' : ''}`}
              onPointerDown={(e) => {
                if (tool !== 'select') return
                select({ type: 'opening', id: o.id })
                startDrag(e, { type: 'opening', id: o.id })
              }}
            >
              <polygon
                points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p1.x - w.inward.x * t},${p1.y - w.inward.z * t} ${p0.x - w.inward.x * t},${p0.y - w.inward.z * t}`}
              />
              {o.kind === 'door' ? (
                <path
                  className="swing"
                  d={`M ${p0.x} ${p0.y} L ${p0.x + w.inward.x * swing} ${p0.y + w.inward.z * swing} A ${swing} ${swing} 0 0 ${1} ${p1.x} ${p1.y}`}
                />
              ) : (
                <line x1={p0.x - (w.inward.x * t) / 2} y1={p0.y - (w.inward.z * t) / 2} x2={p1.x - (w.inward.x * t) / 2} y2={p1.y - (w.inward.z * t) / 2} className="glass" />
              )}
            </g>
          )
        })}

        {/* Furniture footprints */}
        {furniture.map((f) => {
          const pts = footprint(f).map(toScreen)
          const center = toScreen(f.position)
          const selected = selection?.type === 'furniture' && selection.id === f.id
          return (
            <g
              key={f.id}
              className={`fp${selected ? ' selected' : ''}`}
              onPointerDown={(e) => {
                if (tool !== 'select') return
                select({ type: 'furniture', id: f.id })
                const p = eventWorld(e)
                startDrag(e, { type: 'furniture', id: f.id, offset: { x: f.position.x - p.x, z: f.position.z - p.z } })
              }}
            >
              <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
              {view.s * Math.min(f.size.w, f.size.d) > 26 && (
                <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle">
                  {f.name}
                </text>
              )}
            </g>
          )
        })}

        {/* Corners */}
        {tool === 'select' &&
          outline.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={selection?.type === 'corner' && selection.index === i ? 8 : 6}
              className={selection?.type === 'corner' && selection.index === i ? 'corner selected' : 'corner'}
              onPointerDown={(e) => {
                select({ type: 'corner', index: i })
                startDrag(e, { type: 'corner', index: i })
              }}
            />
          ))}
        {tool === 'select' && (
          <text x={c.x} y={c.y} className="room-label" textAnchor="middle">
            {room.name}
          </text>
        )}

        {/* Opening placement preview */}
        {hoverWall && (
          <circle cx={toScreen(hoverWall.point).x} cy={toScreen(hoverWall.point).y} r={7} className="ghost" />
        )}

        {/* Drawing preview */}
        {tool === 'draw' && draft.length > 0 && (
          <g className="draft">
            <polyline points={[...draft.map(toScreen), ...(cursor ? [toScreen(snap(cursor, [draft[draft.length - 1], draft[0]]))] : [])].map((p) => `${p.x},${p.y}`).join(' ')} />
            {draft.map((p, i) => {
              const s = toScreen(p)
              return <circle key={i} cx={s.x} cy={s.y} r={i === 0 ? 8 : 5} className={i === 0 ? 'first' : ''} />
            })}
            {cursor && (
              <text x={toScreen(cursor).x + 12} y={toScreen(cursor).y - 12} className="dim">
                {cm(dist(draft[draft.length - 1], snap(cursor, [draft[draft.length - 1], draft[0]])))} cm
              </text>
            )}
          </g>
        )}

        {/* Calibration line */}
        {tool === 'calibrate' && calib.length > 0 && (
          <g className="calib">
            {(() => {
              const a = toScreen(calib[0])
              const b = toScreen(calib[1] ?? cursor ?? calib[0])
              return (
                <>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                  <circle cx={a.x} cy={a.y} r={5} />
                  <circle cx={b.x} cy={b.y} r={5} />
                </>
              )
            })()}
          </g>
        )}
      </svg>

      {tool === 'calibrate' && calib.length === 2 && (
        <form
          className="calib-input"
          style={{ left: toScreen(calib[1]).x + 14, top: toScreen(calib[1]).y + 14 }}
          onSubmit={(e) => {
            e.preventDefault()
            applyCalibration()
          }}
        >
          <label>
            실제 길이
            <input autoFocus inputMode="decimal" value={calibInput} onChange={(e) => setCalibInput(e.target.value)} placeholder="예: 340" />
            cm
          </label>
          <button type="submit">적용</button>
        </form>
      )}

      <div className="plan-hint">
        {tool === 'draw' && '방 모서리를 차례로 클릭하세요. 첫 점을 다시 클릭하거나 Enter로 완성해요. (Backspace: 한 점 취소)'}
        {tool === 'calibrate' && (calib.length < 2 ? '길이를 아는 두 점을 클릭하세요. 예: 도면에 적힌 벽 치수의 양 끝' : '두 점 사이의 실제 길이를 입력하세요')}
        {(tool === 'door' || tool === 'window') && `${tool === 'door' ? '문' : '창문'}을 넣을 벽을 클릭하세요`}
        {tool === 'select' && '모서리·문·가구를 드래그해서 옮겨요. 빈 곳을 드래그하면 화면 이동, 휠로 확대/축소'}
      </div>
      <div className="plan-zoom">
        <button onClick={() => setView((v) => ({ ...v, s: Math.min(800, v.s * 1.25), tx: size.w / 2 - (size.w / 2 - v.tx) * 1.25, ty: size.h / 2 - (size.h / 2 - v.ty) * 1.25 }))}>+</button>
        <button onClick={() => setView((v) => ({ ...v, s: Math.max(8, v.s / 1.25), tx: size.w / 2 - (size.w / 2 - v.tx) / 1.25, ty: size.h / 2 - (size.h / 2 - v.ty) / 1.25 }))}>−</button>
        <button onClick={fit} title="화면에 맞추기">⤢</button>
        {planImage && (
          <button onClick={() => { checkpoint(); setPlanImage(null) }}>
            도면 이미지 지우기
          </button>
        )}
      </div>
    </div>
  )
}
