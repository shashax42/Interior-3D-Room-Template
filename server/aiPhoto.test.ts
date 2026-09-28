import { describe, expect, it } from 'vitest'
import { apiSize } from './aiPhoto'

describe('apiSize', () => {
  it('keeps the view aspect within the API limits', () => {
    for (const [w, h] of [[1400, 800], [800, 1400], [1920, 1080], [375, 1200], [4000, 300]]) {
      const [sw, sh] = apiSize(w, h).split('x').map(Number)
      expect(sw % 16).toBe(0)
      expect(sh % 16).toBe(0)
      expect(Math.max(sw, sh)).toBeLessThanOrEqual(3840)
      expect(sw * sh).toBeGreaterThanOrEqual(655_360)
      expect(sw * sh).toBeLessThanOrEqual(8_294_400)
      expect(Math.max(sw / sh, sh / sw)).toBeLessThanOrEqual(3.01)
    }
    const [w, h] = apiSize(1400, 800).split('x').map(Number)
    expect(w / h).toBeCloseTo(1.75, 1)
  })
})
