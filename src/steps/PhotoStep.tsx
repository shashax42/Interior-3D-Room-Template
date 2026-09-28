import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { RoomPhoto } from '../types'
import { solveCamera, type SolveResult } from '../geometry/cameraSolve'
import { centroid } from '../geometry/plan'
import { PhotoMatch } from '../photo/PhotoMatch'
import { handleLabel, roomHandles } from '../photo/handles'
import { readImage } from '../photo/imageFile'
import { Section } from '../ui/fields'

export type PhotoSolveState = { photoId: string; result: SolveResult | null; fit: boolean }

function MiniPlan({ activeCorner }: { activeCorner: number | null }) {
  const room = useStore((s) => s.project.room)
  const xs = room.corners.map((c) => c.x)
  const zs = room.corners.map((c) => c.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const pad = 0.6
  const vb = `${minX - pad} ${minZ - pad} ${maxX - minX + pad * 2} ${maxZ - minZ + pad * 2}`
  const u = Math.max(maxX - minX, maxZ - minZ) / 20
  return (
    <svg className="mini-plan" viewBox={vb}>
      <polygon points={room.corners.map((c) => `${c.x},${c.z}`).join(' ')} style={{ strokeWidth: u * 0.3 }} />
      {room.corners.map((c, i) => (
        <g key={i} className={activeCorner === i ? 'on' : ''}>
          <circle cx={c.x} cy={c.z} r={u * 1.1} />
          <text x={c.x} y={c.z} fontSize={u * 1.2} textAnchor="middle" dominantBaseline="central">{i + 1}</text>
        </g>
      ))}
    </svg>
  )
}

function PhotoSide({ photo, setSelectedId, active, setActive, solve, setSolve, onPreview }: {
  photo: RoomPhoto | null
  setSelectedId: (id: string | null) => void
  active: string | null
  setActive: (id: string | null) => void
  solve: PhotoSolveState | null
  setSolve: (s: PhotoSolveState | null) => void
  onPreview: (photo: RoomPhoto) => void
}) {
  const room = useStore((s) => s.project.room)
  const photos = useStore((s) => s.project.photos)
  const addPhoto = useStore((s) => s.addPhoto)
  const updatePhoto = useStore((s) => s.updatePhoto)
  const removePhoto = useStore((s) => s.removePhoto)
  const setCorners = useStore((s) => s.setCorners)
  const checkpoint = useStore((s) => s.checkpoint)
  const fileRef = useRef<HTMLInputElement>(null)
  const handles = useMemo(() => roomHandles(room), [room])

  const onFiles = async (files: FileList) => {
    let last: string | null = null
    for (const f of Array.from(files)) {
      const img = await readImage(f)
      last = addPhoto({ ...img, camera: null, pins: {}, projected: true })
    }
    if (last) setSelectedId(last)
  }

  const pinCount = photo ? Object.keys(photo.pins).length : 0
  const fit = solve?.photoId === photo?.id && solve?.fit
  const need = fit ? 5 : 4
  const result = solve && solve.photoId === photo?.id ? solve.result : null
  const stretch = fit && result ? result.stretch : null

  const applyStretch = () => {
    if (!photo || !stretch) return
    checkpoint()
    const c = centroid(room.corners)
    setCorners(room.corners.map((p) => ({ x: c.x + (p.x - c.x) * stretch.x, z: c.z + (p.z - c.z) * stretch.z })))
    const res = solveCamera(
      Object.entries(photo.pins).flatMap(([id, pixel]) => {
        const h = handles.find((h) => h.id === id)
        if (!h) return []
        const [x, y, z] = h.world
        return [{ world: [c.x + (x - c.x) * stretch.x, y, c.z + (z - c.z) * stretch.z] as [number, number, number], pixel }]
      }),
      photo.width,
      photo.height,
      room.corners.map((p) => ({ x: c.x + (p.x - c.x) * stretch.x, z: c.z + (p.z - c.z) * stretch.z })),
    )
    if (res) updatePhoto(photo.id, { camera: res.camera })
    setSolve({ photoId: photo.id, result: res, fit: false })
  }

  return (
    <>
      <Section title="방 사진" hint="이사 갈 방의 빈 방 사진(매물 사진)을 올리세요. 여러 장이면 각도마다 맞춰서 더 넓게 입혀져요.">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
        <button className="btn primary" onClick={() => fileRef.current?.click()}>사진 올리기</button>
        <div className="thumbs">
          {photos.map((p) => (
            <button key={p.id} className={p.id === photo?.id ? 'thumb on' : 'thumb'} onClick={() => setSelectedId(p.id)}>
              <img src={p.dataUrl} alt="" />
              <span>{p.camera ? '맞춤 완료' : `모서리 ${Object.keys(p.pins).length}/4`}</span>
            </button>
          ))}
        </div>
      </Section>

      {photo && (
        <>
          <Section
            title="사진에 모서리 찍기"
            hint={<>아래에서 모서리를 고르고, 사진에서 그 모서리가 <b>바닥</b>이나 <b>천장</b>과 만나는 점을 클릭하세요. {need}개 이상 찍으면 3D 방이 사진에 맞춰져요.</>}
          >
            <MiniPlan activeCorner={active ? handles.find((h) => h.id === active)?.corner ?? null : null} />
            <div className="handle-grid">
              {room.corners.map((_, i) => (
                <div key={i} className="handle-row">
                  <span className="num">{i + 1}</span>
                  {(['f', 'c'] as const).map((lv) => {
                    const id = `${lv}${i}`
                    const pinned = !!photo.pins[id]
                    return (
                      <button
                        key={id}
                        className={`chip ${lv === 'f' ? 'floor' : 'ceiling'}${active === id ? ' on' : ''}${pinned ? ' pinned' : ''}`}
                        onClick={() => setActive(active === id ? null : id)}
                        title={handleLabel({ corner: i, level: lv === 'f' ? 'floor' : 'ceiling' })}
                      >
                        {lv === 'f' ? '바닥' : '천장'}
                        {pinned && ' ✓'}
                      </button>
                    )
                  })}
                  {(photo.pins[`f${i}`] || photo.pins[`c${i}`]) && (
                    <button
                      className="link"
                      onClick={() => {
                        const pins = { ...photo.pins }
                        delete pins[`f${i}`]
                        delete pins[`c${i}`]
                        updatePhoto(photo.id, { pins, camera: Object.keys(pins).length >= 4 ? photo.camera : null })
                      }}
                    >
                      지우기
                    </button>
                  )}
                </div>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={!!fit}
                onChange={(e) => setSolve({ photoId: photo.id, result, fit: e.target.checked })}
              />
              방 크기를 몰라요 — 사진으로 가로·세로 추정 (천장 높이 기준, 모서리 5개 필요)
            </label>
          </Section>

          <Section title="맞춤 결과">
            {pinCount < need ? (
              <p className="hint">모서리를 {need - pinCount}개 더 찍어주세요.</p>
            ) : result ? (
              <>
                <p className={result.rmsPx < photo.height * 0.012 ? 'ok' : 'warn'}>
                  {result.rmsPx < photo.height * 0.012 ? '잘 맞았어요' : '조금 어긋나요 — 점 위치나 천장 높이를 확인해보세요'}
                  <small> (평균 오차 {result.rmsPx.toFixed(1)}px · 화각 {Math.round(result.camera.fov)}°)</small>
                </p>
                {stretch && (
                  <div className="card">
                    <p>
                      사진으로 추정한 방 크기에 맞추려면 가로 ×{stretch.x.toFixed(2)}, 세로 ×{stretch.z.toFixed(2)}배가 필요해요.
                    </p>
                    <button className="btn" onClick={applyStretch}>이 크기로 방 고치기</button>
                  </div>
                )}
              </>
            ) : (
              <p className="warn">맞출 수 없었어요. 찍은 점이 올바른 모서리인지 확인해주세요.</p>
            )}
            <label className="check">
              <input type="checkbox" checked={photo.projected} onChange={(e) => updatePhoto(photo.id, { projected: e.target.checked })} />
              3D 방에 이 사진 입히기
            </label>
            <div className="row">
              <button className="btn primary" disabled={!photo.camera} onClick={() => onPreview(photo)}>3D에서 이 시점으로 보기</button>
              <button className="btn danger" onClick={() => { removePhoto(photo.id); setSelectedId(null) }}>사진 삭제</button>
            </div>
          </Section>
        </>
      )}
    </>
  )
}

function PhotoMain({ photo, active, setActive, onSolve }: {
  photo: RoomPhoto | null
  active: string | null
  setActive: (id: string | null) => void
  onSolve: () => void
}) {
  const room = useStore((s) => s.project.room)
  const updatePhoto = useStore((s) => s.updatePhoto)
  if (!photo) {
    return (
      <div className="empty">
        <h2>실제 방 사진으로 3D 방을 똑같이 만들어요</h2>
        <p>왼쪽에서 빈 방 사진을 올리고, 사진 속 방 모서리 몇 개만 찍으면 사진이 3D 벽과 바닥에 그대로 입혀져요.</p>
      </div>
    )
  }
  return (
    <PhotoMatch
      photo={photo}
      room={room}
      activeHandle={active}
      onPin={(id, pixel) => {
        const latest = useStore.getState().project.photos.find((p) => p.id === photo.id)
        updatePhoto(photo.id, { pins: { ...(latest?.pins ?? {}), [id]: pixel } })
        if (active === id) setActive(null)
      }}
      onPinsCommitted={onSolve}
    />
  )
}

/** Solves the camera for a photo from its pins and stores it on the photo. */
function solvePhoto(photoId: string, fit: boolean): SolveResult | null {
  const { project, updatePhoto } = useStore.getState()
  const photo = project.photos.find((p) => p.id === photoId)
  if (!photo) return null
  const handles = roomHandles(project.room)
  const corrs = Object.entries(photo.pins).flatMap(([id, pixel]) => {
    const h = handles.find((h) => h.id === id)
    return h ? [{ world: h.world, pixel }] : []
  })
  const res = solveCamera(corrs, photo.width, photo.height, project.room.corners, { fitDimensions: fit })
  updatePhoto(photoId, { camera: res?.camera ?? null })
  return res
}

export function PhotoStep({ onPreview }: { onPreview: (photo: RoomPhoto) => void }) {
  const photos = useStore((s) => s.project.photos)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [solve, setSolveState] = useState<PhotoSolveState | null>(null)
  const photo = photos.find((p) => p.id === selectedId) ?? photos[0] ?? null
  const fit = solve?.photoId === photo?.id ? solve.fit : false

  const run = (photoId: string, fitDims: boolean) => setSolveState({ photoId, fit: fitDims, result: solvePhoto(photoId, fitDims) })

  // The room may have changed since the photo was last matched; re-solve whenever a photo is opened.
  const photoId = photo?.id
  useEffect(() => {
    if (photoId) run(photoId, false)
  }, [photoId])

  return (
    <>
      <aside className="side">
        <PhotoSide
          photo={photo}
          setSelectedId={(id) => {
            setSelectedId(id)
            setActive(null)
          }}
          active={active}
          setActive={setActive}
          solve={solve}
          setSolve={(s) => {
            if (s && photo && s.fit !== fit) run(photo.id, s.fit)
            else setSolveState(s)
          }}
          onPreview={onPreview}
        />
      </aside>
      <main className="main">
        <PhotoMain photo={photo} active={active} setActive={setActive} onSolve={() => photo && run(photo.id, fit)} />
      </main>
    </>
  )
}
