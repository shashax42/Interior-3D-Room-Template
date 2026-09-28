import type { PhotoCamera, Vec2 } from '../types'
import { bounds, centroid, pointInPolygon } from './plan'

type V3 = [number, number, number]
type M3 = [number, number, number, number, number, number, number, number, number]

const DEG = Math.PI / 180

/** Camera-to-world rotation for Euler angles in three.js 'YXZ' order: R = Ry(yaw) · Rx(pitch) · Rz(roll). */
function rotationYXZ(yaw: number, pitch: number, roll: number): M3 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cx = Math.cos(pitch), sx = Math.sin(pitch)
  const cz = Math.cos(roll), sz = Math.sin(roll)
  return [
    cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
    cx * sz, cx * cz, -sx,
    -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx,
  ]
}

/** Focal length in pixels for a vertical field of view. */
export const focalPx = (fovDeg: number, imageHeight: number) => imageHeight / 2 / Math.tan((fovDeg * DEG) / 2)

/**
 * Projects a world point into photo pixels (origin top-left, v down).
 * Returns null when the point is behind the camera.
 */
export function projectToPhoto(cam: PhotoCamera, p: V3, width: number, height: number): [number, number] | null {
  const r = rotationYXZ(cam.rotation[1], cam.rotation[0], cam.rotation[2])
  const dx = p[0] - cam.position[0]
  const dy = p[1] - cam.position[1]
  const dz = p[2] - cam.position[2]
  // Rᵀ · d
  const xc = r[0] * dx + r[3] * dy + r[6] * dz
  const yc = r[1] * dx + r[4] * dy + r[7] * dz
  const zc = r[2] * dx + r[5] * dy + r[8] * dz
  if (zc > -1e-3) return null
  const f = focalPx(cam.fov, height)
  return [width / 2 + (f * xc) / -zc, height / 2 - (f * yc) / -zc]
}

export type Correspondence = {
  /** Point on the room at its current dimensions. */
  world: V3
  /** Where the user pinned that point on the photo, in pixels. */
  pixel: [number, number]
}

export type SolveOptions = {
  /** Also estimate how much the plan should stretch along x and z (for rooms whose size is unknown). */
  fitDimensions?: boolean
  /** Point the plan is stretched around when fitDimensions is set. */
  pivot?: Vec2
}

export type SolveResult = {
  camera: PhotoCamera
  /** Root-mean-square reprojection error in pixels. */
  rmsPx: number
  /** Stretch factors along x and z; both 1 unless fitDimensions was set. */
  stretch: { x: number; z: number }
}

// Parameter vector: [px, py, pz, pitch, yaw, roll, fov(rad), sx?, sz?]
type Params = number[]

function toCamera(p: Params): PhotoCamera {
  return { position: [p[0], p[1], p[2]], rotation: [p[3], p[4], p[5]], fov: p[6] / DEG }
}

function clampParams(p: Params, fit: boolean) {
  p[6] = Math.min(Math.max(p[6], 15 * DEG), 130 * DEG)
  p[3] = Math.min(Math.max(p[3], -1.4), 1.4)
  if (fit) {
    p[7] = Math.min(Math.max(p[7], 0.25), 4)
    p[8] = Math.min(Math.max(p[8], 0.25), 4)
  }
}

function residuals(p: Params, corrs: Correspondence[], w: number, h: number, fit: boolean, pivot: Vec2): number[] {
  const cam = toCamera(p)
  const sx = fit ? p[7] : 1
  const sz = fit ? p[8] : 1
  const out: number[] = []
  for (const c of corrs) {
    const world: V3 = [pivot.x + (c.world[0] - pivot.x) * sx, c.world[1], pivot.z + (c.world[2] - pivot.z) * sz]
    const uv = projectToPhoto(cam, world, w, h)
    if (!uv) {
      out.push(5, 5)
      continue
    }
    out.push((uv[0] - c.pixel[0]) / h, (uv[1] - c.pixel[1]) / h)
  }
  // Photos are usually taken roughly level; a weak prior keeps roll from absorbing error.
  out.push(p[5] * 0.05)
  return out
}

const sumSq = (r: number[]) => r.reduce((s, v) => s + v * v, 0)

/** Solves A·x = b for a small dense system with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / M[r][r]
  }
  return x
}

function levenberg(start: Params, f: (p: Params) => number[], fit: boolean, iterations = 80) {
  let p = [...start]
  let r = f(p)
  let cost = sumSq(r)
  let lambda = 1e-2
  const n = p.length
  for (let it = 0; it < iterations; it++) {
    // Numeric Jacobian
    const J: number[][] = r.map(() => new Array(n).fill(0))
    for (let j = 0; j < n; j++) {
      const step = 1e-6 * Math.max(1, Math.abs(p[j]))
      const q = [...p]
      q[j] += step
      const rq = f(q)
      for (let i = 0; i < r.length; i++) J[i][j] = (rq[i] - r[i]) / step
    }
    const JtJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
    const Jtr = new Array(n).fill(0)
    for (let i = 0; i < r.length; i++) {
      for (let a = 0; a < n; a++) {
        Jtr[a] += J[i][a] * r[i]
        for (let b = a; b < n; b++) JtJ[a][b] += J[i][a] * J[i][b]
      }
    }
    for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) JtJ[a][b] = JtJ[b][a]

    let improved = false
    for (let tries = 0; tries < 8; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * (v + 1e-9) : v)))
      const delta = solveLinear(A, Jtr.map((v) => -v))
      if (!delta) {
        lambda *= 10
        continue
      }
      const q = p.map((v, i) => v + delta[i])
      clampParams(q, fit)
      const rq = f(q)
      const c = sumSq(rq)
      if (c < cost) {
        const gain = cost - c
        p = q
        r = rq
        cost = c
        lambda = Math.max(lambda / 3, 1e-9)
        improved = true
        if (gain < 1e-14) return { p, cost }
        break
      }
      lambda *= 10
    }
    if (!improved) break
  }
  return { p, cost }
}

/**
 * Recovers the photo's camera (position, orientation, field of view) from room points the user pinned on it.
 * Needs at least 4 pins, or 5 when also fitting the room's dimensions.
 */
export function solveCamera(
  corrs: Correspondence[],
  width: number,
  height: number,
  corners: Vec2[],
  opts: SolveOptions = {},
): SolveResult | null {
  const fit = !!opts.fitDimensions
  if (corrs.length < (fit ? 5 : 4)) return null
  const pivot = opts.pivot ?? centroid(corners)
  const f = (p: Params) => residuals(p, corrs, width, height, fit, pivot)

  const target = corrs.reduce((a, c) => [a[0] + c.world[0], a[1] + c.world[1], a[2] + c.world[2]], [0, 0, 0])
  const tx = target[0] / corrs.length
  const tz = target[2] / corrs.length

  const b = bounds(corners)
  const starts: Params[] = []
  const grid = 4
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const x = b.minX + ((i + 0.5) / grid) * (b.maxX - b.minX)
      const z = b.minZ + ((j + 0.5) / grid) * (b.maxZ - b.minZ)
      if (!pointInPolygon({ x, z }, corners)) continue
      const yaw = Math.atan2(-(tx - x), -(tz - z))
      for (const y of [1.2, 1.6]) {
        for (const fov of [55, 80]) {
          const p = [x, y, z, 0, yaw, 0, fov * DEG]
          if (fit) p.push(1, 1)
          starts.push(p)
        }
      }
    }
  }

  let best: { p: Params; cost: number } | null = null
  for (const s of starts) {
    const res = levenberg(s, f, fit)
    if (!best || res.cost < best.cost) best = res
  }
  if (!best) return null

  const r = f(best.p)
  const pixelTerms = r.slice(0, corrs.length * 2)
  const rmsPx = Math.sqrt(sumSq(pixelTerms) / corrs.length) * height
  return {
    camera: toCamera(best.p),
    rmsPx,
    stretch: fit ? { x: best.p[7], z: best.p[8] } : { x: 1, z: 1 },
  }
}
