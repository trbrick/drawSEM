import { describe, it, expect } from 'vitest'
import {
  parseViewBox,
  formatViewBox,
  viewScale,
  clientToViewBox,
  zoomViewBox,
  panViewBox,
  wheelDeltaPx,
  wheelZoomFactor,
  ZOOM_MIN_EXTENT,
  ZOOM_MAX_EXTENT,
} from '../../src/utils/viewport'
import type { ViewBox } from '../../src/utils/viewport'

/** Inverse of clientToViewBox under xMidYMid meet. */
function viewBoxToClient(vb: ViewBox, rect: { left: number; top: number; width: number; height: number }, p: { x: number; y: number }) {
  const s = Math.min(rect.width / vb.width, rect.height / vb.height)
  return {
    x: rect.left + (rect.width - vb.width * s) / 2 + (p.x - vb.x) * s,
    y: rect.top + (rect.height - vb.height * s) / 2 + (p.y - vb.y) * s,
  }
}

describe('viewBox parse/format', () => {
  it('round-trips', () => {
    const vb = parseViewBox('-288 -288 576 576')
    expect(vb).toEqual({ x: -288, y: -288, width: 576, height: 576 })
    expect(formatViewBox(vb!)).toBe('-288 -288 576 576')
  })
  it('accepts commas and extra whitespace', () => {
    expect(parseViewBox(' 1,2  3, 4 ')).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
  it('rejects malformed or degenerate input', () => {
    expect(parseViewBox('')).toBeNull()
    expect(parseViewBox('0 0 10')).toBeNull()
    expect(parseViewBox('0 0 a 10')).toBeNull()
    expect(parseViewBox('0 0 0 10')).toBeNull()
    expect(parseViewBox('0 0 10 -1')).toBeNull()
  })
})

describe('viewScale / clientToViewBox (xMidYMid meet)', () => {
  const rect = { left: 10, top: 20, width: 800, height: 400 }
  const vb = { x: 0, y: 0, width: 200, height: 200 }

  it('uses the smaller axis scale', () => {
    expect(viewScale(vb, rect)).toBe(2)
  })
  it('returns null for an unsized element', () => {
    expect(viewScale(vb, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
    expect(clientToViewBox(vb, { left: 0, top: 0, width: 0, height: 0 }, 1, 1)).toBeNull()
  })
  it('accounts for letterboxing on the wider axis', () => {
    // content is 400px wide, centred in 800px: starts at left + 200
    expect(clientToViewBox(vb, rect, 10 + 200, 20)).toEqual({ x: 0, y: 0 })
    expect(clientToViewBox(vb, rect, 10 + 400, 20 + 200)).toEqual({ x: 100, y: 100 })
  })
})

describe('zoomViewBox', () => {
  const rect = { left: 0, top: 0, width: 640, height: 480 }
  const vb = { x: -300, y: -200, width: 600, height: 400 }

  it('keeps the point under the cursor fixed on screen', () => {
    const cursor = { x: 123, y: 77 }
    const p = clientToViewBox(vb, rect, cursor.x, cursor.y)!
    for (const f of [0.5, 0.8, 1.25, 3]) {
      const z = zoomViewBox(vb, f, p)
      const back = viewBoxToClient(z, rect, p)
      expect(back.x).toBeCloseTo(cursor.x, 9)
      expect(back.y).toBeCloseTo(cursor.y, 9)
      expect(z.width / z.height).toBeCloseTo(vb.width / vb.height, 12)
    }
  })

  it('factor > 1 zooms out, < 1 zooms in', () => {
    expect(zoomViewBox(vb, 2, { x: 0, y: 0 }).width).toBe(1200)
    expect(zoomViewBox(vb, 0.5, { x: 0, y: 0 }).width).toBe(300)
  })

  it('clamps zoom-in at the minimum extent', () => {
    const z = zoomViewBox(vb, 0.001, { x: 0, y: 0 })
    expect(Math.max(z.width, z.height)).toBeCloseTo(ZOOM_MIN_EXTENT, 9)
  })

  it('clamps zoom-out at the maximum extent', () => {
    const z = zoomViewBox(vb, 1e6, { x: 0, y: 0 })
    expect(Math.max(z.width, z.height)).toBeCloseTo(ZOOM_MAX_EXTENT, 6)
  })

  it('does not snap a viewBox that is already outside the range', () => {
    const huge = { x: 0, y: 0, width: ZOOM_MAX_EXTENT * 2, height: 10 }
    expect(zoomViewBox(huge, 1.5, { x: 0, y: 0 })).toBe(huge) // cannot zoom further out
    expect(zoomViewBox(huge, 0.5, { x: 0, y: 0 }).width).toBe(ZOOM_MAX_EXTENT) // can zoom back in
    const tiny = { x: 0, y: 0, width: 10, height: 10 }
    expect(zoomViewBox(tiny, 0.5, { x: 0, y: 0 })).toBe(tiny)
  })

  it('ignores invalid factors', () => {
    expect(zoomViewBox(vb, 0, { x: 0, y: 0 })).toBe(vb)
    expect(zoomViewBox(vb, NaN, { x: 0, y: 0 })).toBe(vb)
    expect(zoomViewBox(vb, -1, { x: 0, y: 0 })).toBe(vb)
  })
})

describe('panViewBox', () => {
  it('moves content with the pointer, in canvas units', () => {
    const vb = { x: 0, y: 0, width: 100, height: 100 }
    expect(panViewBox(vb, 20, -10, 2)).toEqual({ x: -10, y: 5, width: 100, height: 100 })
  })
  it('ignores a non-positive scale', () => {
    const vb = { x: 0, y: 0, width: 100, height: 100 }
    expect(panViewBox(vb, 20, 20, 0)).toBe(vb)
  })
})

describe('wheel helpers', () => {
  it('normalises delta modes', () => {
    expect(wheelDeltaPx(3, 0, 500)).toBe(3)
    expect(wheelDeltaPx(3, 1, 500)).toBe(48)
    expect(wheelDeltaPx(1, 2, 500)).toBe(500)
  })
  it('zoom factor: up zooms in, down zooms out, mouse notches are capped', () => {
    expect(wheelZoomFactor(-10)).toBeLessThan(1)
    expect(wheelZoomFactor(10)).toBeGreaterThan(1)
    expect(wheelZoomFactor(0)).toBe(1)
    expect(wheelZoomFactor(100)).toBe(wheelZoomFactor(1000))
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 12)
  })
})
