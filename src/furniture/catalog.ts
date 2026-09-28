import type { FurnitureItem, FurnitureKind } from '../types'

/** Where an item attaches: standing on the floor, hung on a wall, or hanging from the ceiling. */
export type Mount = 'floor' | 'wall' | 'ceiling'

export type CatalogEntry = {
  kind: Exclude<FurnitureKind, 'custom'>
  name: string
  category: '침실' | '거실' | '수납' | '조명' | '장식'
  mount: Mount
  size: FurnitureItem['size']
  color: string
  accent: string
  /** Default height above the floor for wall items. */
  elevation?: number
}

export const GOLD = '#c9a45c'

export const CATALOG: CatalogEntry[] = [
  { kind: 'bed', name: '침대 (퀸)', category: '침실', mount: 'floor', size: { w: 1.6, d: 2.1, h: 1.1 }, color: '#f3ece6', accent: '#e8c9c9' },
  { kind: 'nightstand', name: '협탁', category: '침실', mount: 'floor', size: { w: 0.45, d: 0.4, h: 0.55 }, color: '#f2efe9', accent: GOLD },
  { kind: 'dresser', name: '서랍장', category: '수납', mount: 'floor', size: { w: 1.0, d: 0.45, h: 0.85 }, color: '#f2efe9', accent: GOLD },
  { kind: 'wardrobe', name: '옷장', category: '수납', mount: 'floor', size: { w: 1.2, d: 0.6, h: 2.1 }, color: '#efe9e2', accent: GOLD },
  { kind: 'clothesRack', name: '행거', category: '수납', mount: 'floor', size: { w: 1.4, d: 0.5, h: 1.65 }, color: GOLD, accent: '#fbf7f2' },
  { kind: 'bookshelf', name: '책장', category: '수납', mount: 'floor', size: { w: 0.8, d: 0.3, h: 1.8 }, color: '#d9c4a8', accent: '#a0654f' },
  { kind: 'sofa', name: '3인 소파', category: '거실', mount: 'floor', size: { w: 2.0, d: 0.9, h: 0.82 }, color: '#e6dcd2', accent: '#d8b4b4' },
  { kind: 'armchair', name: '1인 암체어', category: '거실', mount: 'floor', size: { w: 0.8, d: 0.8, h: 0.85 }, color: '#ecd8d4', accent: '#8a6a55' },
  { kind: 'diningTable', name: '식탁', category: '거실', mount: 'floor', size: { w: 1.4, d: 0.8, h: 0.75 }, color: '#c8a27c', accent: '#c8a27c' },
  { kind: 'chair', name: '의자', category: '거실', mount: 'floor', size: { w: 0.45, d: 0.5, h: 0.88 }, color: '#f1ebe4', accent: '#c8a27c' },
  { kind: 'desk', name: '책상', category: '거실', mount: 'floor', size: { w: 1.2, d: 0.6, h: 0.74 }, color: '#f2efe9', accent: GOLD },
  { kind: 'rug', name: '러그', category: '장식', mount: 'floor', size: { w: 2.0, d: 1.4, h: 0.012 }, color: '#efe4dc', accent: '#e3c2c2' },
  { kind: 'floorMirror', name: '전신 거울', category: '장식', mount: 'floor', size: { w: 0.62, d: 0.06, h: 1.75 }, color: GOLD, accent: '#dfe6ea' },
  { kind: 'plant', name: '화분', category: '장식', mount: 'floor', size: { w: 0.5, d: 0.5, h: 1.2 }, color: '#5f7d57', accent: '#efe9e2' },
  { kind: 'curtain', name: '커튼', category: '장식', mount: 'wall', size: { w: 2.2, d: 0.12, h: 2.2 }, color: '#f4d7d5', accent: '#e7e2dd', elevation: 0.1 },
  { kind: 'frame', name: '액자', category: '장식', mount: 'wall', size: { w: 0.35, d: 0.03, h: 0.45 }, color: GOLD, accent: '#e9d7cf', elevation: 1.4 },
  { kind: 'floorLamp', name: '플로어 조명', category: '조명', mount: 'floor', size: { w: 0.4, d: 0.4, h: 1.6 }, color: GOLD, accent: '#fbf3e6' },
  { kind: 'chandelier', name: '샹들리에', category: '조명', mount: 'ceiling', size: { w: 0.7, d: 0.7, h: 0.75 }, color: GOLD, accent: '#ffffff' },
]

export const catalogEntry = (kind: FurnitureKind) => CATALOG.find((c) => c.kind === kind)

export const mountOf = (item: Pick<FurnitureItem, 'kind'>): Mount => catalogEntry(item.kind)?.mount ?? 'floor'

/** Items the tour camera can walk over. */
export const isWalkable = (item: Pick<FurnitureItem, 'kind'>) =>
  item.kind === 'rug' || mountOf(item) !== 'floor'
