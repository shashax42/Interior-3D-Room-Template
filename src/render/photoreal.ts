import * as THREE from 'three'
import { EquirectCamera, GradientEquirectTexture, ShapedAreaLight, WebGLPathTracer } from 'three-gpu-pathtracer'

/**
 * Photoreal rendering by path tracing: light is traced as it really travels — through the windows, bouncing off
 * walls and floor, softening shadows and tinting everything with the colors around it. That bounce light is what
 * makes a photo of a room look like a photo and not like a 3D model.
 *
 * The live scene is copied into a trace-friendly scene first, because the path tracer only understands standard
 * materials: mirrors become perfect metal, glowing unlit bits (candle flames) become emissive, and helpers and
 * the realtime-only fill lights are left out.
 */

/** Objects (and their children) with this flag are not part of the photo: selection boxes, fake fill lights. */
export const NO_TRACE = 'noTrace'

const mirrorMaterial = new THREE.MeshStandardMaterial({ color: '#f4f6f6', metalness: 1, roughness: 0.015 })

function traceMaterial(obj: THREE.Mesh): THREE.Material | null {
  if ((obj as unknown as { isReflector?: boolean }).isReflector) return mirrorMaterial
  const m = obj.material as THREE.Material
  if (Array.isArray(obj.material)) return null
  if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m
  if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const basic = m as THREE.MeshBasicMaterial
    return new THREE.MeshStandardMaterial({ color: '#000000', emissive: basic.color, emissiveIntensity: 6 })
  }
  return null
}

export type TraceOptions = {
  /** Ceiling light panel in the middle of the room (most Korean apartments have one). */
  ceilingLight?: { x: number; z: number; height: number; size: number; intensity: number }
  daylight: number
}

/** Copies the visible, traceable parts of a live scene with their world transforms baked in. */
export function buildTraceScene(source: THREE.Scene, opts: TraceOptions): THREE.Scene {
  source.updateMatrixWorld(true)
  const out = new THREE.Scene()

  const visit = (obj: THREE.Object3D) => {
    if (!obj.visible || obj.userData[NO_TRACE]) return
    if ((obj as THREE.Mesh).isMesh && !(obj as THREE.InstancedMesh).isInstancedMesh) {
      const mesh = obj as THREE.Mesh
      const material = traceMaterial(mesh)
      if (material && mesh.geometry.attributes.position && mesh.geometry.attributes.normal) {
        const copy = new THREE.Mesh(mesh.geometry, material)
        copy.matrixAutoUpdate = false
        copy.matrix.copy(mesh.matrixWorld)
        copy.matrixWorld.copy(mesh.matrixWorld)
        out.add(copy)
      }
    } else if ((obj as THREE.PointLight).isPointLight) {
      const l = obj as THREE.PointLight
      const copy = new THREE.PointLight(l.color, l.intensity * 1.6, l.distance, l.decay)
      copy.position.setFromMatrixPosition(l.matrixWorld)
      out.add(copy)
    } else if ((obj as THREE.DirectionalLight).isDirectionalLight) {
      const l = obj as THREE.DirectionalLight
      const copy = new THREE.DirectionalLight(l.color, l.intensity * 2.2)
      copy.position.setFromMatrixPosition(l.matrixWorld)
      copy.target.position.setFromMatrixPosition(l.target.matrixWorld)
      out.add(copy, copy.target)
    }
    obj.children.forEach(visit)
  }
  source.children.forEach(visit)

  if (opts.ceilingLight) {
    const c = opts.ceilingLight
    const panel = new ShapedAreaLight('#fff1dc', c.intensity, c.size, c.size)
    panel.isCircular = true
    panel.position.set(c.x, c.height - 0.02, c.z)
    panel.rotation.x = -Math.PI / 2
    out.add(panel)
  }

  // A soft daylight sky: bright, slightly blue overhead, warm toward the ground. Seen through the windows.
  const sky = new GradientEquirectTexture(256)
  sky.topColor.set('#dfe9f7')
  sky.bottomColor.set('#e8dccd')
  sky.exponent = 1.4
  sky.update()
  out.environment = sky
  out.background = sky
  out.environmentIntensity = opts.daylight
  out.backgroundIntensity = opts.daylight
  if (import.meta.env.DEV) Object.assign(window, { __traceScene: out })
  return out
}

export type TraceJob = {
  canvas: HTMLCanvasElement
  /** Changing exposure re-draws the finished image without re-tracing. */
  setExposure: (e: number) => void
  stop: () => void
}

/**
 * Traces `scene` from `camera` into a new canvas, a sample at a time so the picture sharpens as you watch.
 * For a 360° panorama pass an EquirectCamera and a 2:1 size.
 */
export function startTrace({ scene, camera, width, height, samples, exposure = 1, onProgress, onDone, onError }: {
  scene: THREE.Scene
  camera: THREE.Camera
  width: number
  height: number
  samples: number
  exposure?: number
  onProgress?: (samples: number) => void
  onDone?: (canvas: HTMLCanvasElement) => void
  onError?: (e: Error) => void
}): TraceJob {
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = exposure

  const tracer = new WebGLPathTracer(renderer)
  tracer.tiles.set(1, 1)
  tracer.bounces = 6
  tracer.filterGlossyFactor = 0.6 // tames sparkly noise on glossy surfaces
  tracer.minSamples = 1
  tracer.fadeDuration = 0
  tracer.renderDelay = 0
  tracer.rasterizeScene = false
  tracer.dynamicLowRes = false
  tracer.setScene(scene, camera)
  if (import.meta.env.DEV) Object.assign(window, { __tracer: tracer, __traceRenderer: renderer })

  let raf = 0
  let stopped = false
  let finished = false
  // Several samples per frame while the page stays smooth: more when frames come back quickly, fewer when not.
  let batch = 1
  let last = performance.now()
  const tick = () => {
    if (stopped) return
    const now = performance.now()
    const dt = now - last
    last = now
    if (dt < 34) batch = Math.min(12, batch + 1)
    else if (dt > 60 && batch > 1) batch--
    try {
      for (let i = 0; i < batch && tracer.samples < samples; i++) tracer.renderSample()
    } catch (e) {
      stopped = true
      onError?.(e as Error)
      return
    }
    onProgress?.(Math.floor(tracer.samples))
    if (tracer.samples >= samples) {
      finished = true
      onDone?.(canvas)
      return
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    canvas,
    setExposure: (e) => {
      renderer.toneMappingExposure = e
      if (finished) {
        tracer.pausePathTracing = true
        tracer.renderSample()
      }
    },
    stop: () => {
      stopped = true
      cancelAnimationFrame(raf)
      tracer.dispose()
      renderer.dispose()
    },
  }
}

export function equirectCameraAt(position: THREE.Vector3) {
  const cam = new EquirectCamera()
  cam.position.copy(position)
  cam.updateMatrixWorld()
  return cam
}
