import { useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import type { FurnitureItem, RoomPhoto } from '../types'
import { CATALOG, CATEGORIES, isSmall, mountOf, type CatalogEntry, type Category } from '../furniture/catalog'
import { PRESETS, newItem, type Preset } from '../furniture/presets'
import { initialPlacement } from '../furniture/placement'
import { importModelFile } from '../furniture/CustomModel'
import { centroid } from '../geometry/plan'
import { Viewport, type ViewHandle } from '../scene/Viewport'
import { LOOKS, captureWithLook, lookById } from '../scene/filters'
import { CmField, ColorField, Section } from '../ui/fields'
import { PhotorealOverlay } from '../render/PhotorealOverlay'
import { AiPhotoOverlay } from '../render/AiPhotoOverlay'
import { snapshotForAi } from '../render/aiPhoto'

function ItemPanel({ item }: { item: FurnitureItem }) {
  const room = useStore((s) => s.project.room)
  const update = useStore((s) => s.updateFurniture)
  const remove = useStore((s) => s.removeFurniture)
  const add = useStore((s) => s.addFurniture)
  const select = useStore((s) => s.select)
  const checkpoint = useStore((s) => s.checkpoint)
  const set = (patch: Partial<FurnitureItem>) => {
    checkpoint()
    update(item.id, patch)
  }
  const mount = mountOf(item)
  const deg = Math.round(((((item.rotation * 180) / Math.PI) % 360) + 360) % 360)
  return (
    <Section title="선택한 가구">
      <label className="field">
        <span>이름</span>
        <input value={item.name} onChange={(e) => update(item.id, { name: e.target.value })} />
      </label>
      <div className="row3">
        <CmField label="가로" value={item.size.w} onChange={(w) => set({ size: { ...item.size, w } })} />
        <CmField label="깊이" value={item.size.d} onChange={(d) => set({ size: { ...item.size, d } })} />
        <CmField label="높이" value={item.size.h} onChange={(h) => set({ size: { ...item.size, h }, ...(mount === 'ceiling' ? { elevation: room.height - h } : {}) })} />
      </div>
      {mount === 'wall' && (
        <CmField label="바닥에서 높이" value={item.elevation} onChange={(elevation) => set({ elevation })} min={0} />
      )}
      {mount === 'floor' && (
        <div className="field">
          <span>회전 {deg}°</span>
          <div className="row">
            <button className="btn" onClick={() => set({ rotation: item.rotation + Math.PI / 12 })}>↺ 15°</button>
            <button className="btn" onClick={() => set({ rotation: item.rotation - Math.PI / 12 })}>↻ 15°</button>
            <button className="btn" onClick={() => set({ rotation: item.rotation + Math.PI / 2 })}>90°</button>
          </div>
        </div>
      )}
      {item.kind !== 'custom' && (
        <>
          <ColorField label="색상" value={item.color} onChange={(color) => update(item.id, { color })} />
          <ColorField label="포인트 색" value={item.accent} onChange={(accent) => update(item.id, { accent })} />
        </>
      )}
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            checkpoint()
            const { id: _id, ...rest } = item
            const id = add({ ...rest, position: { x: item.position.x + 0.3, z: item.position.z + 0.3 } })
            select({ type: 'furniture', id })
          }}
        >
          복제
        </button>
        <button className="btn danger" onClick={() => { checkpoint(); remove(item.id); select(null) }}>삭제</button>
      </div>
      <p className="hint">3D 화면에서 드래그해서 옮겨요. 벽 가까이 가져가면 벽에 붙어요. 단축키: Q/E 회전, Delete 삭제</p>
    </Section>
  )
}

export function DecorateStep({ photoView, setPhotoView, capture, lookId, setLookId }: {
  photoView: RoomPhoto | null
  setPhotoView: (p: RoomPhoto | null) => void
  capture: MutableRefObject<ViewHandle | null>
  lookId: string
  setLookId: (id: string) => void
}) {
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const addFurniture = useStore((s) => s.addFurniture)
  const select = useStore((s) => s.select)
  const checkpoint = useStore((s) => s.checkpoint)
  const setProject = useStore((s) => s.setProject)
  const [cat, setCat] = useState<Category>('프린세스')
  const [uploading, setUploading] = useState(false)
  const [tracing, setTracing] = useState(false)
  const [ai, setAi] = useState<{ layout: string; roomPhoto?: string; width: number; height: number } | null>(null)
  const openAi = async () => {
    const v = capture.current
    if (!v) return
    const shot = await snapshotForAi(v.snapshot, () => select(null))
    // Standing exactly where a room photo was taken: furnish that real photo instead of inventing the room.
    const cam = photoView?.camera
    const atPhoto = cam && v.camera.position.distanceTo(new THREE.Vector3(...cam.position)) < 0.05
    setAi({ ...shot, roomPhoto: atPhoto ? photoView!.dataUrl : undefined })
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const { room, furniture, photos } = project
  const selected = selection?.type === 'furniture' ? furniture.find((f) => f.id === selection.id) : undefined

  const addFromCatalog = (e: CatalogEntry) => {
    checkpoint()
    const base = { ...newItem(e), id: '' }
    const placed = initialPlacement(base, room, centroid(room.corners), furniture, selected)
    const id = addFurniture({ ...newItem(e), ...placed })
    select({ type: 'furniture', id })
  }

  const onModel = async (file: File) => {
    setUploading(true)
    try {
      const { modelId, size } = await importModelFile(file)
      checkpoint()
      const id = addFurniture({
        kind: 'custom',
        name: file.name.replace(/\.(glb|gltf)$/i, ''),
        modelId,
        size,
        position: centroid(room.corners),
        elevation: 0,
        rotation: 0,
        color: '#ffffff',
        accent: '#ffffff',
      })
      select({ type: 'furniture', id })
    } catch (err) {
      alert(`3D 파일을 읽지 못했어요: ${(err as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  const applyPreset = (p: Preset) => {
    if (furniture.length && !confirm(`지금 있는 가구를 지우고 "${p.name}" 스타일로 꾸밀까요? (되돌리기 가능)`)) return
    checkpoint()
    const preset = p.build(room)
    setProject({
      ...project,
      room: { ...room, ...preset.room },
      furniture: preset.furniture.map((f, i) => ({ ...f, id: `p${Date.now().toString(36)}${i}` })),
    })
    select(null)
  }

  const savePicture = () => {
    const canvas = capture.current?.snapshot()
    if (!canvas) return
    const a = document.createElement('a')
    a.href = captureWithLook(canvas, lookById(lookId))
    a.download = `${room.name || 'room'}.png`
    a.click()
  }

  return (
    <>
      <aside className="side">
        {selected && <ItemPanel item={selected} />}
        <Section
          title="가구 추가"
          hint={
            selected && !isSmall(selected)
              ? '캔들·인형·스탠드는 선택한 가구 위에 올라가요. 나머지는 방 가운데에 놓여요.'
              : '누르면 방 가운데에 놓여요. 실제 치수(cm)로 바꿀 수 있어요.'
          }
        >
          <div className="seg small">
            {CATEGORIES.map((c) => (
              <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="catalog">
            {CATALOG.filter((c) => c.category === cat).map((c) => (
              <button key={c.kind} className="catalog-item" onClick={() => addFromCatalog(c)}>
                <span className="dot" style={{ background: c.color, borderColor: c.accent }} />
                <span>{c.name}</span>
                <small>
                  {Math.round(c.size.w * 100)}×{Math.round(c.size.d * 100)}
                </small>
              </button>
            ))}
          </div>
          <input ref={fileRef} type="file" accept=".glb,.gltf,model/gltf-binary" hidden onChange={(e) => e.target.files?.[0] && onModel(e.target.files[0])} />
          <button className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? '불러오는 중…' : '내 3D 가구 파일 올리기 (.glb)'}
          </button>
        </Section>

        <Section title="스타일로 한 번에 꾸미기" hint="방 모양·문·창문에 맞춰 배치돼요. 그다음 하나씩 바꿔보세요.">
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} className={`preset preset-${p.id}`} onClick={() => applyPreset(p)}>
                <strong>{p.name}</strong>
                <small>{p.description}</small>
              </button>
            ))}
          </div>
        </Section>

        <Section title="시점">
          <div className="row wrap">
            <button className={!photoView ? 'btn on' : 'btn'} onClick={() => setPhotoView(null)}>전체 보기</button>
            {photos.filter((p) => p.camera).map((p, i) => (
              <button key={p.id} className={photoView?.id === p.id ? 'btn on' : 'btn'} onClick={() => setPhotoView(p)}>
                사진 {i + 1} 시점
              </button>
            ))}
          </div>
        </Section>

        <Section title="사진으로 뽑기">
          <div className="seg small">
            {LOOKS.map((l) => (
              <button key={l.id} className={lookId === l.id ? 'on' : ''} onClick={() => setLookId(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={openAi}>📸 사진처럼 만들기 (AI)</button>
          <p className="hint">
            눈높이 시점(룸투어, 또는 위의 "사진 시점")에서 누르면 진짜 찍은 사진처럼 나와요. 실제 방 사진 시점이면 그 사진 속 방에 가구를 들여요.
          </p>
          <div className="row">
            <button className="btn" onClick={() => capture.current && setTracing(true)}>✨ 실사 렌더</button>
            <button className="btn" onClick={savePicture}>화면 저장</button>
          </div>
        </Section>
      </aside>
      <main className="main">
        <Viewport mode="orbit" editable photoView={photoView} lookId={lookId} capture={capture} />
      </main>
      {tracing && capture.current && <PhotorealOverlay view={capture.current} mode="view" onClose={() => setTracing(false)} />}
      {ai && <AiPhotoOverlay {...ai} onClose={() => setAi(null)} />}
    </>
  )
}
