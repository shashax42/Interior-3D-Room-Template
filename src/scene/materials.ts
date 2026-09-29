import * as THREE from 'three'

/**
 * Real surface detail from photographed materials (CC0, Poly Haven): wood grain, wall plaster, linen weave,
 * velvet pile, marble veins. Flat colors are what made the room read as a drawing; this texture is what makes it
 * read as a room.
 *
 * Color photos are reduced to their light-and-dark pattern ("detail maps") so the finish colors chosen in the app
 * still decide the color. Every texture repeats, which the photoreal path tracer requires of all textures alike.
 */

const base = import.meta.env.BASE_URL
const loader = new THREE.TextureLoader()
/** One entry per texture still downloading; the photoreal renderer waits for all of them. */
const loading: Promise<void>[] = []

/** Real-world size one texture tile covers, in meters (from the Poly Haven asset metadata). */
const TILE = { floor: 1.7, wall: 3.0, linen: 0.27, velvet: 0.28, marble: 1.5 }

function tex(file: string, repeat: number, color = false) {
  let done: () => void = () => {}
  loading.push(new Promise((r) => (done = r)))
  const t = loader.load(`${base}textures/${file}.jpg`, () => done(), undefined, () => done())
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  t.repeat.set(repeat, repeat)
  return t
}

/**
 * A color photo turned into a neutral light/dark pattern averaging ~white, so multiplying it by a finish color
 * keeps that color while adding the material's grain. `strength` scales how pronounced the pattern is.
 */
function detail(file: string, repeat: number, strength: number) {
  // The canvas keeps one fixed size: WebGL texture storage can't change size once uploaded, and a texture that
  // grew after its first upload renders black (and breaks the photoreal renderer).
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#eeeeee'
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.repeat.set(repeat, repeat)
  const img = new Image()
  let done: () => void = () => {}
  loading.push(new Promise((r) => (done = r)))
  img.onerror = () => done()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size)
    const d = data.data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    const mean = sum / (d.length / 4) || 1
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / mean
      const v = Math.max(0, Math.min(255, 238 * (1 + (l - 1) * strength)))
      d[i] = d[i + 1] = d[i + 2] = v
    }
    ctx.putImageData(data, 0, 0)
    t.needsUpdate = true
    done()
  }
  img.src = `${base}textures/${file}.jpg`
  return t
}

let cache: ReturnType<typeof create> | null = null

function create() {
  const floor = 1 / TILE.floor
  const wall = 1 / TILE.wall
  // Furniture UVs run 0→1 across each face (about a meter), so fabric tiles a few times per face.
  const fabric = 4
  return {
    floor: {
      map: detail('laminate_floor_02_diff', floor, 0.9),
      normalMap: tex('laminate_floor_02_nor', floor),
      roughnessMap: tex('laminate_floor_02_rough', floor),
    },
    wall: { normalMap: tex('beige_wall_001_nor', wall) },
    linen: { map: detail('rough_linen_diff', fabric, 0.5), normalMap: tex('rough_linen_nor', fabric) },
    velvet: { normalMap: tex('velour_velvet_nor', fabric) },
    marble: { map: detail('marble_01_diff', 1, 1), normalMap: tex('marble_01_nor', 1) },
  }
}

/** Shared material textures, created on first use (they need the DOM). */
export function surfaces() {
  cache ??= create()
  return cache
}

/** Resolves once every material texture has finished loading (or failed to). */
export function surfacesReady() {
  surfaces()
  return Promise.all(loading).then(() => undefined)
}
