import { describe, it, expect } from 'vitest'
import {
  EMPTY_SELECTION, selectionOf, selectionSize, toggleInSelection, unionSelections, pruneSelection,
  sameSelection, boundsFromPoints, boundsContain, unionBounds, marqueeSelection, svgPathBounds,
  longestRunInside, visibleLength,
} from '../../src/utils/selection'
import type { Bounds, Selection } from '../../src/utils/selection'

describe('selection helpers', () => {
  it('toggles, unions and sizes', () => {
    let s = selectionOf('node', 'a')
    s = toggleInSelection(s, 'path', 'p')
    s = toggleInSelection(s, 'node', 'b')
    expect(s).toEqual({ nodeIds: ['a', 'b'], pathIds: ['p'] })
    expect(selectionSize(s)).toBe(3)
    expect(toggleInSelection(s, 'node', 'a')).toEqual({ nodeIds: ['b'], pathIds: ['p'] })
    expect(unionSelections(s, { nodeIds: ['b', 'c'], pathIds: [] })).toEqual({ nodeIds: ['a', 'b', 'c'], pathIds: ['p'] })
  })

  it('prunes missing ids, returning the same object when nothing changes', () => {
    const s = { nodeIds: ['a', 'b'], pathIds: ['p'] }
    expect(pruneSelection(s, new Set(['a', 'b']), new Set(['p']))).toBe(s)
    expect(pruneSelection(s, new Set(['a']), new Set())).toEqual({ nodeIds: ['a'], pathIds: [] })
    expect(pruneSelection(s, new Set(), new Set())).toBe(EMPTY_SELECTION)
  })

  it('compares order-independently', () => {
    expect(sameSelection({ nodeIds: ['a', 'b'], pathIds: [] }, { nodeIds: ['b', 'a'], pathIds: [] })).toBe(true)
    expect(sameSelection({ nodeIds: ['a'], pathIds: [] }, { nodeIds: ['a'], pathIds: ['p'] })).toBe(false)
  })

  it('bounds', () => {
    const r = boundsFromPoints({ x: 10, y: 5 }, { x: -10, y: -5 })
    expect(r).toEqual({ minX: -10, minY: -5, maxX: 10, maxY: 5 })
    expect(boundsContain(r, { minX: -10, minY: 0, maxX: 0, maxY: 5 })).toBe(true)
    expect(boundsContain(r, { minX: -11, minY: 0, maxX: 0, maxY: 5 })).toBe(false)
    expect(unionBounds([])).toBeNull()
    expect(unionBounds([r, { minX: 0, minY: 0, maxX: 20, maxY: 1 }])).toEqual({ minX: -10, minY: -5, maxX: 20, maxY: 5 })
  })

  it('marquee: nodes inside, and attached paths with enough of their visible line inside; additive with a base', () => {
    // nodes 20 wide at x = 0, 100 and 400; lines run into them (hidden under them)
    const box = (x: number) => ({ minX: x - 10, minY: -10, maxX: x + 10, maxY: 10 })
    const nodes = [{ id: 'a', bounds: box(0) }, { id: 'b', bounds: box(100) }, { id: 'c', bounds: box(400) }]
    const line = (x0: number, x1: number) => [{ x: x0, y: 0 }, { x: x1, y: 0 }]
    // a's loop: out of its top, up to y = -40, and back
    const loop = [{ x: -5, y: -5 }, { x: -5, y: -40 }, { x: 5, y: -40 }, { x: 5, y: -5 }]
    const paths = [
      { id: 'ab', from: 'a', to: 'b', points: line(5, 95), ends: [box(0), box(100)] },
      { id: 'bc', from: 'b', to: 'c', points: line(105, 395), ends: [box(100), box(400)] },
      { id: 'aa', from: 'a', to: 'a', points: loop, ends: [box(0)] },
    ]
    const sel = (rect: Bounds, base: Selection | null = null) => marqueeSelection(rect, nodes, paths, base)
    // a tight box around a: only the ends of its paths (and the hidden parts under a) are inside
    expect(sel({ minX: -15, minY: -15, maxX: 15, maxY: 15 })).toEqual({ nodeIds: ['a'], pathIds: [] })
    // broader: 30 units of ab and most of the loop
    expect(sel({ minX: -45, minY: -45, maxX: 45, maxY: 45 })).toEqual({ nodeIds: ['a'], pathIds: ['ab', 'aa'] })
    // a box over ab alone: no selected endpoint, nothing
    expect(sel({ minX: 20, minY: -5, maxX: 80, maxY: 5 })).toEqual({ nodeIds: [], pathIds: [] })
    // a and b: ab, but not bc (only 20 units of it inside)
    expect(sel({ minX: -15, minY: -15, maxX: 130, maxY: 15 })).toEqual({ nodeIds: ['a', 'b'], pathIds: ['ab'] })
    // additive: the base's nodes count as endpoints too
    expect(sel({ minX: 20, minY: -5, maxX: 80, maxY: 5 }, selectionOf('node', 'a'))).toEqual({ nodeIds: ['a'], pathIds: ['ab'] })
    expect(sel({ minX: -15, minY: -15, maxX: 15, maxY: 15 }, selectionOf('path', 'bc'))).toEqual({ nodeIds: ['a'], pathIds: ['bc'] })
  })

  it('longestRunInside / visibleLength: unbroken stretches, outside the excluded boxes', () => {
    const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    expect(longestRunInside(rect, [{ x: -5, y: 5 }, { x: 15, y: 5 }])).toBeCloseTo(10)
    // two separate dips into the box (3 + 3 and 4 + 4 units) don't add up
    const zigzag = [{ x: 2, y: -5 }, { x: 2, y: 3 }, { x: 2, y: -5 }, { x: 8, y: -5 }, { x: 8, y: 4 }, { x: 8, y: -5 }]
    expect(longestRunInside(rect, zigzag)).toBeCloseTo(8)
    // an excluded box splits a stretch
    expect(longestRunInside(rect, [{ x: 0, y: 5 }, { x: 10, y: 5 }], [{ minX: 3, minY: 0, maxX: 5, maxY: 10 }])).toBeCloseTo(5)
    expect(visibleLength([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], [{ minX: -1, minY: -1, maxX: 2, maxY: 1 }])).toBeCloseTo(18)
  })

  it('svgPathBounds: lines, quadratic and cubic curves (sampled), as the canvas draws them', () => {
    expect(svgPathBounds('M 0 0 L 10 5')).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 })
    expect(svgPathBounds('M 1 2 L 3 4 L -5 0')).toEqual({ minX: -5, minY: 0, maxX: 3, maxY: 4 })
    expect(svgPathBounds('M 0 0 H 4 V -3')).toEqual({ minX: 0, minY: -3, maxX: 4, maxY: 0 })
    // a quadratic bulges halfway to its control point
    const q = svgPathBounds('M 0 0 Q 5 10 10 0')!
    expect(q.minX).toBe(0)
    expect(q.maxX).toBe(10)
    expect(q.maxY).toBeCloseTo(5, 5)
    // a self-loop-like cubic: 3/4 of the way to its control points
    const c = svgPathBounds('M -10 0 C -10 40, 10 40, 10 0')!
    expect(c.maxY).toBeCloseTo(30, 5)
    expect([c.minX, c.maxX, c.minY]).toEqual([-10, 10, 0])
    // commas, exponents, a rounded cable elbow
    expect(svgPathBounds('M0,0 L1e1,-2.5')).toEqual({ minX: 0, minY: -2.5, maxX: 10, maxY: 0 })
    expect(svgPathBounds('M 0 0 L 8 0 Q 10 0 10 2 L 10 20')).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 20 })
    // nothing drawn, or what the canvas never generates
    expect(svgPathBounds('')).toBeNull()
    expect(svgPathBounds('M 0 0 A 5 5 0 0 1 10 0')).toBeNull()
    expect(svgPathBounds('M 0 0 L 5')).toBeNull()
  })
})
