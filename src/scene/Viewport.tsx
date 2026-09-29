import { useEffect, useMemo, useRef, useState, type ComponentRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useStore } from '../store'
import type { FurnitureItem, Room, RoomPhoto, Vec2 } from '../types'
import { bounds, centroid, pointInPolygon, wallSegments } from '../geometry/plan'
import { RoomMesh } from './RoomMesh'
import { FurnitureLayer } from './FurnitureLayer'
import { Lighting } from './Lighting'
import { PhotoProjection } from './PhotoProjection'
import { TourControls } from './TourControls'
import { lookById } from './filters'
import { surfacesReady } from './materials'
import { TRACE_MIRROR } from '../render/traceFlags'
import { insideFootprint } from '../furniture/placement'
import { isWalkable } from '../furniture/catalog'

export type ViewMode = 'orbit' | 'tour'
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

function OrbitRig({ enabled, photo }: { enabled: boolean; photo: RoomPhoto | null }) {
  const room = useStore((s) => s.project.room)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
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
    invalidate()
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

/** What the rest of the app needs from a live 3D view: a snapshot, and the scene and camera for photoreal renders. */
export type ViewHandle = {
  snapshot: () => HTMLCanvasElement
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
}

function CaptureBridge({ capture }: { capture?: MutableRefObject<ViewHandle | null> }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const advance = useThree((s) => s.advance)
  useEffect(() => {
    if (!capture) return
    capture.current = {
      snapshot: () => {
        // Run one full frame (including the photo look post-processing) so the snapshot matches the screen.
        advance(performance.now())
        return gl.domElement
      },
      scene,
      camera,
    }
    if (import.meta.env.DEV) Object.assign(window, { __view: capture.current })
    return () => {
      capture.current = null
    }
  }, [capture, gl, scene, camera, advance])
  return null
}

/**
 * What mirrors reflect: a snapshot of the room itself, taken from the middle of the room at eye height and
 * refreshed only after edits (a live mirror would redraw the whole room every frame).
 */
function MirrorReflections({ room, furniture }: { room: Room; furniture: FurnitureItem[] }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const target = useMemo(
    () => new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }),
    [],
  )
  const cubeCamera = useMemo(() => new THREE.CubeCamera(0.05, 60, target), [target])
  const dirty = useRef(true)
  useEffect(() => () => target.dispose(), [target])
  useEffect(() => {
    dirty.current = true
    invalidate()
    // Scanned models finish loading a moment later; capture again once they are in.
    const t = setTimeout(() => {
      dirty.current = true
      invalidate()
    }, 2500)
    return () => clearTimeout(t)
  }, [room, furniture, invalidate])
  useFrame(() => {
    if (!dirty.current) return
    dirty.current = false
    const c = centroid(room.corners)
    cubeCamera.position.set(c.x, 1.4, c.z)
    const mirrors: THREE.Mesh[] = []
    scene.traverse((o) => {
      if (o.userData[TRACE_MIRROR]) mirrors.push(o as THREE.Mesh)
    })
    if (!mirrors.length) return
    mirrors.forEach((m) => (m.visible = false))
    cubeCamera.update(gl, scene)
    mirrors.forEach((m) => {
      m.visible = true
      const mat = m.material as THREE.MeshStandardMaterial
      if (mat.envMap !== target.texture) {
        mat.envMap = target.texture
        mat.needsUpdate = true
      }
    })
  })
  return null
}

/**
 * The "photo look" on top of the 3D view: soft contact shadows where things meet (ambient occlusion), a gentle
 * glow around windows and lamps, and filmic tone mapping. Flat, evenly lit surfaces with hard edges are what
 * make a 3D view read as a drawing; this is what real camera photos of rooms have instead.
 */
function PhotoLook({ strong }: { strong: boolean }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={0.6} distanceFalloff={0.6} intensity={strong ? 3 : 2.2} quality="medium" halfRes color="#2a1e18" />
      <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.45} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA />
    </EffectComposer>
  )
}

/**
 * Keeps the GPU idle when nothing changes. Outside the tour the view is only redrawn on demand (camera moves,
 * edits, loaded textures), and the shadow map is recomputed only when the room or furniture change, not on
 * every camera move.
 */
function RenderBudget({ room, furniture }: { room: unknown; furniture: unknown }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
  }, [gl])
  useEffect(() => {
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, room, furniture, invalidate])
  useEffect(() => {
    let alive = true
    surfacesReady().then(() => {
      if (!alive) return
      gl.shadowMap.needsUpdate = true
      invalidate()
    })
    return () => {
      alive = false
    }
  }, [gl, invalidate])
  return null
}

/** Where the tour starts: just inside the first door, or the middle of the room. */
/**
 * Where the tour starts: the free spot that sees the most of the room, the way a real-estate photographer
 * stands in a corner or the doorway and shoots across the room. Candidates are just inside the door and just
 * inside each corner; spots inside furniture are skipped.
 */
function tourStart(room: Room, furniture: FurnitureItem[]): Vec2 | undefined {
  const c = centroid(room.corners)
  const candidates: Vec2[] = []
  for (const d of room.openings.filter((o) => o.kind === 'door')) {
    const w = wallSegments(room.corners)[d.wall]
    candidates.push({ x: w.start.x + w.dir.x * d.offset + w.inward.x * 0.7, z: w.start.z + w.dir.z * d.offset + w.inward.z * 0.7 })
  }
  for (const p of room.corners) {
    const toC = { x: c.x - p.x, z: c.z - p.z }
    const len = Math.hypot(toC.x, toC.z) || 1
    candidates.push({ x: p.x + (toC.x / len) * 0.75, z: p.z + (toC.z / len) * 0.75 })
  }
  const blocked = (p: Vec2) => furniture.some((f) => !isWalkable(f) && insideFootprint(p, f, 0.3))
  const free = candidates.filter((p) => pointInPolygon(p, room.corners) && !blocked(p))
  if (!free.length) return undefined
  return free.reduce((best, p) => (Math.hypot(p.x - c.x, p.z - c.z) > Math.hypot(best.x - c.x, best.z - c.z) ? p : best))
}

export function Viewport({ mode, editable, photoView, lookId = 'none', capture }: {
  mode: ViewMode
  editable: boolean
  /** A photo whose viewpoint the orbit camera should jump to. */
  photoView?: RoomPhoto | null
  lookId?: string
  capture?: MutableRefObject<ViewHandle | null>
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
  const start = useMemo(() => tourStart(room, furniture), [mode])

  return (
    <div className="viewport">
      <Canvas
        shadows
        frameloop={mode === 'tour' ? 'always' : 'demand'}
        // Retina screens at full 2x cost four times the pixels; 1.5x looks nearly as sharp.
        dpr={[1, 1.5]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ fov: 45, near: 0.03, far: 200 }}
        onCreated={({ gl }) => {
          // Tone mapping happens in the photo look pass (PhotoLook) instead.
          gl.toneMapping = THREE.NoToneMapping
          gl.toneMappingExposure = 1.0
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
        onPointerMissed={() => editable && select(null)}
        style={{ filter: look.css === 'none' ? undefined : look.css, touchAction: 'none' }}
      >
        {/* Inside the room the background is what shows through the windows: a bright, pale sky. */}
        <color attach="background" args={[mode === 'tour' ? '#e4edf5' : '#efe9e4']} />
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
        <RenderBudget room={room} furniture={furniture} />
        <MirrorReflections room={room} furniture={furniture} />
        <PhotoLook strong={mode === 'tour'} />
      </Canvas>
      {look.vignette > 0 && <div className="vignette" style={{ opacity: look.vignette / 0.4 }} />}
    </div>
  )
}
