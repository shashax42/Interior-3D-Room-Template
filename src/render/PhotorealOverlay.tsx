import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import type { ViewHandle } from '../scene/Viewport'
import { centroid } from '../geometry/plan'
import { mountOf } from '../furniture/catalog'
import { buildTraceScene, equirectCameraAt, startTrace, type TraceJob } from './photoreal'
import { denoiseCanvas, denoiserAvailable, warmUpDenoiser } from './denoise'
import { AiPhotoOverlay } from './AiPhotoOverlay'
import { canvasToJpeg } from './aiPhoto'

export type PhotorealMode = 'view' | 'pano'

// With the AI denoiser a few dozen samples are enough; without it the image needs many more to clear up.
const SAMPLES = denoiserAvailable() ? { view: 96, pano: 72 } : { view: 360, pano: 260 }

type Phase = 'tracing' | 'denoising' | 'done'

/**
 * Full-screen photoreal render of the current view (or a 360° panorama from where you stand).
 * The picture starts grainy, clears up as more light paths are traced, and is then cleaned by the denoiser.
 */
export function PhotorealOverlay({ view, mode, onClose }: { view: ViewHandle; mode: PhotorealMode; onClose: () => void }) {
  const room = useStore((s) => s.project.room)
  const furniture = useStore((s) => s.project.furniture)
  const addPanorama = useStore((s) => s.addPanorama)
  const holder = useRef<HTMLDivElement>(null)
  const job = useRef<TraceJob | null>(null)
  const shown = useRef<HTMLCanvasElement | null>(null)
  const [samples, setSamples] = useState(0)
  const [phase, setPhase] = useState<Phase>('tracing')
  const [saved, setSaved] = useState(false)
  const [exposure, setExposure] = useState(1)
  const [ai, setAi] = useState<{ layout: string; width: number; height: number } | null>(null)
  const target = SAMPLES[mode]

  const show = (canvas: HTMLCanvasElement) => {
    canvas.className = mode === 'pano' ? 'trace-canvas pano' : 'trace-canvas'
    shown.current?.remove()
    holder.current?.appendChild(canvas)
    shown.current = canvas
  }

  const finish = async () => {
    const j = job.current
    if (!j) return
    if (!denoiserAvailable()) {
      setPhase('done')
      return
    }
    setPhase('denoising')
    try {
      show(await denoiseCanvas(j.canvas))
    } catch {
      // No WebGPU after all, or the model failed to load: keep the traced image as it is.
      show(j.canvas)
    }
    setPhase('done')
  }

  useEffect(() => {
    warmUpDenoiser()
    const hasFixture = furniture.some((f) => mountOf(f) === 'ceiling')
    const c = centroid(room.corners)
    const scene = buildTraceScene(view.scene, {
      daylight: 1.2,
      ceilingLight: hasFixture ? undefined : { x: c.x, z: c.z, height: room.height, size: 0.5, intensity: 9 },
    })
    const box = holder.current!.getBoundingClientRect()
    let camera: THREE.Camera
    let width: number
    let height: number
    if (mode === 'pano') {
      camera = equirectCameraAt(view.camera.position)
      width = 2048
      height = 1024
    } else {
      // Match the live view's framing at a resolution the GPU can clear up in a reasonable time.
      const aspect = view.camera.aspect
      width = Math.round(Math.min(1280, box.width, box.height * aspect))
      height = Math.round(width / aspect)
      const cam = view.camera.clone()
      cam.updateProjectionMatrix()
      camera = cam
    }
    const j = startTrace({
      scene,
      camera,
      width,
      height,
      samples: target,
      onProgress: setSamples,
      onDone: () => void finish(),
    })
    job.current = j
    show(j.canvas)
    return () => {
      j.stop()
      shown.current?.remove()
    }
    // Render once per opening; the scene is a snapshot.
  }, [])

  // Brightness: re-expose the traced image, then denoise again once the slider settles.
  useEffect(() => {
    const j = job.current
    if (!j) return
    j.setExposure(exposure)
    if (phase !== 'done' || !denoiserAvailable()) return
    const t = setTimeout(() => {
      show(j.canvas)
      void finish()
    }, 450)
    return () => clearTimeout(t)
  }, [exposure])

  const result = () => shown.current ?? job.current!.canvas

  const download = () => {
    const a = document.createElement('a')
    a.href = result().toDataURL('image/jpeg', 0.95)
    a.download = `${room.name || 'room'}${mode === 'pano' ? '-360' : ''}.jpg`
    a.click()
  }

  const keepPano = () => {
    const p = view.camera.position
    addPanorama({ position: { x: p.x, y: p.y, z: p.z }, dataUrl: result().toDataURL('image/jpeg', 0.9) })
    setSaved(true)
  }

  const pct = Math.min(100, Math.round((samples / target) * 100))
  const label = phase === 'tracing' ? `빛 계산 중… ${pct}%` : phase === 'denoising' ? 'AI로 노이즈 정리 중…' : '완성!'
  return (
    <div className="trace-overlay" role="dialog" aria-label="실사 렌더">
      <div className="trace-stage" ref={holder} />
      <div className="trace-bar">
        <div className="trace-progress">
          <div className="fill" style={{ width: `${phase === 'tracing' ? pct : 100}%` }} />
          <span>{label}</span>
        </div>
        <label className="trace-exposure">
          밝기
          <input type="range" min={0.4} max={2.2} step={0.05} value={exposure} onChange={(e) => setExposure(parseFloat(e.target.value))} />
        </label>
        {mode === 'pano' && (
          <button className="btn primary" disabled={phase !== 'done' || saved} onClick={keepPano}>
            {saved ? 'VR 투어에 추가됨 ✓' : 'VR 투어에 추가'}
          </button>
        )}
        {mode === 'view' && (
          <button
            className="btn primary"
            disabled={phase !== 'done'}
            onClick={() => {
              const c = result()
              setAi({ layout: canvasToJpeg(c), width: c.width, height: c.height })
            }}
          >
            📸 AI로 사진처럼
          </button>
        )}
        <button className="btn" disabled={phase === 'denoising'} onClick={download}>이미지 저장</button>
        <button className="btn" onClick={onClose}>닫기</button>
      </div>
      {ai && <AiPhotoOverlay {...ai} onClose={() => setAi(null)} />}
      {phase === 'tracing' && samples < 6 && <p className="trace-hint">처음엔 자글자글하다가 점점 선명해져요. 보통 30초~2분 걸려요.</p>}
    </div>
  )
}
