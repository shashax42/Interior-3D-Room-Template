import type { FurnitureItem, Room } from '../types'
import { add, centroid, scale, wallSegments, type WallSegment } from '../geometry/plan'
import { CATALOG, type CatalogEntry } from './catalog'
import { facing } from './placement'

export function newItem(entry: CatalogEntry, at = { x: 0, z: 0 }): Omit<FurnitureItem, 'id'> {
  return {
    kind: entry.kind,
    name: entry.name,
    position: at,
    elevation: entry.elevation ?? 0,
    rotation: 0,
    size: { ...entry.size },
    color: entry.color,
    accent: entry.accent,
  }
}

const entry = (kind: CatalogEntry['kind']) => CATALOG.find((c) => c.kind === kind)!

/** An item with its back against a wall, centered `along` meters from the wall's start. */
function againstWall(e: CatalogEntry, w: WallSegment, along: number, patch: Partial<Omit<FurnitureItem, 'id'>> = {}) {
  const base = { ...newItem(e), ...patch }
  const a = Math.min(Math.max(along, base.size.w / 2 + 0.02), w.length - base.size.w / 2 - 0.02)
  return {
    ...base,
    position: add(add(w.start, scale(w.dir, a)), scale(w.inward, base.size.d / 2 + 0.01)),
    rotation: facing(w.inward),
  }
}

/**
 * A romantic vintage bedroom: gray-lilac walls, a ruffled bed, balloon curtains, a gilded mirror,
 * a rail of white dresses and a crystal chandelier. Arranged around the room's walls, door and windows.
 */
export function romanticBedroom(room: Room): { room: Partial<Room>; furniture: Omit<FurnitureItem, 'id'>[] } {
  const walls = wallSegments(room.corners)
  const openingsOn = (w: WallSegment) => room.openings.filter((o) => o.wall === w.index)
  const hasDoor = (w: WallSegment) => openingsOn(w).some((o) => o.kind === 'door')
  const hasWindow = (w: WallSegment) => openingsOn(w).some((o) => o.kind === 'window')

  const byLength = [...walls].sort((a, b) => b.length - a.length)
  const bedWall = byLength.find((w) => !hasDoor(w) && !hasWindow(w)) ?? byLength.find((w) => !hasDoor(w)) ?? byLength[0]
  const rackWall =
    byLength.find((w) => w !== bedWall && !hasDoor(w) && !hasWindow(w)) ??
    byLength.find((w) => w !== bedWall && !hasWindow(w)) ??
    byLength.find((w) => w !== bedWall)!

  const out: Omit<FurnitureItem, 'id'>[] = []
  const bedAlong = bedWall.length / 2
  const bed = againstWall(entry('bed'), bedWall, bedAlong)
  out.push(bed)
  out.push(againstWall(entry('nightstand'), bedWall, bedAlong + bed.size.w / 2 + 0.32))
  out.push({
    ...newItem(entry('rug')),
    position: add(bed.position, scale(bedWall.inward, bed.size.d / 2 - 0.1)),
    rotation: facing(bedWall.inward),
    size: { w: bed.size.w + 0.8, d: 1.4, h: 0.012 },
  })

  // Rail of dresses toward one end of the second wall, the mirror right after it.
  const rack = againstWall(entry('clothesRack'), rackWall, 0.25 + entry('clothesRack').size.w / 2)
  out.push(rack)
  out.push(againstWall(entry('floorMirror'), rackWall, 0.25 + rack.size.w + 0.5))
  // Gallery of frames above the rail.
  ;[-0.45, -0.1, 0.25].forEach((dx, i) =>
    out.push(
      againstWall(entry('frame'), rackWall, 0.25 + rack.size.w / 2 + dx, {
        elevation: 1.75 + (i % 2) * 0.12,
        size: i === 1 ? { w: 0.28, d: 0.03, h: 0.34 } : { ...entry('frame').size },
        accent: i === 1 ? '#f0e3da' : '#e9d7cf',
      }),
    ),
  )

  // Balloon curtains over every window.
  for (const o of room.openings.filter((o) => o.kind === 'window')) {
    const w = walls[o.wall]
    out.push(
      againstWall(entry('curtain'), w, o.offset, {
        size: { w: o.width + 0.7, d: 0.12, h: room.height - 0.12 },
        elevation: 0.02,
      }),
    )
  }

  const c = centroid(room.corners)
  const chandelier = entry('chandelier')
  out.push({ ...newItem(chandelier, c), elevation: room.height - chandelier.size.h })

  return {
    room: { wall: { color: '#bdb8bb', roughness: 0.92 }, floor: { color: '#d7c9bb', roughness: 0.55 }, ceiling: { color: '#f4f1ee', roughness: 0.95 } },
    furniture: out,
  }
}
