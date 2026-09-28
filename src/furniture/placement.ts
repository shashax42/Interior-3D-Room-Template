import type { FurnitureItem, Room, Vec2 } from '../types'
import { add, dot, nearestWall, scale, wallSegments } from '../geometry/plan'
import { isSmall, isSurface, mountOf, topOf } from './catalog'

/** Rotation (around y) that turns an item's front (+z) toward a direction on the floor. */
export const facing = (dir: Vec2) => Math.atan2(dir.x, dir.z)

const SNAP_DISTANCE = 0.15
const SNAP_ANGLE = Math.cos((20 * Math.PI) / 180)

/**
 * Where an item ends up when dragged so that its center is over `target`.
 * Wall items stick to the nearest wall; small items (candles, plush) land on top of whatever they are dropped on;
 * floor items slide flush against a wall when their back is close to it and they are already roughly facing
 * away from it.
 */
export function placeAt(
  item: FurnitureItem,
  target: Vec2,
  room: Room,
  others: FurnitureItem[] = [],
): Pick<FurnitureItem, 'position' | 'rotation' | 'elevation'> {
  const mount = mountOf(item)
  if (isSmall(item)) {
    const under = others
      .filter((o) => o.id !== item.id && isSurface(o) && insideFootprint(target, o))
      .reduce<FurnitureItem | null>((best, o) => (!best || topOf(o) > topOf(best) ? o : best), null)
    return { position: target, rotation: item.rotation, elevation: under ? topOf(under) : 0 }
  }
  if (mount === 'ceiling') {
    return { position: target, rotation: item.rotation, elevation: room.height - item.size.h }
  }
  const near = nearestWall(target, room.corners)
  if (mount === 'wall') {
    return {
      position: add(near.point, scale(near.wall.inward, item.size.d / 2 + 0.005)),
      rotation: facing(near.wall.inward),
      elevation: item.elevation,
    }
  }
  const front = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) }
  const backGap = near.distance - item.size.d / 2
  if (dot(front, near.wall.inward) > SNAP_ANGLE && backGap < SNAP_DISTANCE) {
    return {
      position: add(near.point, scale(near.wall.inward, item.size.d / 2 + 0.005)),
      rotation: facing(near.wall.inward),
      elevation: 0,
    }
  }
  return { position: target, rotation: item.rotation, elevation: 0 }
}

/** Places a wall item where a ray from the camera hits a wall, keeping the height the user pointed at. */
export function placeOnWall(
  item: FurnitureItem,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  room: Room,
): Pick<FurnitureItem, 'position' | 'rotation' | 'elevation'> | null {
  let best: { t: number; along: number; y: number; wall: ReturnType<typeof wallSegments>[number] } | null = null
  for (const w of wallSegments(room.corners)) {
    const denom = dir.x * w.inward.x + dir.z * w.inward.z
    if (denom >= -1e-6) continue // Only walls facing the camera
    const t = ((w.start.x - origin.x) * w.inward.x + (w.start.z - origin.z) * w.inward.z) / denom
    if (t <= 0 || (best && t >= best.t)) continue
    const px = origin.x + dir.x * t
    const pz = origin.z + dir.z * t
    const along = (px - w.start.x) * w.dir.x + (pz - w.start.z) * w.dir.z
    const y = origin.y + dir.y * t
    if (along < 0 || along > w.length || y < 0 || y > room.height) continue
    best = { t, along, y, wall: w }
  }
  if (!best) return null
  const { wall } = best
  const along = Math.min(Math.max(best.along, item.size.w / 2), wall.length - item.size.w / 2)
  const point = add(wall.start, scale(wall.dir, along))
  return {
    position: add(point, scale(wall.inward, item.size.d / 2 + 0.005)),
    rotation: facing(wall.inward),
    elevation: Math.min(Math.max(0, best.y - item.size.h / 2), room.height - item.size.h),
  }
}

/** Corners of an item's footprint on the floor. */
export function footprint(item: Pick<FurnitureItem, 'position' | 'rotation' | 'size'>, pad = 0): Vec2[] {
  const c = Math.cos(item.rotation)
  const s = Math.sin(item.rotation)
  const hw = item.size.w / 2 + pad
  const hd = item.size.d / 2 + pad
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, z]) => ({ x: item.position.x + x * c + z * s, z: item.position.z - x * s + z * c }))
}

/** Whether a floor point is inside an item's footprint (grown by `pad`). */
export function insideFootprint(p: Vec2, item: Pick<FurnitureItem, 'position' | 'rotation' | 'size'>, pad = 0) {
  const dx = p.x - item.position.x
  const dz = p.z - item.position.z
  const c = Math.cos(item.rotation)
  const s = Math.sin(item.rotation)
  // Inverse of the rotation used in footprint()
  const lx = dx * c - dz * s
  const lz = dx * s + dz * c
  return Math.abs(lx) <= item.size.w / 2 + pad && Math.abs(lz) <= item.size.d / 2 + pad
}

/**
 * A reasonable starting spot for a new item: on top of the selected furniture for small things,
 * the room's middle for floor items, the nearest wall or the ceiling otherwise.
 */
export function initialPlacement(
  item: FurnitureItem,
  room: Room,
  at: Vec2,
  others: FurnitureItem[],
  selected?: FurnitureItem,
): Pick<FurnitureItem, 'position' | 'rotation' | 'elevation'> {
  if (isSmall(item) && selected && isSurface(selected)) {
    return { position: selected.position, rotation: selected.rotation, elevation: topOf(selected) }
  }
  if (mountOf(item) === 'floor' && !isSmall(item)) return { position: at, rotation: 0, elevation: 0 }
  return placeAt(item, at, room, others)
}
