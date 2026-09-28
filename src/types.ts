// All lengths are in meters. The plan lives on the XZ plane (x → right, z → toward the viewer), y is up.

export type Vec2 = { x: number; z: number }

export type OpeningKind = 'door' | 'window'

/** A door or window cut into one wall. `wall` is the index of the edge that starts at room.corners[wall]. */
export type Opening = {
  id: string
  kind: OpeningKind
  wall: number
  /** Distance from the wall's start corner to the opening's center, along the wall. */
  offset: number
  width: number
  height: number
  /** Height of the opening's bottom edge above the floor (0 for doors). */
  sill: number
}

export type SurfaceFinish = {
  color: string
  roughness: number
}

/** Architectural trim added on top of the plain walls: the details that make a room read as French or "princess". */
export type Trim = {
  color: string
  /** Molded panels on the walls, with a chair rail between the lower and upper rows. */
  panels: boolean
  baseboard: boolean
  /** Crown molding where the walls meet the ceiling. */
  crown: boolean
  /** Round plaster ornament on the ceiling above each chandelier (or the room's middle). */
  medallion: boolean
}

export type Room = {
  name: string
  /** Inner outline of the room. Kept with positive signed area in (x, z) so the interior is left of every edge. */
  corners: Vec2[]
  height: number
  wallThickness: number
  openings: Opening[]
  wall: SurfaceFinish
  floor: SurfaceFinish
  ceiling: SurfaceFinish
  /** Missing in projects saved before trim existed. */
  trim?: Trim
}

/** A reference image the user traced the plan from. `scale` is meters per image pixel. */
export type PlanImage = {
  dataUrl: string
  width: number
  height: number
  scale: number
  /** Where the image's top-left pixel sits in plan coordinates. */
  origin: Vec2
}

/** Camera recovered from a photo so the photo can be projected back onto the room surfaces. */
export type PhotoCamera = {
  position: [number, number, number]
  /** Euler angles [x (pitch), y (yaw), z (roll)] in radians, applied in three.js YXZ order. */
  rotation: [number, number, number]
  /** Vertical field of view in degrees. */
  fov: number
}

export type RoomPhoto = {
  id: string
  dataUrl: string
  width: number
  height: number
  camera: PhotoCamera | null
  /** Photo pixel positions the user pinned to room corners, keyed by handle id (see photo/handles.ts). */
  pins: Record<string, [number, number]>
  /** Whether the photo is painted onto the walls and floor. */
  projected: boolean
}

export type FurnitureKind =
  | 'bed'
  | 'sofa'
  | 'armchair'
  | 'diningTable'
  | 'chair'
  | 'desk'
  | 'wardrobe'
  | 'dresser'
  | 'nightstand'
  | 'bookshelf'
  | 'clothesRack'
  | 'floorMirror'
  | 'rug'
  | 'floorLamp'
  | 'chandelier'
  | 'plant'
  | 'curtain'
  | 'frame'
  | 'canopyBed'
  | 'scallopBed'
  | 'vanity'
  | 'balloonCurtain'
  | 'ornateMirror'
  | 'candles'
  | 'plush'
  | 'bow'
  | 'tableLamp'
  | 'shagRug'
  | 'louisChair'
  | 'pedestal'
  | 'bubbleChandelier'
  | 'bench'
  | 'fireplace'
  | 'custom'

export type FurnitureItem = {
  id: string
  kind: FurnitureKind
  name: string
  position: Vec2
  /** Height of the item's base above the floor. Wall and ceiling items sit above 0. */
  elevation: number
  /** Rotation around the vertical axis, radians. */
  rotation: number
  size: { w: number; d: number; h: number }
  color: string
  accent: string
  /** For kind 'custom': id of an uploaded model in the model store. */
  modelId?: string
}

/** A 360° photoreal picture taken from one spot in the room: one stop of the VR tour. */
export type Panorama = {
  id: string
  /** Where the camera stood (x, z on the floor plan; y is eye height). */
  position: { x: number; y: number; z: number }
  /** Equirectangular JPEG, 2:1. */
  dataUrl: string
}

export type Project = {
  room: Room
  planImage: PlanImage | null
  photos: RoomPhoto[]
  furniture: FurnitureItem[]
  /** Missing in projects saved before the VR tour existed. */
  panoramas?: Panorama[]
}
