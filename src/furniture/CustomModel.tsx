import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { FurnitureItem } from '../types'
import { modelUrl, saveModel } from './modelStore'
import { uid } from '../store'

/**
 * Stores an uploaded .glb and measures it. glTF is meant to be in meters, but models exported from
 * shopping sites and CAD tools are often in centimeters or millimeters, so implausible sizes are rescaled.
 */
export async function importModelFile(file: File): Promise<{ modelId: string; size: FurnitureItem['size'] }> {
  const data = await file.arrayBuffer()
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const gltf = await new GLTFLoader().parseAsync(data, '')
  const box = new THREE.Box3().setFromObject(gltf.scene)
  const s = box.getSize(new THREE.Vector3())
  const largest = Math.max(s.x, s.y, s.z)
  const unit = largest > 100 ? 0.001 : largest > 8 ? 0.01 : 1
  const modelId = uid()
  await saveModel(modelId, data)
  const r = (v: number) => Math.max(0.02, Math.round(v * unit * 100) / 100)
  return { modelId, size: { w: r(s.x), d: r(s.z), h: r(s.y) } }
}

function Placeholder({ item }: { item: FurnitureItem }) {
  const { w, d, h } = item.size
  return (
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color="#d8d2cc" transparent opacity={0.5} />
    </mesh>
  )
}

/** A loaded model centered on its footprint, standing on the floor and stretched to the item's size. */
function Fitted({ scene, item }: { scene: THREE.Object3D; item: FurnitureItem }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const { object, native, center, minY } = useMemo(() => {
    const object = scene.clone(true)
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    const box = new THREE.Box3().setFromObject(object)
    return { object, native: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), minY: box.min.y }
  }, [scene])
  // Models arrive after the room was drawn: redraw, and let the shadows include them.
  useEffect(() => {
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, invalidate, object])
  const sx = item.size.w / (native.x || 1)
  const sy = item.size.h / (native.y || 1)
  const sz = item.size.d / (native.z || 1)
  return (
    <group scale={[sx, sy, sz]}>
      <primitive object={object} position={[-center.x, -minY, -center.z]} />
    </group>
  )
}

function Gltf({ url, item }: { url: string; item: FurnitureItem }) {
  const { scene } = useGLTF(url)
  return <Fitted scene={scene} item={item} />
}

export function CustomModel({ item }: { item: FurnitureItem }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (item.modelId) modelUrl(item.modelId).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [item.modelId])
  if (!url) return <Placeholder item={item} />
  return (
    <Suspense fallback={<Placeholder item={item} />}>
      <Gltf url={url} item={item} />
    </Suspense>
  )
}

// Photoscanned models ship as base64 GLB inside JSON (the hosted link only serves standard web file types),
// with meshopt-compressed geometry. One download per model, shared by every copy placed in the room.
const scannedCache = new Map<string, Promise<THREE.Object3D>>()

/**
 * Compressed geometry stores positions and normals as small integers. The photoreal renderer needs plain
 * float attributes, so they are expanded once after loading.
 */
function expandAttributes(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry
    for (const [name, attr] of Object.entries(g.attributes)) {
      const a = attr as THREE.BufferAttribute
      if (a.array instanceof Float32Array && !a.normalized && !(a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) continue
      const out = new Float32Array(a.count * a.itemSize)
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k)
      g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize))
    }
  })
}

export function loadScanned(asset: string) {
  let p = scannedCache.get(asset)
  if (!p) {
    p = (async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}models/${asset}.json`)
      if (!r.ok) throw new Error(`model ${asset}: ${r.status}`)
      const { data } = (await r.json()) as { data: string }
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ])
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
      const gltf = await loader.parseAsync(bytes.buffer, '')
      expandAttributes(gltf.scene)
      return gltf.scene
    })()
    scannedCache.set(asset, p)
    p.catch(() => scannedCache.delete(asset))
  }
  return p
}

export function ScannedModel({ item }: { item: FurnitureItem }) {
  const [scene, setScene] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    let alive = true
    if (item.asset) loadScanned(item.asset).then((s) => alive && setScene(s)).catch(() => {})
    return () => {
      alive = false
    }
  }, [item.asset])
  if (!scene) return <Placeholder item={item} />
  return <Fitted scene={scene} item={item} />
}
