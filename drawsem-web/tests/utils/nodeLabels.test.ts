import { describe, it, expect } from 'vitest'
import { uniqueNodeLabel, nodeLabelError } from '../../src/utils/helpers'

const labels = (...ls: string[]) => ls.map((label, i) => ({ id: `n${i}`, label }))

describe('uniqueNodeLabel', () => {
  it('gives variables the lowest free V-number, so a deletion is not reused as a duplicate', () => {
    expect(uniqueNodeLabel([], 'variable')).toBe('V1')
    // V1 deleted from V1, V2: the old nodes.length + 1 rule gave a second V2
    expect(uniqueNodeLabel(labels('V2'), 'variable')).toBe('V1')
    expect(uniqueNodeLabel(labels('V1', 'V2', 'F'), 'variable')).toBe('V3')
  })

  it('names additional constants 1b, 1c, ...', () => {
    expect(uniqueNodeLabel(labels('x'), 'constant')).toBe('1')
    expect(uniqueNodeLabel(labels('1'), 'constant')).toBe('1b')
    expect(uniqueNodeLabel(labels('1', '1b'), 'constant')).toBe('1c')
    const all = ['1', ...Array.from({ length: 25 }, (_, i) => `1${String.fromCharCode(98 + i)}`)]
    expect(uniqueNodeLabel(labels(...all), 'constant')).toBe('1_27')
  })

  it('suffixes a taken name', () => {
    expect(uniqueNodeLabel(labels('x1'), 'name', 'x2')).toBe('x2')
    expect(uniqueNodeLabel(labels('x1'), 'name', 'x1')).toBe('x1_2')
    expect(uniqueNodeLabel(labels('x1', 'x1_2'), 'name', 'x1')).toBe('x1_3')
  })
})

describe('nodeLabelError', () => {
  const nodes = labels('A', 'B')
  it('accepts a free label and the node keeping its own label', () => {
    expect(nodeLabelError(nodes, 'n0', 'C')).toBeNull()
    expect(nodeLabelError(nodes, 'n0', 'A')).toBeNull()
  })
  it('rejects another node\'s label and an empty label', () => {
    expect(nodeLabelError(nodes, 'n0', 'B')).toMatch(/already exists/)
    expect(nodeLabelError(nodes, 'n0', '')).toMatch(/needs a label/)
  })
})
