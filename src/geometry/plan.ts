import type { Opening, Room, Vec2 } from '../types'

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, z: a.z * s })
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z
export const cross = (a: Vec2, b: Vec2) => a.x * b.z - a.z * b.x
export const len = (a: Vec2) => Math.hypot(a.x, a.z)
export const dist = (a: Vec2, b: Vec2) => len(sub(a, b))

export function signedArea(pts: Vec2[]) {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.z - b.x * a.z
  }
  return s / 2
}

/** Returns the corners in the orientation the rest of the app assumes (interior on the left of each edge). */
export function normalizeWinding(pts: Vec2[]): Vec2[] {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts
}

export function centroid(pts: Vec2[]): Vec2 {
  const a = signedArea(pts)
  if (Math.abs(a) < 1e-9) {
    const s = pts.reduce((acc, p) => add(acc, p), { x: 0, z: 0 })
    return scale(s, 1 / pts.length)
  }
  let cx = 0
  let cz = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const f = p.x * q.z - q.x * p.z
    cx += (p.x + q.x) * f
    cz += (p.z + q.z) * f
  }
  return { x: cx / (6 * a), z: cz / (6 * a) }
}

export function bounds(pts: Vec2[]) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minZ = Math.min(minZ, p.z)
    maxX = Math.max(maxX, p.x)
    maxZ = Math.max(maxZ, p.z)
  }
  return { minX, minZ, maxX, maxZ }
}

export function pointInPolygon(p: Vec2, pts: Vec2[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

export type WallSegment = {
  index: number
  start: Vec2
  end: Vec2
  length: number
  /** Unit direction from start to end. */
  dir: Vec2
  /** Unit normal pointing into the room. */
  inward: Vec2
}

export function wallSegments(corners: Vec2[]): WallSegment[] {
  return corners.map((start, index) => {
    const end = corners[(index + 1) % corners.length]
    const d = sub(end, start)
    const length = len(d) || 1e-6
    const dir = scale(d, 1 / length)
    return { index, start, end, length, dir, inward: { x: -dir.z, z: dir.x } }
  })
}

/** Closest point on a wall's inner face, with the distance along the wall and the perpendicular distance. */
export function projectOnWall(p: Vec2, w: WallSegment) {
  const along = Math.max(0, Math.min(w.length, dot(sub(p, w.start), w.dir)))
  const point = add(w.start, scale(w.dir, along))
  return { along, point, distance: dist(p, point) }
}

export function nearestWall(p: Vec2, corners: Vec2[]) {
  let best: { wall: WallSegment; along: number; point: Vec2; distance: number } | null = null
  for (const w of wallSegments(corners)) {
    const r = projectOnWall(p, w)
    if (!best || r.distance < best.distance) best = { wall: w, ...r }
  }
  return best!
}

/** Whether the turn at corners[i] (between the incoming and outgoing wall) bulges outward. */
export function isConvexCorner(corners: Vec2[], i: number) {
  const n = corners.length
  const prev = corners[(i - 1 + n) % n]
  const cur = corners[i]
  const next = corners[(i + 1) % n]
  return cross(sub(cur, prev), sub(next, cur)) > 0
}

/** Keeps an opening inside its wall and away from the floor/ceiling. */
export function clampOpening(o: Opening, room: Room): Opening {
  const walls = wallSegments(room.corners)
  const wall = Math.min(Math.max(0, o.wall), walls.length - 1)
  const length = walls[wall].length
  const width = Math.min(o.width, length - 0.1)
  const height = Math.min(o.height, room.height - 0.05)
  const sill = Math.min(Math.max(0, o.sill), room.height - height - 0.02)
  const offset = Math.min(Math.max(width / 2 + 0.05, o.offset), length - width / 2 - 0.05)
  return { ...o, wall, width, height, sill, offset }
}

export function rectangleCorners(width: number, depth: number): Vec2[] {
  const hw = width / 2
  const hd = depth / 2
  return normalizeWinding([
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ])
}
