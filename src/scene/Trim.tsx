import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { FurnitureItem, Room, Trim as TrimSettings, Vec2 } from '../types'
import type { WallSegment } from '../geometry/plan'
import { centroid } from '../geometry/plan'
import { mountOf } from '../furniture/catalog'

export const defaultTrim = (): TrimSettings => ({ color: '#f7f4ef', panels: false, baseboard: true, crown: false, medallion: false })

type Profile = [number, number][]

// Profiles are drawn as (distance into the room, height), in meters.
const BASEBOARD: Profile = [[0, 0], [0.014, 0], [0.014, 0.085], [0.009, 0.1], [0, 0.105]]
const CHAIR_RAIL: Profile = [[0, -0.025], [0.008, -0.025], [0.018, -0.012], [0.018, 0.008], [0.008, 0.025], [0, 0.025]]
// Crown: a flat band against the wall, a concave cove, and a step onto the ceiling. Heights are below the ceiling.
const CROWN: Profile = (() => {
  const pts: Profile = [[0, -0.16], [0.012, -0.16], [0.012, -0.14], [0.026, -0.13]]
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2)
    pts.push([0.026 + 0.075 * (1 - Math.cos(a)), -0.13 + 0.1 * Math.sin(a)])
  }
  pts.push([0.11, -0.02], [0.13, -0.012], [0.13, 0], [0, 0])
  return pts
})()

/** Extrudes a molding profile along a wall, from `x0` to `x1` (wall-local: x along the wall, y up, z into the room). */
function molding(profile: Profile, x0: number, x1: number, y: number) {
  const shape = new THREE.Shape(profile.map(([u, v]) => new THREE.Vector2(u, v)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 4 })
  // Shape x → wall z, shape y → wall y, extrusion z → wall −x; then slide into place.
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0))
  m.setPosition(x1, y, 0)
  g.applyMatrix4(m)
  return g
}

/** Rectangular panel outline built from four thin strips. */
function panelFrame(x0: number, x1: number, y0: number, y1: number) {
  const t = 0.028
  const dz = 0.012
  const strips = [
    [x0, x1, y0, y0 + t],
    [x0, x1, y1 - t, y1],
    [x0, x0 + t, y0, y1],
    [x1 - t, x1, y0, y1],
  ].map(([a, b, c, d]) => {
    const g = new THREE.BoxGeometry(b - a, d - c, dz)
    g.translate((a + b) / 2, (c + d) / 2, dz / 2)
    return g
  })
  return strips
}

/** Stretches of the wall not interrupted by a door or window between heights yLo and yHi. */
function freeSpans(room: Room, wall: WallSegment, yLo: number, yHi: number, margin = 0.1): [number, number][] {
  const blocks = room.openings
    .filter((o) => o.wall === wall.index && o.sill < yHi && o.sill + o.height > yLo)
    .map((o) => [o.offset - o.width / 2 - margin, o.offset + o.width / 2 + margin] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const spans: [number, number][] = []
  let x = 0
  for (const [a, b] of blocks) {
    if (a > x) spans.push([x, a])
    x = Math.max(x, b)
  }
  if (x < wall.length) spans.push([x, wall.length])
  return spans.filter(([a, b]) => b - a > 0.05)
}

/** Evenly spaced panels across a span, each at most ~0.9 m wide. */
function panelsIn(span: [number, number], y0: number, y1: number) {
  const [a, b] = span
  const inset = 0.1
  const gap = 0.1
  const len = b - a - inset * 2
  if (len < 0.25 || y1 - y0 < 0.2) return []
  const n = Math.max(1, Math.round(len / 0.9))
  const pw = (len - gap * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => {
    const x0 = a + inset + i * (pw + gap)
    return panelFrame(x0, x0 + pw, y0, y1)
  }).flat()
}

export function wallTrimGeometry(room: Room, wall: WallSegment, trim: TrimSettings): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = []
  const H = room.height
  if (trim.baseboard) {
    for (const [a, b] of freeSpans(room, wall, 0, 0.1, 0.06)) parts.push(molding(BASEBOARD, a, b, 0))
  }
  if (trim.crown) parts.push(molding(CROWN, 0, wall.length, H))
  if (trim.panels) {
    const rail = 0.9
    for (const span of freeSpans(room, wall, rail - 0.03, rail + 0.03, 0.06)) parts.push(molding(CHAIR_RAIL, span[0], span[1], rail))
    const lowY0 = trim.baseboard ? 0.2 : 0.12
    for (const span of freeSpans(room, wall, lowY0, rail - 0.1)) parts.push(...panelsIn(span, lowY0, rail - 0.1))
    const upY1 = H - (trim.crown ? 0.3 : 0.18)
    for (const span of freeSpans(room, wall, rail + 0.1, upY1)) parts.push(...panelsIn(span, rail + 0.1, upY1))
  }
  if (!parts.length) return null
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)
  parts.forEach((g) => g.dispose())
  return merged
}

/** Plaster ceiling rosette: stepped rings with a ring of petals. */
function Medallion({ at, height, color }: { at: Vec2; height: number; color: string }) {
  const lathe = useMemo(() => {
    const pts: [number, number][] = [
      [0.001, -0.05], [0.05, -0.05], [0.07, -0.035], [0.1, -0.04], [0.14, -0.03], [0.16, -0.035],
      [0.22, -0.022], [0.26, -0.026], [0.3, -0.012], [0.33, -0.014], [0.36, 0],
    ]
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 96)
  }, [])
  useEffect(() => () => lathe.dispose(), [lathe])
  const petals = 24
  return (
    <group position={[at.x, height, at.z]}>
      <mesh geometry={lathe} receiveShadow>
        <meshStandardMaterial color={color} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: petals }, (_, i) => {
        const a = (i / petals) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.2, -0.028, Math.sin(a) * 0.2]} rotation={[0, -a, 0]} scale={[1.6, 0.45, 0.8]}>
            <sphereGeometry args={[0.025, 10, 8]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Ceiling rosettes above every chandelier, or one in the middle of the room when there is none. */
export function Medallions({ room, furniture, color }: { room: Room; furniture: FurnitureItem[]; color: string }) {
  const lights = furniture.filter((f) => mountOf(f) === 'ceiling')
  const spots = lights.length ? lights.map((f) => f.position) : [centroid(room.corners)]
  return (
    <>
      {spots.map((p, i) => (
        <Medallion key={i} at={p} height={room.height} color={color} />
      ))}
    </>
  )
}
