import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import type { FurnitureItem, Opening, PlanImage, Project, Room, RoomPhoto, Vec2 } from './types'
import { clampOpening, normalizeWinding, rectangleCorners } from './geometry/plan'

export type Step = 'room' | 'photo' | 'decorate' | 'tour'
export type Selection =
  | { type: 'furniture'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'corner'; index: number }
  | { type: 'wall'; index: number }
  | null

export const uid = () => Math.random().toString(36).slice(2, 10)

export const defaultRoom = (): Room => ({
  name: '내 방',
  corners: rectangleCorners(4.2, 3.4),
  height: 2.4,
  wallThickness: 0.15,
  openings: [
    { id: uid(), kind: 'window', wall: 0, offset: 2.1, width: 1.8, height: 1.4, sill: 0.6 },
    { id: uid(), kind: 'door', wall: 2, offset: 0.7, width: 0.9, height: 2.1, sill: 0 },
  ],
  wall: { color: '#e9e5e1', roughness: 0.9 },
  floor: { color: '#c9a883', roughness: 0.6 },
  ceiling: { color: '#f5f3f0', roughness: 0.95 },
})

const emptyProject = (): Project => ({ room: defaultRoom(), planImage: null, photos: [], furniture: [] })

type State = {
  project: Project
  step: Step
  selection: Selection
  past: Project[]
  future: Project[]

  setStep: (s: Step) => void
  select: (s: Selection) => void
  /** Records the current project so the next change can be undone. Call once before a drag, not on every move. */
  checkpoint: () => void
  undo: () => void
  redo: () => void
  /** Swaps in a whole new project (e.g. an imported file) and clears undo history. */
  replaceProject: (p: Project) => void
  /** Applies an edit that touches several parts of the project at once; undoable via checkpoint(). */
  setProject: (p: Project) => void
  resetProject: () => void

  updateRoom: (patch: Partial<Room>) => void
  setCorners: (corners: Vec2[]) => void
  addOpening: (o: Omit<Opening, 'id'>) => void
  updateOpening: (id: string, patch: Partial<Opening>) => void
  removeOpening: (id: string) => void
  setPlanImage: (img: PlanImage | null) => void

  addPhoto: (p: Omit<RoomPhoto, 'id'>) => string
  updatePhoto: (id: string, patch: Partial<RoomPhoto>) => void
  removePhoto: (id: string) => void

  addFurniture: (f: Omit<FurnitureItem, 'id'>) => string
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void
  removeFurniture: (id: string) => void
}

const HISTORY = 60

// IndexedDB instead of localStorage: photos and plan images easily blow past localStorage's ~5 MB.
const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: (name, value) => set(name, value),
  removeItem: (name) => del(name),
}

export const useStore = create<State>()(
  persist(
    (setState, getState) => {
      const mutate = (fn: (p: Project) => Project) => setState((s) => ({ project: fn(s.project) }))

      return {
        project: emptyProject(),
        step: 'room',
        selection: null,
        past: [],
        future: [],

        setStep: (step) => setState({ step, selection: null }),
        select: (selection) => setState({ selection }),
        checkpoint: () =>
          setState((s) => ({ past: [...s.past.slice(-HISTORY + 1), s.project], future: [] })),
        undo: () => {
          const { past, project, future } = getState()
          if (!past.length) return
          setState({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], selection: null })
        },
        redo: () => {
          const { past, project, future } = getState()
          if (!future.length) return
          setState({ project: future[0], future: future.slice(1), past: [...past, project], selection: null })
        },
        replaceProject: (project) => setState({ project, past: [], future: [], selection: null }),
        setProject: (project) => setState({ project }),
        resetProject: () => {
          getState().checkpoint()
          setState({ project: emptyProject(), selection: null })
        },

        updateRoom: (patch) =>
          mutate((p) => {
            const room = { ...p.room, ...patch }
            return { ...p, room: { ...room, openings: room.openings.map((o) => clampOpening(o, room)) } }
          }),
        setCorners: (corners) =>
          mutate((p) => {
            const normalized = normalizeWinding(corners)
            const reversed = normalized !== corners
            const n = corners.length
            // Walls are indexed by their start corner; reversing the outline renumbers them and flips their direction.
            const openings = p.room.openings
              .filter((o) => o.wall < n)
              .map((o) => {
                if (!reversed) return o
                const a = corners[o.wall]
                const b = corners[(o.wall + 1) % n]
                const length = Math.hypot(b.x - a.x, b.z - a.z)
                return { ...o, wall: (n - 2 - o.wall + n) % n, offset: length - o.offset }
              })
            const room = { ...p.room, corners: normalized }
            return { ...p, room: { ...room, openings: openings.map((o) => clampOpening(o, room)) } }
          }),
        addOpening: (o) =>
          mutate((p) => ({ ...p, room: { ...p.room, openings: [...p.room.openings, clampOpening({ ...o, id: uid() }, p.room)] } })),
        updateOpening: (id, patch) =>
          mutate((p) => ({
            ...p,
            room: {
              ...p.room,
              openings: p.room.openings.map((o) => (o.id === id ? clampOpening({ ...o, ...patch }, p.room) : o)),
            },
          })),
        removeOpening: (id) =>
          mutate((p) => ({ ...p, room: { ...p.room, openings: p.room.openings.filter((o) => o.id !== id) } })),
        setPlanImage: (planImage) => mutate((p) => ({ ...p, planImage })),

        addPhoto: (photo) => {
          const id = uid()
          mutate((p) => ({ ...p, photos: [...p.photos, { ...photo, id }] }))
          return id
        },
        updatePhoto: (id, patch) =>
          mutate((p) => ({ ...p, photos: p.photos.map((ph) => (ph.id === id ? { ...ph, ...patch } : ph)) })),
        removePhoto: (id) => mutate((p) => ({ ...p, photos: p.photos.filter((ph) => ph.id !== id) })),

        addFurniture: (f) => {
          const id = uid()
          mutate((p) => ({ ...p, furniture: [...p.furniture, { ...f, id }] }))
          return id
        },
        updateFurniture: (id, patch) =>
          mutate((p) => ({ ...p, furniture: p.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
        removeFurniture: (id) => mutate((p) => ({ ...p, furniture: p.furniture.filter((f) => f.id !== id) })),
      }
    },
    {
      name: 'interior-3d-room:project',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ project: s.project, step: s.step }),
    },
  ),
)

export const useProject = () => useStore((s) => s.project)
export const useRoom = () => useStore((s) => s.project.room)
