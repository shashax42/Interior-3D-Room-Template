import type { FurnitureItem, FurnitureKind } from '../types'

/** Where an item attaches: standing on the floor, hung on a wall, or hanging from the ceiling. */
export type Mount = 'floor' | 'wall' | 'ceiling'

export const CATEGORIES = ['프린세스', '침실', '거실', '수납', '조명', '장식'] as const
export type Category = (typeof CATEGORIES)[number]

export type CatalogEntry = {
  kind: Exclude<FurnitureKind, 'custom'>
  name: string
  category: Category
  mount: Mount
  size: FurnitureItem['size']
  color: string
  accent: string
  /** Default height above the floor for wall items. */
  elevation?: number
  /** Small things that sit on top of other furniture (a candle on a nightstand, a plush on the bed). */
  small?: boolean
  /** Height of the surface other items can be set on, if not the item's full height (a bed's mattress). */
  top?: number
}

export const GOLD = '#c9a45c'
export const BLUSH = '#f3d4d2'
export const DUSTY_PINK = '#d9a3a3'
export const CREAM = '#f6efe6'

export const CATALOG: CatalogEntry[] = [
  // The princess-room kit
  { kind: 'canopyBed', name: '캐노피 프릴 침대', category: '프린세스', mount: 'floor', size: { w: 1.6, d: 2.1, h: 2.3 }, color: '#fbf6f1', accent: BLUSH, top: 0.62 },
  { kind: 'scallopBed', name: '조개 헤드 침대', category: '프린세스', mount: 'floor', size: { w: 1.7, d: 2.2, h: 1.45 }, color: '#d8a9a4', accent: '#efe2d6', top: 0.62 },
  { kind: 'vanity', name: '화장대', category: '프린세스', mount: 'floor', size: { w: 1.0, d: 0.48, h: 1.55 }, color: '#fbf8f3', accent: GOLD, top: 0.76 },
  { kind: 'louisChair', name: '루이 암체어', category: '프린세스', mount: 'floor', size: { w: 0.68, d: 0.7, h: 0.98 }, color: '#f6f1ea', accent: '#e9d9c8' },
  { kind: 'bench', name: '벨벳 벤치', category: '프린세스', mount: 'floor', size: { w: 1.3, d: 0.45, h: 0.46 }, color: '#e5d2c3', accent: GOLD },
  { kind: 'pedestal', name: '기둥 사이드테이블', category: '프린세스', mount: 'floor', size: { w: 0.34, d: 0.34, h: 0.7 }, color: '#f7f4ef', accent: '#e8e2da' },
  { kind: 'fireplace', name: '대리석 벽난로', category: '프린세스', mount: 'floor', size: { w: 1.5, d: 0.35, h: 1.15 }, color: '#f4f0ea', accent: '#b9c6d6', top: 1.15 },
  { kind: 'balloonCurtain', name: '벌룬 커튼', category: '프린세스', mount: 'wall', size: { w: 2.2, d: 0.16, h: 2.3 }, color: '#f2c9ca', accent: '#a9a4a7', elevation: 0.02 },
  { kind: 'ornateMirror', name: '로코코 벽거울', category: '프린세스', mount: 'wall', size: { w: 0.62, d: 0.06, h: 0.9 }, color: GOLD, accent: '#dfe4e6', elevation: 1.2 },
  { kind: 'bow', name: '리본 장식', category: '프린세스', mount: 'wall', size: { w: 0.34, d: 0.05, h: 0.4 }, color: '#efb9c0', accent: '#efb9c0', elevation: 1.6 },
  { kind: 'bubbleChandelier', name: '버블 샹들리에', category: '프린세스', mount: 'ceiling', size: { w: 0.8, d: 0.8, h: 0.75 }, color: GOLD, accent: '#fffaf5' },
  { kind: 'shagRug', name: '물결 원형 러그', category: '프린세스', mount: 'floor', size: { w: 1.6, d: 1.6, h: 0.03 }, color: '#fbf7f3', accent: '#f1dcdc' },
  { kind: 'tableLamp', name: '주름 스탠드', category: '프린세스', mount: 'floor', size: { w: 0.3, d: 0.3, h: 0.5 }, color: '#f7efe8', accent: '#f4d9d6', small: true },
  { kind: 'candles', name: '캔들 세트', category: '프린세스', mount: 'floor', size: { w: 0.24, d: 0.14, h: 0.2 }, color: '#fbf4e6', accent: GOLD, small: true },
  { kind: 'plush', name: '토끼 인형', category: '프린세스', mount: 'floor', size: { w: 0.26, d: 0.22, h: 0.38 }, color: '#fbfaf7', accent: '#f4cfd2', small: true },

  { kind: 'bed', name: '침대 (퀸)', category: '침실', mount: 'floor', size: { w: 1.6, d: 2.1, h: 1.1 }, color: '#f3ece6', accent: '#e8c9c9', top: 0.62 },
  { kind: 'nightstand', name: '협탁', category: '침실', mount: 'floor', size: { w: 0.45, d: 0.4, h: 0.55 }, color: '#f2efe9', accent: GOLD },
  { kind: 'dresser', name: '서랍장', category: '수납', mount: 'floor', size: { w: 1.0, d: 0.45, h: 0.85 }, color: '#f2efe9', accent: GOLD },
  { kind: 'wardrobe', name: '옷장', category: '수납', mount: 'floor', size: { w: 1.2, d: 0.6, h: 2.1 }, color: '#efe9e2', accent: GOLD },
  { kind: 'clothesRack', name: '행거', category: '수납', mount: 'floor', size: { w: 1.4, d: 0.5, h: 1.65 }, color: GOLD, accent: '#fbf7f2' },
  { kind: 'bookshelf', name: '책장', category: '수납', mount: 'floor', size: { w: 0.8, d: 0.3, h: 1.8 }, color: '#d9c4a8', accent: '#a0654f' },
  { kind: 'sofa', name: '3인 소파', category: '거실', mount: 'floor', size: { w: 2.0, d: 0.9, h: 0.82 }, color: '#e6dcd2', accent: '#d8b4b4', top: 0.45 },
  { kind: 'armchair', name: '1인 암체어', category: '거실', mount: 'floor', size: { w: 0.8, d: 0.8, h: 0.85 }, color: '#ecd8d4', accent: '#8a6a55', top: 0.45 },
  { kind: 'diningTable', name: '식탁', category: '거실', mount: 'floor', size: { w: 1.4, d: 0.8, h: 0.75 }, color: '#c8a27c', accent: '#c8a27c' },
  { kind: 'chair', name: '의자', category: '거실', mount: 'floor', size: { w: 0.45, d: 0.5, h: 0.88 }, color: '#f1ebe4', accent: '#c8a27c', top: 0.46 },
  { kind: 'desk', name: '책상', category: '거실', mount: 'floor', size: { w: 1.2, d: 0.6, h: 0.74 }, color: '#f2efe9', accent: GOLD },
  { kind: 'rug', name: '러그', category: '장식', mount: 'floor', size: { w: 2.0, d: 1.4, h: 0.012 }, color: '#efe4dc', accent: '#e3c2c2' },
  { kind: 'floorMirror', name: '전신 거울', category: '장식', mount: 'floor', size: { w: 0.62, d: 0.06, h: 1.75 }, color: GOLD, accent: '#dfe6ea' },
  { kind: 'plant', name: '화분', category: '장식', mount: 'floor', size: { w: 0.5, d: 0.5, h: 1.2 }, color: '#5f7d57', accent: '#efe9e2' },
  { kind: 'curtain', name: '커튼', category: '장식', mount: 'wall', size: { w: 2.2, d: 0.12, h: 2.2 }, color: '#f4d7d5', accent: '#e7e2dd', elevation: 0.1 },
  { kind: 'frame', name: '액자', category: '장식', mount: 'wall', size: { w: 0.35, d: 0.03, h: 0.45 }, color: GOLD, accent: '#e9d7cf', elevation: 1.4 },
  { kind: 'floorLamp', name: '플로어 조명', category: '조명', mount: 'floor', size: { w: 0.4, d: 0.4, h: 1.6 }, color: GOLD, accent: '#fbf3e6' },
  { kind: 'chandelier', name: '크리스탈 샹들리에', category: '조명', mount: 'ceiling', size: { w: 0.7, d: 0.7, h: 0.75 }, color: GOLD, accent: '#ffffff' },
]

export const catalogEntry = (kind: FurnitureKind) => CATALOG.find((c) => c.kind === kind)

export const mountOf = (item: Pick<FurnitureItem, 'kind'>): Mount => catalogEntry(item.kind)?.mount ?? 'floor'

export const isSmall = (item: Pick<FurnitureItem, 'kind'>) => !!catalogEntry(item.kind)?.small

/** Height of the surface small items rest on when set on top of this item. */
export const topOf = (item: Pick<FurnitureItem, 'kind' | 'size'>) => catalogEntry(item.kind)?.top ?? item.size.h

/** Items that nothing can be placed on (flat rugs, wall and ceiling items). */
const NOT_SURFACES = new Set<FurnitureKind>(['rug', 'shagRug', 'floorMirror', 'plant', 'floorLamp', 'clothesRack', 'wardrobe', 'bookshelf'])
export const isSurface = (item: Pick<FurnitureItem, 'kind'>) =>
  mountOf(item) === 'floor' && !isSmall(item) && !NOT_SURFACES.has(item.kind)

/** Items the tour camera can walk over. */
export const isWalkable = (item: Pick<FurnitureItem, 'kind' | 'elevation'>) =>
  item.kind === 'rug' || item.kind === 'shagRug' || mountOf(item) !== 'floor' || item.elevation > 0
