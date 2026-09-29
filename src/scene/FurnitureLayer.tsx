import { lazy, Suspense, useRef } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { FurnitureItem, Room } from '../types'
import { ProceduralModel } from '../furniture/models'

// Uploaded .glb models need the glTF loader; it only downloads once a room actually has one.
const CustomModel = lazy(() => import('../furniture/CustomModel').then((m) => ({ default: m.CustomModel })))
const ScannedModel = lazy(() => import('../furniture/CustomModel').then((m) => ({ default: m.ScannedModel })))
import { isSmall, mountOf } from '../furniture/catalog'
import { placeAt, placeOnWall } from '../furniture/placement'
import { useStore } from '../store'
import { NO_TRACE } from '../render/traceFlags'

function SelectionBox({ item }: { item: FurnitureItem }) {
  const { w, d, h } = item.size
  return (
    <group userData={{ [NO_TRACE]: true }}>
      <lineSegments position={[0, h / 2, 0]} raycast={() => null}>
        <edgesGeometry args={[new THREE.BoxGeometry(w + 0.04, h + 0.04, d + 0.04)]} />
        <lineBasicMaterial color="#e2728a" />
      </lineSegments>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} raycast={() => null}>
        <planeGeometry args={[w + 0.1, d + 0.1]} />
        <meshBasicMaterial color="#e2728a" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  )
}

const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const hit = new THREE.Vector3()

/** Furniture in the 3D view. With `editable`, items can be selected and dragged across the floor or walls. */
export function FurnitureLayer({ room, items, editable, onDragChange }: {
  room: Room
  items: FurnitureItem[]
  editable: boolean
  onDragChange?: (dragging: boolean) => void
}) {
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const checkpoint = useStore((s) => s.checkpoint)
  const update = useStore((s) => s.updateFurniture)
  const drag = useRef<{ id: string; offset: { x: number; z: number }; moved: boolean } | null>(null)

  const planeFor = (item: FurnitureItem) => {
    // Ceiling items and small items on top of furniture follow the cursor at their own height.
    floorPlane.constant = mountOf(item) === 'ceiling' || isSmall(item) ? -item.elevation : 0
    return floorPlane
  }

  const onDown = (e: ThreeEvent<PointerEvent>, item: FurnitureItem) => {
    if (!editable || e.button !== 0) return
    e.stopPropagation()
    select({ type: 'furniture', id: item.id })
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = e.ray.intersectPlane(planeFor(item), hit)
    drag.current = { id: item.id, offset: p ? { x: item.position.x - p.x, z: item.position.z - p.z } : { x: 0, z: 0 }, moved: false }
    onDragChange?.(true)
  }

  const onMove = (e: ThreeEvent<PointerEvent>, item: FurnitureItem) => {
    const d = drag.current
    if (!d || d.id !== item.id) return
    e.stopPropagation()
    if (!d.moved) {
      checkpoint()
      d.moved = true
    }
    if (mountOf(item) === 'wall') {
      const placed = placeOnWall(item, e.ray.origin, e.ray.direction, room)
      if (placed) update(item.id, placed)
      return
    }
    const p = e.ray.intersectPlane(planeFor(item), hit)
    if (!p) return
    update(item.id, placeAt(item, { x: p.x + d.offset.x, z: p.z + d.offset.z }, room, items))
  }

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    drag.current = null
    onDragChange?.(false)
  }

  return (
    <group>
      {items.map((item) => (
        <group
          key={item.id}
          position={[item.position.x, item.elevation, item.position.z]}
          rotation={[0, item.rotation, 0]}
          onPointerDown={(e) => onDown(e, item)}
          onPointerMove={(e) => onMove(e, item)}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {item.kind === 'custom' || item.kind === 'scanned' ? (
            <Suspense fallback={null}>{item.kind === 'custom' ? <CustomModel item={item} /> : <ScannedModel item={item} />}</Suspense>
          ) : (
            <ProceduralModel item={item} />
          )}
          {editable && selection?.type === 'furniture' && selection.id === item.id && <SelectionBox item={item} />}
        </group>
      ))}
    </group>
  )
}
