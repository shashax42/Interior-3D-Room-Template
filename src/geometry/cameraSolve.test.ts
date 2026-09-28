import { describe, expect, it } from 'vitest'
import { projectToPhoto, solveCamera, type Correspondence } from './cameraSolve'
import { rectangleCorners } from './plan'
import type { PhotoCamera } from '../types'

const W = 1600
const H = 1200
const corners = rectangleCorners(4, 3.2)
const ceiling = 2.4

function pinsFor(cam: PhotoCamera, pts: [number, number, number][]): Correspondence[] {
  return pts.flatMap((world) => {
    const pixel = projectToPhoto(cam, world, W, H)
    return pixel ? [{ world, pixel }] : []
  })
}

// The two far corners of the room (floor and ceiling) plus a point where a side wall meets the floor.
const visible: [number, number, number][] = [
  [corners[0].x, 0, corners[0].z],
  [corners[0].x, ceiling, corners[0].z],
  [corners[1].x, 0, corners[1].z],
  [corners[1].x, ceiling, corners[1].z],
  [corners[1].x, 0, -0.4],
]

describe('solveCamera', () => {
  const truth: PhotoCamera = { position: [0.4, 1.45, 1.3], rotation: [-0.12, 0.2, 0.01], fov: 68 }

  it('projects points in front of the camera and rejects points behind it', () => {
    const front = projectToPhoto(truth, [0, 1.4, -1.6], W, H)
    expect(front).not.toBeNull()
    expect(projectToPhoto(truth, [0.4, 1.45, 5], W, H)).toBeNull()
  })

  it('recovers the camera that took the photo', () => {
    const pins = pinsFor(truth, visible)
    expect(pins.length).toBe(5)
    const res = solveCamera(pins, W, H, corners)!
    expect(res.rmsPx).toBeLessThan(0.5)
    expect(res.camera.fov).toBeCloseTo(68, 0)
    res.camera.position.forEach((v, i) => expect(v).toBeCloseTo(truth.position[i], 1))
  })

  it('estimates the room size when the plan was drawn at the wrong scale', () => {
    const pins = pinsFor(truth, visible)
    // Same pins, but the user typed a room 25% too wide and 20% too deep.
    const wrong = rectangleCorners(5, 3.84)
    const stretchPin = (c: Correspondence): Correspondence => ({
      ...c,
      world: [c.world[0] * 1.25, c.world[1], c.world[2] * 1.2],
    })
    const res = solveCamera(pins.map(stretchPin), W, H, wrong, { fitDimensions: true, pivot: { x: 0, z: 0 } })!
    expect(res.rmsPx).toBeLessThan(1)
    expect(res.stretch.x).toBeCloseTo(0.8, 1)
    expect(res.stretch.z).toBeCloseTo(1 / 1.2, 1)
  })
})
