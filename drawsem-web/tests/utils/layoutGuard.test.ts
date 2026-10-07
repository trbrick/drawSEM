import { describe, it, expect } from 'vitest'
import {
  restrictNodesToLayoutChanges,
  restrictPathsToLayoutChanges,
  restrictModelsToLayoutChanges,
} from '../../src/utils/layoutGuard'

const nodes = () => [
  { id: 'n1', x: 10, y: 20, label: 'F1', type: 'variable', width: 60, height: 60 },
  { id: 'n2', x: 100, y: 20, label: 'x1', type: 'variable', variableCharacteristics: { manifestLatent: 'manifest' } },
  { id: 'c1', x: 50, y: 200, label: '1', type: 'constant' },
] as any[]

const paths = () => [
  { id: 'p1', from: 'n1', to: 'n2', twoSided: false, value: 0.8, freeParameter: true, label: 'l1' },
  { id: 'p2', from: 'n2', to: 'n2', twoSided: true, value: 1, freeParameter: true, parameterType: 'errorVariance' },
] as any[]

const model = () => ({ id: 'm1', label: 'Model', nodes: nodes(), paths: paths(), parameterTypes: { errorVariance: {} } })

describe('layoutGuard: nodes', () => {
  it('allows dragging a node (x/y change)', () => {
    const prev = nodes()
    const next = prev.map((n) => (n.id === 'n1' ? { ...n, x: 300, y: 400 } : n))
    const rej: string[] = []
    const out = restrictNodesToLayoutChanges(prev, next, rej)
    expect(out.find((n) => n.id === 'n1')).toMatchObject({ x: 300, y: 400, label: 'F1' })
    expect(rej).toEqual([])
  })

  it('allows runtime-only fields (dataset metadata, displayName)', () => {
    const prev = nodes()
    const next = prev.map((n) => (n.id === 'n2' ? { ...n, displayName: 'x₁', dataset: { fileName: 'a.csv', headers: ['x1'], columns: [] } } : n))
    const rej: string[] = []
    const out = restrictNodesToLayoutChanges(prev, next, rej)
    expect(out[1].displayName).toBe('x₁')
    expect(out[1].dataset.fileName).toBe('a.csv')
    expect(rej).toEqual([])
  })

  it('rejects adding a node', () => {
    const prev = nodes()
    const rej: string[] = []
    const out = restrictNodesToLayoutChanges(prev, [...prev, { id: 'n9', x: 0, y: 0, label: 'V9', type: 'variable' }], rej)
    expect(out).toBe(prev)
    expect(rej.join()).toMatch(/addition rejected/)
  })

  it('rejects removing a node', () => {
    const prev = nodes()
    const rej: string[] = []
    const out = restrictNodesToLayoutChanges(prev, prev.filter((n) => n.id !== 'n2'), rej)
    expect(out).toBe(prev)
    expect(rej.join()).toMatch(/removal rejected/)
  })

  it('rejects label, type and variableCharacteristics changes but keeps a simultaneous move', () => {
    const prev = nodes()
    const next = prev.map((n) =>
      n.id === 'n2'
        ? { ...n, x: 999, label: 'renamed', type: 'constant', variableCharacteristics: { manifestLatent: 'latent' } }
        : n
    )
    const rej: string[] = []
    const out = restrictNodesToLayoutChanges(prev, next, rej)
    expect(out[1]).toMatchObject({ x: 999, label: 'x1', type: 'variable', variableCharacteristics: { manifestLatent: 'manifest' } })
    expect(rej).toHaveLength(3)
  })

  it('rejects removing a field that is not permitted', () => {
    const prev = nodes()
    const next = prev.map((n) => {
      if (n.id !== 'n2') return n
      const { variableCharacteristics, ...rest } = n
      return rest
    })
    const out = restrictNodesToLayoutChanges(prev, next)
    expect(out).toBe(prev)
  })
})

describe('layoutGuard: paths', () => {
  it('rejects adding and removing paths', () => {
    const prev = paths()
    expect(restrictPathsToLayoutChanges(prev, [...prev, { id: 'p9', from: 'n1', to: 'n1', twoSided: true }])).toBe(prev)
    expect(restrictPathsToLayoutChanges(prev, [prev[0]])).toBe(prev)
  })

  it.each([
    ['label', { label: 'new' }],
    ['value', { value: 0.1 }],
    ['twoSided', { twoSided: true }],
    ['reversed', { reversed: true }],
    ['freeParameter', { freeParameter: 'b1' }],
    ['freeParameter (fixing)', { freeParameter: undefined }],
    ['parameterType', { parameterType: 'loading' }],
    ['optimization', { optimization: { bounds: [0, null] } }],
    ['type', { type: 'constant' }],
    ['from/to', { from: 'n2', to: 'n1' }],
  ])('rejects %s change', (_name, patch) => {
    const prev = paths()
    const rej: string[] = []
    const next = prev.map((p) => (p.id === 'p1' ? { ...p, ...patch } : p))
    const out = restrictPathsToLayoutChanges(prev, next, rej)
    expect(out).toBe(prev)
    expect(rej.length).toBeGreaterThan(0)
  })

  it('allows loop side, midpoint offset and displayName changes', () => {
    const prev = paths()
    const next = prev.map((p) =>
      p.id === 'p2' ? { ...p, side: 'left', visual: { midpointOffset: { x: 3, y: 4 } }, displayName: 'x₁ ↔ x₁' } : p
    )
    const rej: string[] = []
    const out = restrictPathsToLayoutChanges(prev, next, rej)
    expect(out[1]).toMatchObject({ side: 'left', visual: { midpointOffset: { x: 3, y: 4 } }, displayName: 'x₁ ↔ x₁', value: 1 })
    expect(rej).toEqual([])
  })
})

describe('layoutGuard: models', () => {
  it('rejects model label and parameterTypes changes, keeps node moves', () => {
    const prev = [model()]
    const next = [{
      ...prev[0],
      label: 'Renamed',
      parameterTypes: {},
      nodes: prev[0].nodes.map((n) => (n.id === 'c1' ? { ...n, y: 5 } : n)),
    }]
    const rej: string[] = []
    const out = restrictModelsToLayoutChanges(prev, next, rej)
    expect(out[0].label).toBe('Model')
    expect(out[0].parameterTypes).toEqual({ errorVariance: {} })
    expect(out[0].nodes[2].y).toBe(5)
    expect(rej).toHaveLength(2)
  })

  it('rejects clearing the canvas and adding/removing models', () => {
    const prev = [model()]
    expect(restrictModelsToLayoutChanges(prev, [{ ...prev[0], nodes: [], paths: [], label: '' }])).toBe(prev)
    expect(restrictModelsToLayoutChanges(prev, [])).toBe(prev)
    expect(restrictModelsToLayoutChanges(prev, [...prev, { ...model(), id: 'm2' }])).toBe(prev)
  })

  it('returns prev unchanged (same identity) for a no-op', () => {
    const prev = [model()]
    const next = [{ ...prev[0], nodes: prev[0].nodes.map((n) => ({ ...n })) }]
    expect(restrictModelsToLayoutChanges(prev, next)).toBe(prev)
  })
})
