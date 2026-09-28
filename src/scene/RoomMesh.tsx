import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type { FurnitureItem, Opening, Room } from '../types'
import { isConvexCorner, wallSegments, type WallSegment } from '../geometry/plan'
import { ROOM_LAYER, withPhotoProjection } from './projectionShader'
import { plankTexture } from './textures'
import { NO_TRACE } from '../render/photoreal'
import { Medallions, defaultTrim, wallTrimGeometry } from './Trim'

/** Matrix that maps wall-local coordinates (x along the wall, y up, z into the room) to world space. */
function wallFrame(w: WallSegment) {
  const m = new THREE.Matrix4()
  m.makeBasis(
    new THREE.Vector3(w.dir.x, 0, w.dir.z),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(w.inward.x, 0, w.inward.z),
  )
  m.setPosition(w.start.x, 0, w.start.z)
  return m
}

function wallGeometry(room: Room, w: WallSegment) {
  const t = room.wallThickness
  const n = room.corners.length
  // Overlap walls at outside corners so the joint is closed; inside corners meet exactly at the inner face.
  const extStart = isConvexCorner(room.corners, w.index) ? t : 0
  const extEnd = isConvexCorner(room.corners, (w.index + 1) % n) ? t : 0
  const shape = new THREE.Shape()
  shape.moveTo(-extStart, 0)
  shape.lineTo(w.length + extEnd, 0)
  shape.lineTo(w.length + extEnd, room.height)
  shape.lineTo(-extStart, room.height)
  shape.closePath()
  for (const o of room.openings.filter((o) => o.wall === w.index)) {
    const hole = new THREE.Path()
    const x0 = o.offset - o.width / 2
    const x1 = o.offset + o.width / 2
    hole.moveTo(x0, o.sill)
    hole.lineTo(x0, o.sill + o.height)
    hole.lineTo(x1, o.sill + o.height)
    hole.lineTo(x1, o.sill)
    hole.closePath()
    shape.holes.push(hole)
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false })
  // Extrusion runs along +z (into the room); shift it so the solid sits outside the inner face.
  g.translate(0, 0, -t)
  g.applyMatrix4(wallFrame(w))
  return g
}

function floorShape(room: Room, flip: boolean) {
  const s = new THREE.Shape()
  room.corners.forEach((c, i) => {
    const y = flip ? -c.z : c.z
    if (i === 0) s.moveTo(c.x, y)
    else s.lineTo(c.x, y)
  })
  s.closePath()
  return s
}

function OpeningMesh({ room, wall, o, selected, onSelect }: {
  room: Room
  wall: WallSegment
  o: Opening
  selected: boolean
  onSelect?: (e: ThreeEvent<PointerEvent>, o: Opening) => void
}) {
  const t = room.wallThickness
  const frame = 0.05
  const m = useMemo(() => wallFrame(wall), [wall])
  const trim = selected ? '#f0a6b5' : '#f7f5f2'
  return (
    <group matrixAutoUpdate={false} matrix={m} onPointerDown={onSelect ? (e) => onSelect(e, o) : undefined}>
      <group position={[o.offset, o.sill, -t / 2]}>
        {/* Casing around the opening, on the room side */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (o.width / 2 + frame / 2), o.height / 2, t / 2 + 0.01]} castShadow>
            <boxGeometry args={[frame, o.height + (o.kind === 'window' ? frame * 2 : frame), 0.02]} />
            <meshStandardMaterial color={trim} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, o.height + frame / 2, t / 2 + 0.01]}>
          <boxGeometry args={[o.width + frame * 2, frame, 0.02]} />
          <meshStandardMaterial color={trim} roughness={0.5} />
        </mesh>
        {o.kind === 'window' ? (
          <>
            <mesh position={[0, -0.015, t / 2 + 0.04]} castShadow receiveShadow>
              <boxGeometry args={[o.width + frame * 2 + 0.04, 0.03, 0.1]} />
              <meshStandardMaterial color={trim} roughness={0.5} />
            </mesh>
            {/* Sash: two panes with a center mullion */}
            <mesh position={[0, o.height / 2, 0]}>
              <boxGeometry args={[0.04, o.height, 0.06]} />
              <meshStandardMaterial color={trim} roughness={0.5} />
            </mesh>
            {/* Glass: a faint glow in realtime; left out of photoreal renders so daylight comes through clean. */}
            <mesh position={[0, o.height / 2, -0.01]} userData={{ [NO_TRACE]: true }}>
              <planeGeometry args={[o.width, o.height]} />
              <meshPhysicalMaterial color="#dcebf5" emissive="#eef6ff" emissiveIntensity={0.9} transparent opacity={0.55} roughness={0.05} side={THREE.DoubleSide} />
            </mesh>
          </>
        ) : (
          <>
            <mesh position={[0, o.height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[o.width - 0.01, o.height - 0.005, 0.04]} />
              <meshStandardMaterial color="#f4f1ec" roughness={0.6} />
            </mesh>
            <mesh position={[o.width / 2 - 0.09, 1.0 - o.sill, 0.045]} castShadow>
              <boxGeometry args={[0.12, 0.02, 0.03]} />
              <meshStandardMaterial color="#c9a45c" metalness={1} roughness={0.3} />
            </mesh>
          </>
        )}
      </group>
    </group>
  )
}

export type RoomMeshProps = {
  room: Room
  /** Used to put ceiling rosettes above the chandeliers. */
  furniture?: FurnitureItem[]
  /** Hide the ceiling and the walls between the camera and the room (dollhouse view). */
  cutaway: boolean
  selectedOpening?: string
  onWallPointer?: (e: ThreeEvent<PointerEvent>, wall: WallSegment) => void
  onOpeningPointer?: (e: ThreeEvent<PointerEvent>, o: Opening) => void
  onFloorPointer?: (e: ThreeEvent<PointerEvent>) => void
}

export function RoomMesh({ room, furniture = [], cutaway, selectedOpening, onWallPointer, onOpeningPointer, onFloorPointer }: RoomMeshProps) {
  const trim = room.trim ?? defaultTrim()
  const walls = useMemo(() => wallSegments(room.corners), [room.corners])

  const wallMat = useMemo(() => withPhotoProjection(new THREE.MeshStandardMaterial()), [])
  const floorMat = useMemo(() => withPhotoProjection(new THREE.MeshStandardMaterial({ map: plankTexture() })), [])
  const ceilMat = useMemo(() => withPhotoProjection(new THREE.MeshStandardMaterial()), [])
  useEffect(() => {
    wallMat.color.set(room.wall.color)
    wallMat.roughness = room.wall.roughness
    floorMat.color.set(room.floor.color)
    floorMat.roughness = room.floor.roughness
    ceilMat.color.set(room.ceiling.color)
    ceilMat.roughness = room.ceiling.roughness
  }, [room.wall, room.floor, room.ceiling, wallMat, floorMat, ceilMat])

  const wallGeos = useMemo(() => walls.map((w) => wallGeometry(room, w)), [room, walls])
  const floorGeo = useMemo(() => {
    const g = new THREE.ShapeGeometry(floorShape(room, true))
    g.rotateX(-Math.PI / 2)
    // ShapeGeometry UVs are the shape's own coordinates (meters): (x, -z) after the flip. Fine for tiling.
    return g
  }, [room])
  const ceilGeo = useMemo(() => {
    const g = new THREE.ShapeGeometry(floorShape(room, false))
    g.rotateX(Math.PI / 2)
    g.translate(0, room.height, 0)
    return g
  }, [room])
  useEffect(() => () => [...wallGeos, floorGeo, ceilGeo].forEach((g) => g.dispose()), [wallGeos, floorGeo, ceilGeo])

  const trimMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.55 }), [])
  useEffect(() => void trimMat.color.set(trim.color), [trim.color, trimMat])
  const trimGeos = useMemo(() => walls.map((w) => wallTrimGeometry(room, w, trim)), [room, walls, trim])
  useEffect(() => () => trimGeos.forEach((g) => g?.dispose()), [trimGeos])

  const wallGroups = useRef<(THREE.Group | null)[]>([])
  const ceilRef = useRef<THREE.Group>(null)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    if (ceilRef.current) ceilRef.current.visible = !cutaway || camera.position.y < room.height
    walls.forEach((w, i) => {
      const g = wallGroups.current[i]
      if (!g) return
      if (!cutaway) {
        g.visible = true
        return
      }
      tmp.set(camera.position.x - w.start.x, 0, camera.position.z - w.start.z)
      g.visible = tmp.x * w.inward.x + tmp.z * w.inward.z > -0.05
    })
  })

  const enableRoomLayer = (o: THREE.Object3D | null) => o?.layers.enable(ROOM_LAYER)

  return (
    <group>
      <mesh
        ref={enableRoomLayer}
        geometry={floorGeo}
        material={floorMat}
        receiveShadow
        onPointerDown={onFloorPointer}
      />
      <group ref={ceilRef}>
        <mesh ref={enableRoomLayer} geometry={ceilGeo} material={ceilMat} />
        {trim.medallion && <Medallions room={room} furniture={furniture} color={trim.color} />}
      </group>
      {walls.map((w, i) => (
        <group key={i} ref={(g) => { wallGroups.current[i] = g }}>
          <mesh
            ref={enableRoomLayer}
            geometry={wallGeos[i]}
            material={wallMat}
            receiveShadow
            onPointerDown={onWallPointer ? (e) => onWallPointer(e, w) : undefined}
          />
          {trimGeos[i] && (
            <mesh geometry={trimGeos[i]!} material={trimMat} matrixAutoUpdate={false} matrix={wallFrame(w)} castShadow receiveShadow />
          )}
          {room.openings
            .filter((o) => o.wall === i)
            .map((o) => (
              <OpeningMesh key={o.id} room={room} wall={w} o={o} selected={o.id === selectedOpening} onSelect={onOpeningPointer} />
            ))}
        </group>
      ))}
    </group>
  )
}
