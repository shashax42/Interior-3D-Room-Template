import { describe, expect, it } from 'vitest'
import { footprint, insideFootprint, placeAt } from './placement'
import { rectangleCorners, wallSegments } from '../geometry/plan'
import type { FurnitureItem, Room } from '../types'

const room: Room = {
  name: 't',
  corners: rectangleCorners(4, 3),
  height: 2.4,
  wallThickness: 0.15,
  openings: [],
  wall: { color: '#fff', roughness: 1 },
  floor: { color: '#fff', roughness: 1 },
  ceiling: { color: '#fff', roughness: 1 },
}

const item = (patch: Partial<FurnitureItem>): FurnitureItem => ({
  id: 'x',
  kind: 'dresser',
  name: 'x',
  position: { x: 0, z: 0 },
  elevation: 0,
  rotation: 0,
  size: { w: 1, d: 0.5, h: 0.8 },
  color: '#fff',
  accent: '#fff',
  ...patch,
})

describe('footprint', () => {
  it('agrees with insideFootprint for a rotated item', () => {
    const it = item({ position: { x: 1, z: -0.5 }, rotation: 0.7 })
    for (const c of footprint(it)) {
      expect(insideFootprint(c, it, 1e-6)).toBe(true)
      expect(insideFootprint({ x: c.x + (c.x - 1) * 0.1, z: c.z + (c.z + 0.5) * 0.1 }, it)).toBe(false)
    }
  })
})

describe('placeAt', () => {
  it('snaps a floor item flush to a wall it is backing into', () => {
    const w = wallSegments(room.corners)[0]
    const facingIn = Math.atan2(w.inward.x, w.inward.z)
    // Center 0.3 m from the wall: the back (0.25 m behind center) is 5 cm off the wall.
    const target = { x: (w.start.x + w.end.x) / 2 + w.inward.x * 0.3, z: (w.start.z + w.end.z) / 2 + w.inward.z * 0.3 }
    const placed = placeAt(item({ rotation: facingIn + 0.1 }), target, room)
    expect(placed.rotation).toBeCloseTo(facingIn)
    const mid = { x: (w.start.x + w.end.x) / 2, z: (w.start.z + w.end.z) / 2 }
    const gap = (placed.position.x - mid.x) * w.inward.x + (placed.position.z - mid.z) * w.inward.z
    expect(gap).toBeCloseTo(0.255, 3)
  })

  it('leaves an item facing along the wall where it was dropped', () => {
    const w = wallSegments(room.corners)[0]
    const along = Math.atan2(w.dir.x, w.dir.z)
    const target = { x: w.start.x + w.dir.x + w.inward.x * 0.3, z: w.start.z + w.dir.z + w.inward.z * 0.3 }
    const placed = placeAt(item({ rotation: along }), target, room)
    expect(placed.position).toEqual(target)
    expect(placed.rotation).toBe(along)
  })

  it('hangs ceiling items from the ceiling', () => {
    const placed = placeAt(item({ kind: 'chandelier', size: { w: 0.7, d: 0.7, h: 0.75 } }), { x: 0, z: 0 }, room)
    expect(placed.elevation).toBeCloseTo(2.4 - 0.75)
  })
})
