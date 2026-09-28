import type { Room } from '../types'

/**
 * Points on the room the user can pin on a photo: every corner where two walls meet the floor (`f{i}`)
 * and the ceiling (`c{i}`). Those are the easiest things to spot in a photo of an empty room.
 */
export type Handle = { id: string; corner: number; level: 'floor' | 'ceiling'; world: [number, number, number] }

export function roomHandles(room: Room): Handle[] {
  return room.corners.flatMap((c, i) => [
    { id: `f${i}`, corner: i, level: 'floor' as const, world: [c.x, 0, c.z] as [number, number, number] },
    { id: `c${i}`, corner: i, level: 'ceiling' as const, world: [c.x, room.height, c.z] as [number, number, number] },
  ])
}

export const handleLabel = (h: Pick<Handle, 'corner' | 'level'>) => `${h.corner + 1}번 모서리 · ${h.level === 'floor' ? '바닥' : '천장'}`
