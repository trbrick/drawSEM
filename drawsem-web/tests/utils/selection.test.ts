import { describe, it, expect } from 'vitest'
import {
  EMPTY_SELECTION, selectionOf, selectionSize, toggleInSelection, unionSelections, pruneSelection,
  sameSelection, boundsFromPoints, boundsContain, unionBounds, marqueeSelection,
} from '../../src/utils/selection'

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

  it('marquee: whole nodes inside, paths with both endpoints selected, additive with a base', () => {
    const box = (x: number) => ({ minX: x - 1, minY: -1, maxX: x + 1, maxY: 1 })
    const nodes = [{ id: 'a', bounds: box(0) }, { id: 'b', bounds: box(5) }, { id: 'c', bounds: box(20) }]
    const paths = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'cc', from: 'c', to: 'c' }]
    const rect = { minX: -2, minY: -2, maxX: 6, maxY: 2 }
    expect(marqueeSelection(rect, nodes, paths, null)).toEqual({ nodeIds: ['a', 'b'], pathIds: ['ab'] })
    expect(marqueeSelection(rect, nodes, paths, selectionOf('node', 'c'))).toEqual({ nodeIds: ['c', 'a', 'b'], pathIds: ['ab', 'bc', 'cc'] })
    expect(marqueeSelection({ minX: -2, minY: -2, maxX: 5.5, maxY: 2 }, nodes, paths, null)).toEqual({ nodeIds: ['a'], pathIds: [] })
  })
})
