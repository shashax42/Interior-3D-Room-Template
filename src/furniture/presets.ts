import type { FurnitureItem, Room, Trim } from '../types'
import { add, centroid, scale, wallSegments, type WallSegment } from '../geometry/plan'
import { CATALOG, type CatalogEntry } from './catalog'
import { facing } from './placement'

type NewItem = Omit<FurnitureItem, 'id'>

export function newItem(entry: CatalogEntry, at = { x: 0, z: 0 }): NewItem {
  return {
    kind: entry.kind,
    name: entry.name,
    position: at,
    elevation: entry.elevation ?? 0,
    rotation: 0,
    size: { ...entry.size },
    color: entry.color,
    accent: entry.accent,
    ...(entry.asset ? { asset: entry.asset } : {}),
  }
}

/** A catalog kind, or `scan:<id>` for a photoscanned model. */
type Ref = CatalogEntry['kind'] | `scan:${string}`

const entry = (ref: Ref) =>
  ref.startsWith('scan:')
    ? CATALOG.find((c) => c.kind === 'scanned' && c.asset === ref.slice(5))!
    : CATALOG.find((c) => c.kind === ref)!

/** An item with its back against a wall, centered `along` meters from the wall's start. */
function againstWall(ref: Ref, w: WallSegment, along: number, patch: Partial<NewItem> = {}): NewItem {
  const base = { ...newItem(entry(ref)), ...patch }
  const a = Math.min(Math.max(along, base.size.w / 2 + 0.02), w.length - base.size.w / 2 - 0.02)
  return {
    ...base,
    position: add(add(w.start, scale(w.dir, a)), scale(w.inward, base.size.d / 2 + 0.01)),
    rotation: facing(w.inward),
  }
}

/** A small item set on top of another at an offset in that item's own frame (x: right, z: toward its front). */
function onTop(ref: Ref, host: NewItem, top: number, dx = 0, dz = 0, patch: Partial<NewItem> = {}): NewItem {
  const c = Math.cos(host.rotation)
  const s = Math.sin(host.rotation)
  return {
    ...newItem(entry(ref)),
    ...patch,
    position: { x: host.position.x + dx * c + dz * s, z: host.position.z - dx * s + dz * c },
    rotation: host.rotation,
    elevation: top,
  }
}

/** Walls ranked for a headboard or a large piece: long, and free of doors (and ideally windows). */
function pickWalls(room: Room) {
  const walls = wallSegments(room.corners)
  const on = (w: WallSegment) => room.openings.filter((o) => o.wall === w.index)
  const hasDoor = (w: WallSegment) => on(w).some((o) => o.kind === 'door')
  const hasWindow = (w: WallSegment) => on(w).some((o) => o.kind === 'window')
  const score = (w: WallSegment) => w.length - (hasDoor(w) ? 10 : 0) - (hasWindow(w) ? 3 : 0)
  const ranked = [...walls].sort((a, b) => score(b) - score(a))
  return { walls, ranked, hasDoor, hasWindow }
}

/** Center of the widest stretch of a wall not blocked by doors or windows (with room for curtains), if `width` fits. */
function freeSpot(room: Room, w: WallSegment, width: number, margin = 0.35): number | null {
  const blocks = room.openings
    .filter((o) => o.wall === w.index)
    .map((o) => [o.offset - o.width / 2 - margin, o.offset + o.width / 2 + margin])
    .sort((a, b) => a[0] - b[0])
  let best: [number, number] | null = null
  let x = 0
  for (const [a, b] of [...blocks, [w.length, w.length]]) {
    if (a - x > (best ? best[1] - best[0] : 0)) best = [x, a]
    x = Math.max(x, b)
  }
  if (!best || best[1] - best[0] < width + 0.1) return null
  return (best[0] + best[1]) / 2
}

function windowTreatments(room: Room, kind: 'balloonCurtain' | 'curtain', patch: Partial<NewItem> = {}) {
  const walls = wallSegments(room.corners)
  return room.openings
    .filter((o) => o.kind === 'window')
    .map((o) =>
      againstWall(kind, walls[o.wall], o.offset, {
        size: { w: o.width + 0.7, d: kind === 'balloonCurtain' ? 0.16 : 0.12, h: room.height - 0.1 },
        elevation: 0.02,
        ...patch,
      }),
    )
}

export type Preset = {
  id: string
  name: string
  description: string
  build: (room: Room) => { room: Partial<Room>; furniture: NewItem[] }
}

const trim = (t: Partial<Trim>): Trim => ({ color: '#f7f4ef', panels: true, baseboard: true, crown: true, medallion: true, ...t })

/** Gray walls, frilled canopy bed, pink balloon shades, a rail of white dresses, gilt frames and a crystal chandelier. */
function princessRoom(room: Room) {
  const { ranked } = pickWalls(room)
  const [bedWall, second] = ranked
  const out: NewItem[] = []

  const bed = againstWall('canopyBed', bedWall, bedWall.length / 2)
  out.push(bed)
  const stand = againstWall('nightstand', bedWall, bedWall.length / 2 + bed.size.w / 2 + 0.3, { color: '#fbf8f3' })
  out.push(stand, onTop('tableLamp', stand, stand.size.h, -0.06, -0.04), onTop('candles', stand, stand.size.h, 0.12, 0.08))
  out.push(onTop('plush', bed, 0.62, 0.25, -bed.size.d / 2 + 0.75, { rotation: bed.rotation }))
  out.push({
    ...newItem(entry('shagRug')),
    position: add(bed.position, scale(bedWall.inward, bed.size.d / 2 + 0.25)),
    size: { w: 1.7, d: 1.7, h: 0.03 },
  })

  if (second) {
    const rack = againstWall('clothesRack', second, 0.3 + entry('clothesRack').size.w / 2)
    out.push(rack)
    out.push(againstWall('floorMirror', second, 0.3 + rack.size.w + 0.45))
    // A gallery over the rail: a real carved gilt frame between two small painted ones.
    const mid = 0.3 + rack.size.w / 2
    out.push(againstWall('scan:fancy_picture_frame_02', second, mid, { elevation: 1.72 }))
    ;[-0.55, 0.55].forEach((dx) =>
      out.push(againstWall('frame', second, mid + dx, { elevation: 1.85, size: { w: 0.26, d: 0.03, h: 0.34 }, accent: '#f3e1db' })),
    )
  }
  // Vanity on whichever remaining wall has a clear stretch for it.
  for (const w of ranked.slice(2)) {
    const at = freeSpot(room, w, entry('vanity').size.w)
    if (at === null) continue
    const vanity = againstWall('vanity', w, at)
    out.push(vanity, onTop('candles', vanity, 0.76, vanity.size.w * 0.32, 0.05))
    out.push(againstWall('bow', w, at, { elevation: 1.67 }))
    break
  }

  out.push(...windowTreatments(room, 'balloonCurtain'))
  const chandelier = entry('scan:Chandelier_03')
  out.push({ ...newItem(chandelier, centroid(room.corners)), elevation: room.height - chandelier.size.h })

  return {
    room: {
      wall: { color: '#bdb8bb', roughness: 0.92 },
      floor: { color: '#e2d6c8', roughness: 0.55 },
      ceiling: { color: '#f6f3ef', roughness: 0.95 },
      trim: trim({}),
    },
    furniture: out,
  }
}

/** Warm beige paneling, a dusty-pink scallop bed, a velvet bench and a cloud of glass bubbles overhead. */
function modernRomantic(room: Room) {
  const { ranked } = pickWalls(room)
  const bedWall = ranked[0]
  const out: NewItem[] = []
  const bed = againstWall('scallopBed', bedWall, bedWall.length / 2)
  out.push(bed)
  for (const s of [-1, 1]) {
    const stand = againstWall('nightstand', bedWall, bedWall.length / 2 + s * (bed.size.w / 2 + 0.32), { color: '#efe3d3', size: { w: 0.5, d: 0.42, h: 0.58 } })
    out.push(stand, onTop('tableLamp', stand, stand.size.h, 0, -0.02, { color: '#d9b8a4', accent: '#f6ede2' }))
  }
  out.push({
    ...newItem(entry('bench')),
    position: add(bed.position, scale(bedWall.inward, bed.size.d / 2 + 0.3)),
    rotation: bed.rotation,
  })
  out.push({
    ...newItem(entry('rug')),
    position: add(bed.position, scale(bedWall.inward, 0.45)),
    rotation: bed.rotation,
    size: { w: bed.size.w + 1.2, d: 2.2, h: 0.012 },
    color: '#efe6db',
    accent: '#e6d7c7',
  })
  if (ranked[1]) out.push(againstWall('louisChair', ranked[1], 0.6, { color: '#efe3d3', accent: '#e8c9c3' }))
  out.push(...windowTreatments(room, 'curtain', { color: '#f3ebe2', accent: '#e9ddd0' }))
  const bubble = entry('bubbleChandelier')
  out.push({ ...newItem(bubble, centroid(room.corners)), elevation: room.height - bubble.size.h })
  return {
    room: {
      wall: { color: '#e8dccf', roughness: 0.9 },
      floor: { color: '#e9ddd0', roughness: 0.45 },
      ceiling: { color: '#f7f2ec', roughness: 0.95 },
      trim: trim({ color: '#efe6da', medallion: false }),
    },
    furniture: out,
  }
}

/** White paneled salon: marble fireplace with a gilt mirror, a Louis chair, column side tables, powder-blue drapes. */
function frenchSalon(room: Room) {
  const { ranked } = pickWalls(room)
  const fireWall = ranked[0]
  const out: NewItem[] = []
  const fire = againstWall('fireplace', fireWall, fireWall.length / 2)
  out.push(fire)
  out.push(againstWall('ornateMirror', fireWall, fireWall.length / 2, { elevation: 1.3, size: { w: 0.8, d: 0.06, h: 1.0 } }))
  out.push(
    onTop('candles', fire, fire.size.h, -0.55, 0.02),
    onTop('candles', fire, fire.size.h, 0.55, 0.02),
    onTop('scan:mantel_clock_01', fire, fire.size.h, 0, 0.02),
  )
  // Seating facing the fireplace.
  const front = add(fire.position, scale(fireWall.inward, 1.9))
  const back = { x: -fireWall.inward.x, z: -fireWall.inward.z }
  out.push({ ...newItem(entry('scan:Sofa_01')), position: front, rotation: facing(back) })
  const side = fireWall.dir
  out.push({
    ...newItem(entry('scan:ArmChair_01')),
    position: add(add(fire.position, scale(fireWall.inward, 1.0)), scale(side, -1.05)),
    rotation: facing(side) + 0.5,
  })
  for (const s of [-1, 1]) {
    const ped = { ...newItem(entry('pedestal')), position: add(add(fire.position, scale(fireWall.inward, 1.1)), scale(side, s * 0.35)) }
    out.push(ped)
    if (s > 0) out.push(onTop('scan:antique_ceramic_vase_01', ped, ped.size.h))
  }
  out.push({
    ...newItem(entry('rug')),
    position: add(fire.position, scale(fireWall.inward, 1.3)),
    rotation: fire.rotation,
    size: { w: 2.6, d: 1.9, h: 0.012 },
    color: '#c9d0d6',
    accent: '#aebac6',
  })
  if (ranked[1]) {
    const w = ranked[1]
    out.push(againstWall('floorLamp', w, 0.35, { color: '#f4efe6', accent: '#fbf3e6' }))
    const at = freeSpot(room, w, entry('scan:ClassicConsole_01').size.w)
    if (at !== null) {
      out.push(againstWall('scan:ClassicConsole_01', w, at))
      out.push(againstWall('scan:fancy_picture_frame_01', w, at, { elevation: 1.45 }))
    }
  }
  out.push(...windowTreatments(room, 'curtain', { color: '#a9bcd8', accent: '#eef1f5' }))
  const chandelier = entry('scan:Chandelier_01')
  out.push({ ...newItem(chandelier, centroid(room.corners)), elevation: room.height - chandelier.size.h })
  return {
    room: {
      wall: { color: '#f3f0ea', roughness: 0.9 },
      floor: { color: '#dcc8ae', roughness: 0.5 },
      ceiling: { color: '#f8f6f2', roughness: 0.95 },
      trim: trim({ color: '#fbfaf7' }),
    },
    furniture: out,
  }
}

export const PRESETS: Preset[] = [
  { id: 'princess', name: '프린세스 룸', description: '회색 벽 · 캐노피 프릴 침대 · 벌룬 커튼 · 드레스 행거', build: princessRoom },
  { id: 'modern', name: '모던 로맨틱', description: '베이지 몰딩 · 조개 헤드 침대 · 버블 샹들리에', build: modernRomantic },
  { id: 'french', name: '프렌치 살롱', description: '흰 몰딩 · 대리석 벽난로 · 실물 스캔 소파·암체어·콘솔', build: frenchSalon },
]
