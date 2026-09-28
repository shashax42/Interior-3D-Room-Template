import { useEffect, useMemo, useRef, useState, type ComponentRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useStore } from '../store'
import type { RoomPhoto, Vec2 } from '../types'
import { bounds, centroid, wallSegments } from '../geometry/plan'
import { RoomMesh } from './RoomMesh'
import { FurnitureLayer } from './FurnitureLayer'
import { Lighting } from './Lighting'
import { PhotoProjection } from './PhotoProjection'
import { TourControls } from './TourControls'
import { lookById } from './filters'

export type ViewMode = 'orbit' | 'tour'
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

function OrbitRig({ enabled, photo }: { enabled: boolean; photo: RoomPhoto | null }) {
  const room = useStore((s) => s.project.room)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const controls = useRef<OrbitControlsImpl>(null)
  const c = centroid(room.corners)
  const b = bounds(room.corners)
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ)
  const boundsKey = [b.minX, b.minZ, b.maxX, b.maxZ].map((v) => Math.round(v * 2)).join()

  // Start from a high three-quarter view, like looking into a dollhouse, or from a photo's viewpoint so the
  // 3D room can be compared with the real one.
  useEffect(() => {
    if (photo?.camera) {
      const cam = photo.camera
      camera.position.set(...cam.position)
      camera.rotation.set(cam.rotation[0], cam.rotation[1], cam.rotation[2], 'YXZ')
      camera.fov = cam.fov
      camera.updateProjectionMatrix()
      const fwd = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation)
      controls.current?.target.copy(camera.position).addScaledVector(fwd, 1.5)
    } else {
      camera.fov = 45
      // Back off far enough that the whole room fits the narrower of the two view angles.
      const vfov = (camera.fov * Math.PI) / 180
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
      const dist = (span * 0.62 + 0.4) / Math.tan(Math.min(vfov, hfov) / 2)
      const dir = new THREE.Vector3(0.62, 0.85, 0.78).normalize()
      camera.position.set(c.x + dir.x * dist, 0.6 + dir.y * dist, c.z + dir.z * dist)
      camera.updateProjectionMatrix()
      controls.current?.target.set(c.x, 0.6, c.z)
    }
    controls.current?.update()
    // Small room edits should not move the camera; switching viewpoints or reshaping the room does.
  }, [photo, camera, boundsKey, aspect > 1])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={enabled}
      enableDamping
      dampingFactor={0.12}
      minDistance={0.3}
      maxDistance={span * 4 + 6}
      maxPolarAngle={Math.PI * 0.495}
    />
  )
}

function CaptureBridge({ capture }: { capture?: MutableRefObject<(() => HTMLCanvasElement) | null> }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (!capture) return
    capture.current = () => {
      gl.render(scene, camera)
      return gl.domElement
    }
    return () => {
      capture.current = null
    }
  }, [capture, gl, scene, camera])
  return null
}

/** Where the tour starts: just inside the first door, or the middle of the room. */
function tourStart(room: ReturnType<typeof useStore.getState>['project']['room']): Vec2 | undefined {
  const door = room.openings.find((o) => o.kind === 'door')
  if (!door) return undefined
  const w = wallSegments(room.corners)[door.wall]
  return { x: w.start.x + w.dir.x * door.offset + w.inward.x * 0.7, z: w.start.z + w.dir.z * door.offset + w.inward.z * 0.7 }
}

export function Viewport({ mode, editable, photoView, lookId = 'none', capture }: {
  mode: ViewMode
  editable: boolean
  /** A photo whose viewpoint the orbit camera should jump to. */
  photoView?: RoomPhoto | null
  lookId?: string
  capture?: MutableRefObject<(() => HTMLCanvasElement) | null>
}) {
  const room = useStore((s) => s.project.room)
  const furniture = useStore((s) => s.project.furniture)
  const photos = useStore((s) => s.project.photos)
  const select = useStore((s) => s.select)
  const selection = useStore((s) => s.selection)
  const [dragging, setDragging] = useState(false)
  const look = lookById(lookId)
  const photoLit = photos.some((p) => p.projected && p.camera)
  // Recomputed only when entering the tour, not on every room edit.
  const start = useMemo(() => tourStart(room), [mode])

  return (
    <div className="viewport">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ fov: 45, near: 0.03, far: 200 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping
          gl.toneMappingExposure = 1.0
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
        onPointerMissed={() => editable && select(null)}
        style={{ filter: look.css === 'none' ? undefined : look.css, touchAction: 'none' }}
      >
        <color attach="background" args={['#efe9e4']} />
        <Lighting room={room} photoLit={photoLit} />
        <PhotoProjection />
        <RoomMesh
          room={room}
          furniture={furniture}
          cutaway={mode === 'orbit'}
          selectedOpening={selection?.type === 'opening' ? selection.id : undefined}
          onFloorPointer={editable ? (e) => { if (e.button === 0 && !dragging) select(null) } : undefined}
        />
        <FurnitureLayer room={room} items={furniture} editable={editable && mode === 'orbit'} onDragChange={setDragging} />
        {mode === 'orbit' ? (
          <OrbitRig enabled={!dragging} photo={photoView ?? null} />
        ) : (
          <TourControls room={room} furniture={furniture} start={start} />
        )}
        <CaptureBridge capture={capture} />
      </Canvas>
      {look.vignette > 0 && <div className="vignette" style={{ opacity: look.vignette / 0.4 }} />}
    </div>
  )
}
