import { describe, it, expect } from 'vitest'
import {
  pathIssue, dragPathPairs, allPairs, planDraggedPaths, draggedPathsMessage, newDraggedPath,
  planAddMeans, addMeansMessage, planCorrelateAll, correlateAllMessage, sharedValue, MIXED,
  addedSkippedMessage, NEW_CONSTANT_GAP,
} from '../../src/utils/groupEdits'
import { withFreeParameter, formatPathValue, uniquePathLabel } from '../../src/utils/helpers'
import type { Node, Path } from '../../src/utils/helpers'
import { isMacPlatform, isSecondaryPress, isToggleModifier } from '../../src/utils/platform'

const node = (id: string, type: Node['type'] = 'variable', x = 0, y = 0): Node => ({ id, label: id, type, x, y })
const path = (from: string, to: string, twoSided = false, extra: Partial<Path> = {}): Path => ({ id: `${from}-${to}-${twoSided}`, from, to, twoSided, ...extra })

const NODES = [node('a'), node('b'), node('c'), node('k', 'constant'), node('d', 'dataset')]

describe('pathIssue', () => {
  it('applies the single-path rules', () => {
    expect(pathIssue(NODES, [], 'a', 'a', false)).toBe('self-one-headed')
    expect(pathIssue(NODES, [], 'a', 'a', true)).toBeNull()
    expect(pathIssue(NODES, [], 'a', 'd', false)).toBe('dataset-target')
    expect(pathIssue(NODES, [], 'a', 'k', false)).toBe('constant-target')
    expect(pathIssue(NODES, [], 'k', 'a', true)).toBe('constant-two-headed')
    expect(pathIssue(NODES, [], 'd', 'a', true)).toBe('dataset-two-headed')
    expect(pathIssue(NODES, [], 'd', 'a', false)).toBeNull()
  })

  it('refuses duplicates; a two-headed path is the same in either order', () => {
    const ps = [path('a', 'b'), path('b', 'c', true)]
    expect(pathIssue(NODES, ps, 'a', 'b', false)).toBe('duplicate-one-headed')
    expect(pathIssue(NODES, ps, 'b', 'a', false)).toBeNull()
    expect(pathIssue(NODES, ps, 'c', 'b', true)).toBe('duplicate-two-headed')
    expect(pathIssue(NODES, ps, 'a', 'b', true)).toBeNull()
  })
})

describe('dragPathPairs', () => {
  const base = { twoSided: false }
  it('a lone node: just start -> end; released on itself: a self pair', () => {
    expect(dragPathPairs({ ...base, start: 'a', end: 'b', sources: ['a'], selected: ['a'] })).toEqual([['a', 'b']])
    expect(dragPathPairs({ ...base, start: 'a', end: 'a', sources: ['a', 'b'], selected: ['a', 'b'] })).toEqual([['a', 'a']])
  })
  it('fan-out: every selected node to an unselected end', () => {
    expect(dragPathPairs({ ...base, start: 'a', end: 'c', sources: ['a', 'b'], selected: ['a', 'b'] })).toEqual([['a', 'c'], ['b', 'c']])
  })
  it('fan-in: an unselected start to every selected node', () => {
    expect(dragPathPairs({ ...base, start: 'c', end: 'a', sources: ['c'], selected: ['a', 'b'] })).toEqual([['c', 'a'], ['c', 'b']])
  })
  it('start and end both selected', () => {
    expect(dragPathPairs({ ...base, start: 'a', end: 'b', sources: ['a', 'b', 'c'], selected: ['a', 'b', 'c'] })).toEqual([['a', 'b']])
    expect(dragPathPairs({ twoSided: true, start: 'a', end: 'b', sources: ['a', 'b', 'c'], selected: ['a', 'b', 'c'] }))
      .toEqual([['a', 'b'], ['a', 'c'], ['b', 'c']])
  })
  it('a single selected node does not count as a group', () => {
    expect(dragPathPairs({ ...base, start: 'c', end: 'a', sources: ['c'], selected: ['a'] })).toEqual([['c', 'a']])
  })
  it('allPairs lists unordered pairs', () => {
    expect(allPairs(['x', 'y', 'z'])).toEqual([['x', 'y'], ['x', 'z'], ['y', 'z']])
  })
})

describe('planDraggedPaths and its message', () => {
  it('adds the valid pairs and reports the rest', () => {
    const ps = [path('a', 'c')]
    const plan = planDraggedPaths(NODES, ps, [['a', 'c'], ['b', 'c'], ['b', 'k'], ['d', 'c']], false)
    expect(plan.added.map((p) => `${p.from}${p.to}`)).toEqual(['bc', 'dc'])
    expect(plan.added[1].type).toBe('data')
    expect(plan.skipped.map((s) => s.issue)).toEqual(['duplicate-one-headed', 'constant-target'])
    expect(draggedPathsMessage(NODES, plan, false))
      .toBe('Added 2 paths; skipped 2 (already connected: a→c; constants cannot be targets: b→k).')
  })
  it('counts paths planned earlier in the batch as existing', () => {
    const plan = planDraggedPaths(NODES, [], [['a', 'b'], ['b', 'a']], true)
    expect(plan.added).toHaveLength(1)
    expect(plan.skipped).toHaveLength(1)
  })
  it('a two-headed self path is a free error variance', () => {
    const p = newDraggedPath(NODES, 'a', 'a', true)
    expect(p).toMatchObject({ freeParameter: true, parameterType: 'errorVariance', twoSided: true, label: 'V_{a}' })
    // a drawn covariance is free and labelled like Correlate all's
    expect(newDraggedPath(NODES, 'a', 'b', true)).toMatchObject({ freeParameter: true, label: 'C_{a,b}', parameterType: 'covariance' })
  })
  it('a one-headed path is free and labelled from->to, or M_{to} from a constant', () => {
    expect(newDraggedPath(NODES, 'a', 'b', false)).toMatchObject({ freeParameter: true, label: 'a->b', displayName: 'a->b' })
    expect(newDraggedPath(NODES, 'k', 'b', false)).toMatchObject({ freeParameter: true, label: 'M_{b}', parameterType: 'mean' })
    const taken = [{ id: 'x', from: 'a', to: 'b', twoSided: false, label: 'a->b' }]
    expect(newDraggedPath(NODES, 'a', 'b', false, taken).label).toBe('a->b_2')
  })
  it('shortens long lists', () => {
    const items = ['1', '2', '3', '4', '5'].map((i) => ({ reason: 'r', item: i }))
    expect(addedSkippedMessage(0, 'path', items)).toBe('No paths added; skipped 5 (r: 1, 2, 3, +2 more).')
    expect(addedSkippedMessage(1, 'path', [])).toBe('Added 1 path.')
  })
})

describe('planAddMeans', () => {
  const box = { minX: -100, maxX: 100, maxY: 50 }
  it('creates a constant below the selection when there is none', () => {
    const plan = planAddMeans([node('a'), node('b')], [], ['a', 'b'], box)
    expect(plan.newConstant).toMatchObject({ label: '1', type: 'constant', x: 0, y: 50 + NEW_CONSTANT_GAP })
    expect(plan.added.map((p) => [p.from, p.to])).toEqual([[plan.newConstant!.id, 'a'], [plan.newConstant!.id, 'b']])
    expect(plan.added[0]).toMatchObject({ twoSided: false, freeParameter: true, parameterType: 'mean', label: 'M_{a}' })
    expect(addMeansMessage(plan, '1')).toBe('Added constant "1" and 2 mean paths.')
  })
  it('uses the node labelled "1", and skips variables that already have a mean', () => {
    const one = { ...node('one', 'constant'), label: '1' }
    const plan = planAddMeans([node('a'), node('b'), one, node('k', 'constant')], [path('k', 'a')], ['a', 'b'], box)
    expect(plan.newConstant).toBeNull()
    expect(plan.added.map((p) => [p.from, p.to])).toEqual([['one', 'b']])
    expect(plan.skipped).toEqual(['a'])
    expect(addMeansMessage(plan, '1')).toBe('Added 1 mean path from "1"; skipped 1 (already has a mean: a).')
  })
  it('prefers the one selected constant; a non-variable node gets no mean', () => {
    const one = { ...node('one', 'constant'), label: '1' }
    const plan = planAddMeans([node('a'), one, node('k', 'constant'), node('d', 'dataset')], [], ['a', 'k', 'd'], box)
    expect(plan.added.map((p) => [p.from, p.to])).toEqual([['k', 'a']])
  })
  it('creates nothing when every variable has a mean', () => {
    const plan = planAddMeans([node('a'), node('k', 'constant')], [path('k', 'a')], ['a'], box)
    expect(plan.newConstant).toBeNull()
    expect(plan.added).toEqual([])
  })
  it('a new constant label avoids existing labels', () => {
    const plan = planAddMeans([node('a'), { ...node('x'), label: '1' }], [], ['a'], null)
    expect(plan.newConstant!.label).toBe('1b')
  })
})

describe('planCorrelateAll', () => {
  it('adds a covariance for every pair of selected variables without one', () => {
    const plan = planCorrelateAll(NODES, [path('b', 'a', true)], ['a', 'b', 'c', 'k'])
    expect(plan.added.map((p) => [p.from, p.to])).toEqual([['a', 'c'], ['b', 'c']])
    expect(plan.added[0]).toMatchObject({ twoSided: true, freeParameter: true, parameterType: 'covariance', label: 'C_{a,c}' })
    expect(correlateAllMessage(plan)).toBe('Added 2 covariances; skipped 1 (already correlated: a↔b).')
  })
})

describe('sharedValue', () => {
  it('returns the common value, MIXED, or undefined for no items', () => {
    expect(sharedValue([1, 1], (x) => x)).toBe(1)
    expect(sharedValue([1, 2], (x) => x)).toBe(MIXED)
    expect(sharedValue([], (x) => x)).toBeUndefined()
  })
})

describe('withFreeParameter / formatPathValue', () => {
  const p = path('a', 'b', false, { freeParameter: 'x' })
  it('fixed removes the key; empty name is anonymous; never writes false or ""', () => {
    expect('freeParameter' in withFreeParameter(p, undefined)).toBe(false)
    expect(withFreeParameter(p, '').freeParameter).toBe(true)
    expect(withFreeParameter(p, true).freeParameter).toBe(true)
    expect(withFreeParameter(p, 'y').freeParameter).toBe('y')
  })
  it('formats values', () => {
    expect(formatPathValue(undefined)).toBe('')
    expect(formatPathValue(null)).toBe('')
    expect(formatPathValue(1)).toBe('1')
    expect(formatPathValue(0.25)).toBe('0.25')
  })
})

describe('platform rules', () => {
  it('detects macOS from userAgentData, platform or userAgent', () => {
    expect(isMacPlatform({ userAgentData: { platform: 'macOS' } })).toBe(true)
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true)
    expect(isMacPlatform({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' })).toBe(true)
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false)
    expect(isMacPlatform({ userAgentData: { platform: 'Linux' }, platform: 'MacIntel' })).toBe(false)
    expect(isMacPlatform(undefined)).toBe(false)
  })
  it('Ctrl+left is a secondary press only on macOS', () => {
    expect(isSecondaryPress({ button: 2, ctrlKey: false }, false)).toBe(true)
    expect(isSecondaryPress({ button: 0, ctrlKey: true }, true)).toBe(true)
    expect(isSecondaryPress({ button: 0, ctrlKey: true }, false)).toBe(false)
    expect(isSecondaryPress({ button: 0, ctrlKey: false }, true)).toBe(false)
  })
  it('Ctrl toggles selection except on macOS', () => {
    const ctrl = { shiftKey: false, metaKey: false, ctrlKey: true }
    expect(isToggleModifier(ctrl, false)).toBe(true)
    expect(isToggleModifier(ctrl, true)).toBe(false)
    expect(isToggleModifier({ ...ctrl, ctrlKey: false, metaKey: true }, true)).toBe(true)
    expect(isToggleModifier({ ...ctrl, ctrlKey: false, shiftKey: true }, true)).toBe(true)
  })
})

describe('generated path labels', () => {
  it('are unique against existing labels and parameter names (base, base_2, ...)', () => {
    expect(uniquePathLabel([], 'M_{a}')).toBe('M_{a}')
    expect(uniquePathLabel([{ label: 'M_{a}' }, { freeParameter: 'M_{a}_2' }], 'M_{a}')).toBe('M_{a}_3')
  })
  it('a mean label already in use is suffixed', () => {
    const plan = planAddMeans([node('a'), node('k', 'constant')], [path('x', 'y', false, { label: 'M_{a}' })], ['a', 'k'], null)
    expect(plan.added[0].label).toBe('M_{a}_2')
  })
  it('a drawn self-loop is labelled like a new variable\'s variance, unique against the model', () => {
    const plan = planDraggedPaths(NODES, [path('x', 'y', true, { freeParameter: 'V_{a}' })], [['a', 'a']], true)
    expect(plan.added[0].label).toBe('V_{a}_2')
  })
  it('drawn paths are free and labelled, unique within one drag', () => {
    const plan = planDraggedPaths(NODES, [], [['a', 'b'], ['b', 'c']], true)
    expect(plan.added.map((p) => [p.label, p.freeParameter])).toEqual([['C_{a,b}', true], ['C_{b,c}', true]])
    const fan = planDraggedPaths([...NODES, { ...NODES[1], id: 'b2' }], [], [['a', 'b'], ['a', 'b2']], false)
    expect(fan.added.map((p) => p.label)).toEqual(['a->b', 'a->b_2'])
  })
})
