import { describe, it, expect } from 'vitest'
import { pathDisplayText, isUnnamedFreePath, pathNameClashes, pathIdsWithNameClash } from '../../src/utils/helpers'
import type { Path } from '../../src/utils/helpers'

const path = (over: Partial<Path> = {}): Path => ({ id: 'p', from: 'F', to: 'x', twoSided: false, ...over })

describe('pathDisplayText, default mode', () => {
  it('treats an absent freeParameter as fixed: unlabeled at unity is blank', () => {
    for (const value of [1, 1.0, 1.0000, undefined]) {
      expect(pathDisplayText(path({ value }), 'default')).toBeNull()
    }
  })

  it('ignores a generated displayName when deciding a fixed path is unlabeled', () => {
    expect(pathDisplayText(path({ value: 1, displayName: 'F → x' }), 'default')).toBeNull()
    expect(pathDisplayText(path({ value: 0.5, displayName: 'F → x' }), 'default')).toBe('=0.50')
  })

  it('shows "=value" for an unlabeled path fixed to any other value', () => {
    expect(pathDisplayText(path({ value: 0.5 }), 'default')).toBe('=0.50')
    expect(pathDisplayText(path({ value: 0 }), 'default')).toBe('=0.00')
    expect(pathDisplayText(path({ value: -1 }), 'default')).toBe('=-1.00')
  })

  it('shows an unnamed free path as "≈value"', () => {
    expect(pathDisplayText(path({ freeParameter: true }), 'default')).toBe('≈1.00')
    expect(pathDisplayText(path({ value: 0.3, freeParameter: true, displayName: 'F → x' }), 'default')).toBe('≈0.30')
  })

  it('shows the parameter name first, else the label (the order OpenMx names parameters)', () => {
    expect(pathDisplayText(path({ value: 0.3, freeParameter: 'b1' }), 'default')).toBe('b1')
    expect(pathDisplayText(path({ value: 0.3, freeParameter: 'b_1', label: 'lam', displayName: 'lam' }), 'default')).toBe('b₁')
    expect(pathDisplayText(path({ value: 0.3, freeParameter: 'b1', label: 'lam' }), 'both')).toBe('b1=0.30')
    expect(pathDisplayText(path({ value: 0.3, freeParameter: 'b1', label: 'lam' }), 'labels')).toBe('b1')
    expect(pathDisplayText(path({ value: 0.3, freeParameter: true, label: 'lam', displayName: 'lam' }), 'default')).toBe('lam')
  })

  it('shows the label of any labeled path, free or fixed, whatever its value', () => {
    expect(pathDisplayText(path({ value: 0.3, freeParameter: 'b1', label: 'b1', displayName: 'b1' }), 'default')).toBe('b1')
    expect(pathDisplayText(path({ value: 1, label: 'c' }), 'default')).toBe('c')
    expect(pathDisplayText(path({ value: 0.5, label: 'x_1', displayName: 'x₁' }), 'default')).toBe('x₁')
  })

  it('always shows a data path\'s column', () => {
    expect(pathDisplayText(path({ type: 'data', label: 'x3', displayName: 'x3' }), 'default')).toBe('x3')
  })
})

describe('pathDisplayText, values and both modes', () => {
  it('values mode shows "=value"', () => {
    expect(pathDisplayText(path({ value: 0.5, label: 'c' }), 'values')).toBe('=0.50')
    expect(pathDisplayText(path({ value: 1 }), 'values')).toBe('=1.00')
  })

  it('both mode shows "label=value", or "=value" when unlabeled', () => {
    expect(pathDisplayText(path({ value: 0.5, label: 'c' }), 'both')).toBe('c=0.50')
    expect(pathDisplayText(path({ value: 0.5, displayName: 'F → x' }), 'both')).toBe('=0.50')
  })
})

describe('isUnnamedFreePath', () => {
  it('is a free structural path with no parameter name and no label', () => {
    expect(isUnnamedFreePath(path({ freeParameter: true }))).toBe(true)
    expect(isUnnamedFreePath(path({ freeParameter: true, displayName: 'F ↔ F' }))).toBe(true)
    expect(isUnnamedFreePath(path({ freeParameter: true, label: 'v' }))).toBe(false)
    expect(isUnnamedFreePath(path({ freeParameter: 'b1' }))).toBe(false)
    expect(isUnnamedFreePath(path({}))).toBe(false)
    expect(isUnnamedFreePath(path({ type: 'data', freeParameter: true }))).toBe(false)
  })

  it('marks values with ≈ in values and both modes', () => {
    expect(pathDisplayText(path({ value: 0.5, freeParameter: true }), 'values')).toBe('≈0.50')
    expect(pathDisplayText(path({ value: 0.5, freeParameter: true }), 'both')).toBe('≈0.50')
    expect(pathDisplayText(path({ value: 0.5, freeParameter: true, label: 'v' }), 'both')).toBe('v=0.50')
  })
})

describe('path name clashes', () => {
  const p = (id: string, over: Partial<Path>): Path => ({ id, from: id, to: 'x', twoSided: false, ...over })

  it('a repeated label with no parameter names is a clash (labels do not constrain)', () => {
    const ps = [p('a', { label: 'c', freeParameter: true }), p('b', { label: 'c' })]
    expect(pathNameClashes(ps[0], ps).map((q) => q.id)).toEqual(['b'])
    expect([...pathIdsWithNameClash(ps)].sort()).toEqual(['a', 'b'])
  })

  it('a label equal to another path\'s parameter name is a clash', () => {
    const ps = [p('a', { freeParameter: 'b1' }), p('b', { label: 'b1', freeParameter: true })]
    expect([...pathIdsWithNameClash(ps)].sort()).toEqual(['a', 'b'])
  })

  it('a shared parameter name is an equality constraint, not a clash', () => {
    const ps = [p('a', { freeParameter: 'b1', label: 'x' }), p('b', { freeParameter: 'b1' })]
    expect(pathIdsWithNameClash(ps).size).toBe(0)
    expect(pathNameClashes(ps[0], ps)).toEqual([])
  })

  it('only the clashing paths are flagged; data paths and unnamed paths never', () => {
    const ps = [
      p('a', { freeParameter: 'b1' }), p('b', { freeParameter: 'b1' }), p('c', { label: 'b1' }),
      p('d', { type: 'data', label: 'x1' }), p('e', { type: 'data', label: 'x1' }),
      p('f', {}), p('g', {}),
    ]
    expect([...pathIdsWithNameClash(ps)].sort()).toEqual(['a', 'b', 'c'])
  })
})
