import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useStore } from '../store'
import type { Panorama } from '../types'

/** Shows one panorama around the camera and lets you look around by dragging (or scroll to zoom). */
function PanoView({ pano, others, onGo }: { pano: Panorama; others: Panorama[]; onGo: (p: Panorama) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const scene = useThree((s) => s.scene)
  const dom = useThree((s) => s.gl.domElement)
  const look = useRef({ yaw: 0, pitch: 0 })

  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(pano.dataUrl)
    t.mapping = THREE.EquirectangularReflectionMapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [pano.dataUrl])
  useEffect(() => {
    scene.background = texture
    return () => texture.dispose()
  }, [scene, texture])

  useEffect(() => {
    camera.position.set(pano.position.x, pano.position.y, pano.position.z)
  }, [camera, pano])

  useEffect(() => {
    let drag: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const k = (camera.fov / 75) * (e.pointerType === 'touch' ? 0.006 : 0.004)
      look.current.yaw -= (e.clientX - drag.x) * k
      look.current.pitch = Math.max(-1.35, Math.min(1.35, look.current.pitch - (e.clientY - drag.y) * k))
      drag = { x: e.clientX, y: e.clientY }
    }
    const up = () => {
      drag = null
    }
    const wheel = (e: WheelEvent) => {
      camera.fov = Math.max(35, Math.min(95, camera.fov + e.deltaY * 0.03))
      camera.updateProjectionMatrix()
    }
    dom.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    dom.addEventListener('wheel', wheel, { passive: true })
    return () => {
      dom.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      dom.removeEventListener('wheel', wheel)
    }
  }, [camera, dom])

  useFrame(() => {
    camera.rotation.set(-look.current.pitch, -look.current.yaw, 0, 'YXZ')
  })

  // Rings on the floor where the other 360° photos were taken, like the hotspots in real-estate VR tours.
  return (
    <>
      {others.map((o) => {
        const d = Math.hypot(o.position.x - pano.position.x, o.position.z - pano.position.z)
        const s = Math.min(1.4, 0.6 + d * 0.12)
        return (
          <group key={o.id} position={[o.position.x, 0.02, o.position.z]} scale={s}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={(e) => {
                e.stopPropagation()
                onGo(o)
              }}
              onPointerOver={() => (dom.style.cursor = 'pointer')}
              onPointerOut={() => (dom.style.cursor = '')}
            >
              <circleGeometry args={[0.28, 48]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.25} depthTest={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <ringGeometry args={[0.22, 0.28, 48]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

export function PanoTour({ onClose }: { onClose: () => void }) {
  const panoramas = useStore((s) => s.project.panoramas ?? [])
  const removePanorama = useStore((s) => s.removePanorama)
  const [currentId, setCurrentId] = useState(panoramas[0]?.id)
  const [fading, setFading] = useState(false)
  // Deleting takes two taps on the ×: the first arms it.
  const [armed, setArmed] = useState<string | null>(null)
  const current = panoramas.find((p) => p.id === currentId) ?? panoramas[0]

  const go = (p: Panorama) => {
    setFading(true)
    setTimeout(() => {
      setCurrentId(p.id)
      setTimeout(() => setFading(false), 60)
    }, 220)
  }

  if (!current) {
    return (
      <div className="pano-tour">
        <div className="empty">
          <h2>아직 360° 사진이 없어요</h2>
          <p>룸투어에서 원하는 자리에 서서 "여기서 360° 찍기"를 눌러주세요.</p>
          <button className="btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="pano-tour">
      <Canvas camera={{ fov: 75, near: 0.05, far: 100 }} style={{ touchAction: 'none' }}>
        <PanoView pano={current} others={panoramas.filter((p) => p.id !== current.id)} onGo={go} />
      </Canvas>
      <div className={fading ? 'pano-fade on' : 'pano-fade'} />
      <div className="tour-help">드래그로 둘러보기 · 바닥의 동그라미를 누르면 그 자리로 이동</div>
      <div className="pano-strip">
        {panoramas.map((p, i) => (
          <div key={p.id} className={p.id === current.id ? 'pano-thumb on' : 'pano-thumb'}>
            <button onClick={() => go(p)}>
              <img src={p.dataUrl} alt="" />
              <span>{i + 1}</span>
            </button>
            <button
              className={armed === p.id ? 'x armed' : 'x'}
              title={armed === p.id ? '한 번 더 누르면 지워져요' : '이 사진 지우기'}
              onClick={() => {
                if (armed === p.id) removePanorama(p.id)
                else setArmed(p.id)
              }}
            >
              {armed === p.id ? '삭제' : '×'}
            </button>
          </div>
        ))}
        <button className="btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
