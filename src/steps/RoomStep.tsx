import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { Opening, Vec2 } from '../types'
import { add, centroid, rectangleCorners, scale, wallSegments } from '../geometry/plan'
import { PlanEditor, type PlanTool } from '../plan/PlanEditor'
import { Viewport } from '../scene/Viewport'
import { readImage } from '../photo/imageFile'
import { CmField, ColorField, Section } from '../ui/fields'

function SelectionPanel() {
  const room = useStore((s) => s.project.room)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const checkpoint = useStore((s) => s.checkpoint)
  const updateRoom = useStore((s) => s.updateRoom)
  const updateOpening = useStore((s) => s.updateOpening)
  const removeOpening = useStore((s) => s.removeOpening)
  const walls = wallSegments(room.corners)
  const n = room.corners.length

  if (selection?.type === 'wall') {
    const w = walls[selection.index]
    if (!w) return null
    const setLength = (len: number) => {
      checkpoint()
      const corners = [...room.corners]
      corners[(w.index + 1) % n] = add(w.start, scale(w.dir, len))
      updateRoom({ corners })
    }
    const split = () => {
      checkpoint()
      const mid: Vec2 = add(w.start, scale(w.dir, w.length / 2))
      const corners = [...room.corners.slice(0, w.index + 1), mid, ...room.corners.slice(w.index + 1)]
      const openings = room.openings.map((o): Opening => {
        if (o.wall > w.index) return { ...o, wall: o.wall + 1 }
        if (o.wall === w.index && o.offset > w.length / 2) return { ...o, wall: o.wall + 1, offset: o.offset - w.length / 2 }
        return o
      })
      updateRoom({ corners, openings })
      select({ type: 'corner', index: w.index + 1 })
    }
    return (
      <Section title={`벽 ${w.index + 1}`} hint="길이를 바꾸면 벽 끝 모서리가 움직여요.">
        <CmField label="길이" value={w.length} onChange={setLength} min={20} />
        <button className="btn" onClick={split}>가운데에 모서리 추가</button>
      </Section>
    )
  }

  if (selection?.type === 'corner') {
    const remove = () => {
      if (n <= 3) return
      checkpoint()
      const i = selection.index
      const corners = room.corners.filter((_, k) => k !== i)
      // Wall i disappears into wall i-1; later walls shift down by one.
      const openings = room.openings
        .filter((o) => o.wall !== i)
        .map((o) => (o.wall > i ? { ...o, wall: o.wall - 1 } : o))
      updateRoom({ corners, openings })
      select(null)
    }
    return (
      <Section title={`${selection.index + 1}번 모서리`}>
        <button className="btn danger" disabled={n <= 3} onClick={remove}>모서리 삭제</button>
      </Section>
    )
  }

  if (selection?.type === 'opening') {
    const o = room.openings.find((o) => o.id === selection.id)
    if (!o) return null
    const set = (patch: Partial<Opening>) => {
      checkpoint()
      updateOpening(o.id, patch)
    }
    return (
      <Section title={o.kind === 'door' ? '문' : '창문'}>
        <div className="seg">
          <button className={o.kind === 'door' ? 'on' : ''} onClick={() => set({ kind: 'door', sill: 0, height: 2.1 })}>문</button>
          <button className={o.kind === 'window' ? 'on' : ''} onClick={() => set({ kind: 'window', sill: 0.8, height: 1.3 })}>창문</button>
        </div>
        <CmField label="폭" value={o.width} onChange={(width) => set({ width })} min={30} />
        <CmField label="높이" value={o.height} onChange={(height) => set({ height })} min={30} />
        {o.kind === 'window' && <CmField label="바닥에서" value={o.sill} onChange={(sill) => set({ sill })} min={0} />}
        <CmField label="벽 시작점에서" value={o.offset} onChange={(offset) => set({ offset })} min={0} />
        <button className="btn danger" onClick={() => { checkpoint(); removeOpening(o.id); select(null) }}>삭제</button>
      </Section>
    )
  }
  return null
}

function RoomSide({ tool, setTool }: { tool: PlanTool; setTool: (t: PlanTool) => void }) {
  const room = useStore((s) => s.project.room)
  const planImage = useStore((s) => s.project.planImage)
  const checkpoint = useStore((s) => s.checkpoint)
  const updateRoom = useStore((s) => s.updateRoom)
  const setCorners = useStore((s) => s.setCorners)
  const setPlanImage = useStore((s) => s.setPlanImage)
  const [w, setW] = useState(4.2)
  const [d, setD] = useState(3.4)
  const fileRef = useRef<HTMLInputElement>(null)

  const makeRect = () => {
    checkpoint()
    updateRoom({ openings: [] })
    setCorners(rectangleCorners(w, d))
  }

  const onPlanFile = async (file: File) => {
    const img = await readImage(file, 2400)
    // Start at 1 px = 1 cm, which is close for most exported floor plans; calibration fixes it exactly.
    const s = 0.01
    const c = centroid(room.corners)
    checkpoint()
    setPlanImage({ ...img, scale: s, origin: { x: c.x - (img.width * s) / 2, z: c.z - (img.height * s) / 2 } })
    setTool('calibrate')
  }

  const tools: { id: PlanTool; label: string }[] = [
    { id: 'select', label: '선택·이동' },
    { id: 'door', label: '문 추가' },
    { id: 'window', label: '창문 추가' },
  ]

  return (
    <>
      <Section title="1. 방 모양 만들기" hint="셋 중 편한 방법으로 시작하세요. 나중에 모서리를 드래그해서 고칠 수 있어요.">
        <div className="card">
          <strong>치수로</strong>
          <div className="row">
            <CmField label="가로" value={w} onChange={setW} min={100} />
            <CmField label="세로" value={d} onChange={setD} min={100} />
          </div>
          <button className="btn" onClick={makeRect}>사각형 방 만들기</button>
        </div>
        <div className="card">
          <strong>도면 이미지로</strong>
          <p className="hint">분양 도면·매물 도면 이미지를 올리고, 치수가 적힌 벽으로 축척을 맞춘 뒤 따라 그려요.</p>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onPlanFile(e.target.files[0])} />
          <div className="row">
            <button className="btn" onClick={() => fileRef.current?.click()}>{planImage ? '다른 도면 올리기' : '도면 올리기'}</button>
            {planImage && <button className={tool === 'calibrate' ? 'btn on' : 'btn'} onClick={() => setTool('calibrate')}>축척 맞추기</button>}
          </div>
        </div>
        <div className="card">
          <strong>직접 그리기</strong>
          <button className={tool === 'draw' ? 'btn on' : 'btn'} onClick={() => setTool('draw')}>모서리 찍어서 그리기</button>
        </div>
      </Section>

      <Section title="2. 문·창문">
        <div className="seg">
          {tools.map((t) => (
            <button key={t.id} className={tool === t.id ? 'on' : ''} onClick={() => setTool(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      <SelectionPanel />

      <Section title="3. 방 정보">
        <label className="field">
          <span>이름</span>
          <input value={room.name} onChange={(e) => updateRoom({ name: e.target.value })} />
        </label>
        <CmField label="천장 높이" value={room.height} onChange={(height) => { checkpoint(); updateRoom({ height }) }} min={180} max={600} />
        <CmField label="벽 두께" value={room.wallThickness} onChange={(wallThickness) => { checkpoint(); updateRoom({ wallThickness }) }} min={5} max={60} />
      </Section>

      <Section title="4. 벽지·바닥">
        <ColorField label="벽" value={room.wall.color} onChange={(color) => updateRoom({ wall: { ...room.wall, color } })} />
        <ColorField label="바닥" value={room.floor.color} onChange={(color) => updateRoom({ floor: { ...room.floor, color } })} />
        <ColorField label="천장" value={room.ceiling.color} onChange={(color) => updateRoom({ ceiling: { ...room.ceiling, color } })} />
      </Section>
    </>
  )
}

function RoomMain({ tool, setTool }: { tool: PlanTool; setTool: (t: PlanTool) => void }) {
  return (
    <div className="split">
      <div className="split-plan">
        <PlanEditor tool={tool} setTool={setTool} />
      </div>
      <div className="split-3d">
        <Viewport mode="orbit" editable={false} />
        <span className="badge">3D 미리보기</span>
      </div>
    </div>
  )
}

export function RoomStep() {
  const [tool, setTool] = useState<PlanTool>('select')
  return (
    <>
      <aside className="side">
        <RoomSide tool={tool} setTool={setTool} />
      </aside>
      <main className="main">
        <RoomMain tool={tool} setTool={setTool} />
      </main>
    </>
  )
}
