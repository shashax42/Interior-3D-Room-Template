import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { FurnitureItem } from '../types'
import { modelUrl, saveModel } from './modelStore'
import { uid } from '../store'

/**
 * Stores an uploaded .glb and measures it. glTF is meant to be in meters, but models exported from
 * shopping sites and CAD tools are often in centimeters or millimeters, so implausible sizes are rescaled.
 */
export async function importModelFile(file: File): Promise<{ modelId: string; size: FurnitureItem['size'] }> {
  const data = await file.arrayBuffer()
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

function Gltf({ url, item }: { url: string; item: FurnitureItem }) {
  const { scene } = useGLTF(url)
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
  const sx = item.size.w / (native.x || 1)
  const sy = item.size.h / (native.y || 1)
  const sz = item.size.d / (native.z || 1)
  return (
    <group scale={[sx, sy, sz]}>
      <primitive object={object} position={[-center.x, -minY, -center.z]} />
    </group>
  )
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
