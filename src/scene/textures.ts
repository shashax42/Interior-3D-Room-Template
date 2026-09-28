import * as THREE from 'three'

/** Meters of floor one tile of the plank texture covers. */
export const PLANK_TILE_METERS = 1.8

let planks: THREE.CanvasTexture | null = null

/** A light, neutral wood-plank pattern; the floor finish color tints it. */
export function plankTexture() {
  if (planks) return planks
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const rows = 10 // ~18 cm planks
  const rowH = size / rows
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // Each row is laid from a random start and wrapped around the tile edge, so tiles join without a seam.
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH
    const start = rnd() * size
    let x = start
    while (x < start + size) {
      const len = Math.min(size * (0.45 + rnd() * 0.5), start + size - x)
      const tone = 225 + Math.round(rnd() * 26)
      const grain = Array.from({ length: 14 }, () => ({ y: y0 + rnd() * rowH, a: rnd() * 6 - 3, b: rnd() * 6 - 3, light: rnd() > 0.5, w: 1 + rnd() * 2 }))
      for (const off of [0, -size]) {
        const px = x + off
        ctx.fillStyle = `rgb(${tone},${tone - 4},${tone - 10})`
        ctx.fillRect(px, y0, len, rowH)
        ctx.globalAlpha = 0.07
        for (const g of grain) {
          ctx.strokeStyle = g.light ? '#fff' : '#6b5540'
          ctx.lineWidth = g.w
          ctx.beginPath()
          ctx.moveTo(px, g.y)
          ctx.bezierCurveTo(px + len * 0.3, g.y + g.a, px + len * 0.6, g.y + g.b, px + len, g.y)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(80,60,40,0.3)'
        ctx.fillRect(px, y0, 2, rowH)
      }
      x += len
    }
    ctx.fillStyle = 'rgba(80,60,40,0.3)'
    ctx.fillRect(0, y0, size, 2)
  }
  planks = new THREE.CanvasTexture(canvas)
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping
  planks.colorSpace = THREE.SRGBColorSpace
  planks.anisotropy = 8
  planks.repeat.set(1 / PLANK_TILE_METERS, 1 / PLANK_TILE_METERS)
  return planks
}
