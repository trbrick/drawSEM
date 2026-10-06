/**
 * Lossless, non-stamping round trip: load(schema) -> no edit -> serialize must
 * deep-equal the input, and an edit must change only what it edits.
 * See "Noise files/widget-lossless-roundtrip-plan.md".
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { convertDocToRuntime, docPassthroughOf } from '../../src/utils/runtimeConverter'
import { modelsToSchema } from '../../src/utils/runtimeToSchema'
import { autoLayout } from '../../src/utils/autoLayout'
import { validateGraph } from '../../src/validateGraph'
import {
  OWNED_DOC_KEYS,
  OWNED_MODEL_KEYS,
  OWNED_NODE_KEYS,
  OWNED_PATH_KEYS,
  cyclePathDirection,
  makeDataPath,
  makeNode,
  makePath,
  makeVariancePath,
  setPathDirection,
  withManifestLatent,
} from '../../src/utils/helpers'
import { deepDiff } from './test-helpers'

const FIXTURES = join(__dirname, '../fixtures/models')

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

/** load -> serialize, with no edit in between */
function roundTrip(doc: any): any {
  const models = convertDocToRuntime(doc)
  return modelsToSchema(models, docPassthroughOf(doc))
}

function fixtureFiles(): Array<{ name: string; path: string }> {
  const top = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: f, path: join(FIXTURES, f) }))
  const layout = readdirSync(join(FIXTURES, 'layout'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: `layout/${f}`, path: join(FIXTURES, 'layout', f) }))
  const example = { name: 'examples/graph.example.json', path: join(__dirname, '../../examples/graph.example.json') }
  return [...top, ...layout, example]
}

describe('round trip: fit results survive', () => {
  it('a fitted model keeps provenance.fitResults through load -> sync', () => {
    const doc = readJson(join(FIXTURES, 'kitchen-sink.json'))
    const before = clone(doc)
    const out = roundTrip(doc)
    expect(out.models.fitted.provenance).toEqual(before.models.fitted.provenance)
    expect(out.models.fitted.provenance.fitResults[0].parameterEstimates).toEqual({ b1: 0.7, e1: 0.3 })
  })
})

describe('round trip: kitchen-sink fixture', () => {
  it('is valid against graph.schema.json and has two models', () => {
    const doc = readJson(join(FIXTURES, 'kitchen-sink.json'))
    const res = validateGraph(doc)
    expect(res.errors ?? []).toEqual([])
    expect(res.ok).toBe(true)
    expect(Object.keys(doc.models)).toHaveLength(2)
  })

  it('round-trips to a deep-equal document', () => {
    const doc = readJson(join(FIXTURES, 'kitchen-sink.json'))
    const before = clone(doc)
    const out = roundTrip(doc)
    expect(deepDiff(out, before)).toEqual([])
    expect(out).toEqual(before)
  })
})

describe('round trip: identity over every fixture', () => {
  for (const { name, path } of fixtureFiles()) {
    it(name, () => {
      const doc = readJson(path)
      const before = clone(doc)
      const out = roundTrip(doc)
      expect(deepDiff(out, before)).toEqual([])
      expect(out).toEqual(before)
    })
  }
})

describe('autoLayout does not mutate its input', () => {
  it.each(fixtureFiles())('$name', ({ path }) => {
    const doc = readJson(path)
    const before = clone(doc)
    autoLayout(doc)
    expect(doc).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// Edits change only what they edit
// ---------------------------------------------------------------------------

function loadKitchenSink() {
  const doc = readJson(join(FIXTURES, 'kitchen-sink.json'))
  const before = clone(doc)
  const models = convertDocToRuntime(doc)
  const docPt = docPassthroughOf(doc)
  const fitted = models.find((m) => m.id === 'fitted')!
  const nodeId = (label: string) => fitted.nodes.find((n) => n.label === label)!.id
  const pathIndex = (from: string, to: string) =>
    fitted.paths.findIndex((p) => p.from === nodeId(from) && p.to === nodeId(to))
  const serialize = () => modelsToSchema(models, docPt) as any
  return { before, models, fitted, nodeId, pathIndex, serialize }
}

describe('round trip: edits change only what they edit', () => {
  it('(a) dragging a node changes only its visual.x/y', () => {
    const k = loadKitchenSink()
    k.fitted.nodes = k.fitted.nodes.map((n) => (n.label === 'F' ? { ...n, x: 333, y: 444 } : n))
    const out = k.serialize()
    expect(deepDiff(out, k.before).sort()).toEqual(['models.fitted.nodes[0].visual.x', 'models.fitted.nodes[0].visual.y'])
    expect(out.models.fitted.nodes[0].visual).toEqual({ x: 333, y: 444, angle: 15 })
  })

  it('(a2) dragging an unplaced node gives it a position and nothing else', () => {
    const k = loadKitchenSink()
    expect(k.before.models.fitted.nodes[3].visual).toBeUndefined()
    k.fitted.nodes = k.fitted.nodes.map((n) => (n.label === '1' ? { ...n, x: 5, y: 6 } : n))
    const out = k.serialize()
    expect(deepDiff(out, k.before)).toEqual(['models.fitted.nodes[3].visual'])
    expect(out.models.fitted.nodes[3]).toEqual({ label: '1', type: 'constant', visual: { x: 5, y: 6 } })
  })

  it('(b) renaming a node changes its label and the from/to of its paths only', () => {
    const k = loadKitchenSink()
    k.fitted.nodes = k.fitted.nodes.map((n) => (n.label === 'x1' ? { ...n, label: 'z1' } : n))
    const out = k.serialize()
    const expected = clone(k.before)
    const m = expected.models.fitted
    m.nodes[1].label = 'z1'
    for (const p of m.paths) {
      if (p.from === 'x1') p.from = 'z1'
      if (p.to === 'x1') p.to = 'z1'
    }
    expect(out).toEqual(expected)
    // the data path's label is the column name, not the node label: unchanged
    expect(out.models.fitted.paths[7].label).toBe('x1')
  })

  it('(c) toggling twoSided changes only numberOfArrows', () => {
    const k = loadKitchenSink()
    const i = k.pathIndex('x1', 'x2')
    k.fitted.paths = k.fitted.paths.map((p, j) => (j === i ? setPathDirection(p, 'forward') : p))
    const out = k.serialize()
    expect(deepDiff(out, k.before)).toEqual([`models.fitted.paths[${i}].numberOfArrows`])
    expect(out.models.fitted.paths[i].numberOfArrows).toBe(1)
  })

  it('(d) reversing a path swaps from/to only, and the reversal is persisted', () => {
    const k = loadKitchenSink()
    const i = k.pathIndex('F', 'x2')
    k.fitted.paths = k.fitted.paths.map((p, j) => (j === i ? setPathDirection(p, 'reversed') : p))
    const out = k.serialize()
    expect(deepDiff(out, k.before).sort()).toEqual([`models.fitted.paths[${i}].from`, `models.fitted.paths[${i}].to`])
    expect(out.models.fitted.paths[i]).toMatchObject({ from: 'x2', to: 'F', numberOfArrows: 1 })
    // and it survives a reload
    const again = modelsToSchema(convertDocToRuntime(out), docPassthroughOf(out)) as any
    expect(again).toEqual(out)
  })

  it('(d2) the double-click cycle reverses through from/to and returns to two-headed', () => {
    const k = loadKitchenSink()
    const i = k.pathIndex('F', 'x2')
    const p0 = k.fitted.paths[i]
    const p1 = cyclePathDirection(p0) // one-headed -> reversed
    expect([p1.from, p1.to, p1.twoSided]).toEqual([p0.to, p0.from, false])
    const p2 = cyclePathDirection(p1) // -> two-headed
    expect(p2.twoSided).toBe(true)
    const p3 = cyclePathDirection(p2) // -> one-headed, same orientation
    expect([p3.from, p3.to, p3.twoSided]).toEqual([p2.from, p2.to, false])
    k.fitted.paths = k.fitted.paths.map((p, j) => (j === i ? p1 : p))
    const out = k.serialize()
    expect(JSON.stringify(out)).not.toContain('reversedByCycle')
    expect(deepDiff(out, k.before).sort()).toEqual([`models.fitted.paths[${i}].from`, `models.fitted.paths[${i}].to`])
  })

  it('(e) setting a value changes only value (absent -> present)', () => {
    const k = loadKitchenSink()
    const i = k.pathIndex('F', 'x2')
    expect(k.before.models.fitted.paths[i].value).toBeUndefined()
    k.fitted.paths = k.fitted.paths.map((p, j) => (j === i ? { ...p, value: 0.25 } : p))
    const out = k.serialize()
    expect(deepDiff(out, k.before)).toEqual([`models.fitted.paths[${i}].value`])
  })

  it('(f) deleting a node removes it and its paths, nothing else', () => {
    const k = loadKitchenSink()
    const id = k.nodeId('x2')
    k.fitted.nodes = k.fitted.nodes.filter((n) => n.id !== id)
    k.fitted.paths = k.fitted.paths.filter((p) => p.from !== id && p.to !== id)
    const out = k.serialize()
    const expected = clone(k.before)
    const m = expected.models.fitted
    m.nodes = m.nodes.filter((n: any) => n.label !== 'x2')
    m.paths = m.paths.filter((p: any) => p.from !== 'x2' && p.to !== 'x2')
    expect(out).toEqual(expected)
  })

  it('(g) a new node has no size and no runtime id in the output', () => {
    const k = loadKitchenSink()
    const n = makeNode({ label: 'V9', type: 'variable', x: 1, y: 2 })
    k.fitted.nodes = [...k.fitted.nodes, n]
    const out = k.serialize()
    expect(deepDiff(out, k.before)).toEqual(['models.fitted.nodes[5]'])
    expect(out.models.fitted.nodes[5]).toEqual({ label: 'V9', type: 'variable', visual: { x: 1, y: 2 } })
  })

  it('(h) new paths are minimal and carry no runtime ids', () => {
    const k = loadKitchenSink()
    const n = makeNode({ label: 'V9', type: 'variable', x: 1, y: 2 })
    const variance = makeVariancePath(n.id, 'V9')
    const regression = makePath({ from: k.nodeId('F'), to: n.id, twoSided: false, displayName: 'F → V9' })
    const data = makeDataPath(k.nodeId('data'), n.id, 'V9')
    k.fitted.nodes = [...k.fitted.nodes, n]
    k.fitted.paths = [...k.fitted.paths, variance, regression, data]
    const out = k.serialize()
    const paths = out.models.fitted.paths
    expect(paths.slice(-3)).toEqual([
      { from: 'V9', to: 'V9', numberOfArrows: 2, freeParameter: true, parameterType: 'errorVariance' },
      { from: 'F', to: 'V9', numberOfArrows: 1 },
      { from: 'data', to: 'V9', type: 'data', label: 'V9' },
    ])
    const json = JSON.stringify(out)
    for (const m of k.models) {
      for (const x of [...m.nodes, ...m.paths]) expect(json).not.toContain(JSON.stringify(x.id))
    }
    expect(validateGraph(out).ok).toBe(true)
  })

  it('setting then clearing manifestLatent leaves the node unchanged', () => {
    const k = loadKitchenSink()
    k.fitted.nodes = k.fitted.nodes.map((n) => (n.label === 'x1' ? withManifestLatent(withManifestLatent(n, 'manifest'), undefined) : n))
    expect(k.serialize()).toEqual(k.before)
  })
})

// ---------------------------------------------------------------------------
// Owned vs pass-through keys
// ---------------------------------------------------------------------------

describe('round trip: owned keys', () => {
  const schema = readJson(join(__dirname, '../../schema/graph.schema.json'))
  const modelSchema = schema.properties.models.additionalProperties
  const nodeSchema = modelSchema.properties.nodes.items
  const pathSchema = modelSchema.properties.paths.items

  // Every schema property must be classified: owned (edited via runtime state)
  // or pass-through (kept verbatim). Adding a schema field fails this test until
  // it is classified; making a pass-through field editable requires moving it to
  // the OWNED_* lists, or its edits would be lost.
  const PASSTHROUGH = {
    doc: ['schemaVersion', 'meta'],
    model: ['meta', 'extensions', 'provenance', 'visualization', 'optimization.fitFunction', 'optimization.missingness'],
    node: ['visual.angle'],
    path: ['description', 'tags'],
  }
  // node `description` is owned (it lives on the runtime node)

  const flatten = (spec: { keys: readonly string[]; nested: Record<string, readonly string[]> }) => [
    ...spec.keys,
    ...Object.entries(spec.nested).flatMap(([k, subs]) => subs.map((s) => `${k}.${s}`)),
  ]
  const schemaKeys = (s: any, nested: string[]) =>
    Object.keys(s.properties).flatMap((k) =>
      nested.includes(k) ? Object.keys(s.properties[k].properties).map((sk) => `${k}.${sk}`) : [k]
    )

  it.each([
    ['doc', schema, OWNED_DOC_KEYS],
    ['model', modelSchema, OWNED_MODEL_KEYS],
    ['node', nodeSchema, OWNED_NODE_KEYS],
    ['path', pathSchema, OWNED_PATH_KEYS],
  ] as const)('%s: every schema key is owned or pass-through, never both', (kind, s, spec) => {
    const owned = flatten(spec)
    const pt = PASSTHROUGH[kind]
    expect(owned.filter((k) => pt.includes(k))).toEqual([])
    expect([...owned, ...pt].sort()).toEqual(schemaKeys(s, Object.keys(spec.nested)).sort())
  })

  it('passthrough never contains an owned key', () => {
    const k = loadKitchenSink()
    for (const m of k.models) {
      for (const key of OWNED_MODEL_KEYS.keys) expect(m.passthrough ?? {}).not.toHaveProperty(key)
      expect(m.passthrough?.optimization ?? {}).not.toHaveProperty('parameterTypes')
      for (const n of m.nodes) {
        for (const key of OWNED_NODE_KEYS.keys) expect(n.passthrough ?? {}).not.toHaveProperty(key)
        for (const key of OWNED_NODE_KEYS.nested.visual) expect(n.passthrough?.visual ?? {}).not.toHaveProperty(key)
      }
      for (const p of m.paths) {
        for (const key of OWNED_PATH_KEYS.keys) expect(p.passthrough ?? {}).not.toHaveProperty(key)
        for (const key of OWNED_PATH_KEYS.nested.visual) expect(p.passthrough?.visual ?? {}).not.toHaveProperty(key)
      }
    }
  })

  // runtime field -> schema key, with a new value; the edit must show up in the
  // output at exactly that key.
  const nodeEdits: Array<[string, string, any]> = [
    ['label', 'label', 'renamed'],
    ['type', 'type', 'constant'],
    ['description', 'description', 'changed'],
    ['tags', 'tags', ['t']],
    ['variableCharacteristics', 'variableCharacteristics', { manifestLatent: 'manifest' }],
    ['bindingMappings', 'bindingMappings', { a: 'b' }],
    ['datasetSource', 'datasetSource', { type: 'file', location: 'a.csv', columnTypes: {} }],
    ['x', 'visual.x', 1],
    ['y', 'visual.y', 2],
    ['width', 'visual.width', 3],
    ['height', 'visual.height', 4],
  ]
  it.each(nodeEdits)('node %s edit is written to %s and nothing else changes', (field, key, value) => {
    const k = loadKitchenSink()
    // node F has no paths whose labels depend on it other than via from/to
    const target = field === 'label' ? 'x2' : 'F'
    k.fitted.nodes = k.fitted.nodes.map((n) => (n.label === target ? ({ ...n, [field]: value } as any) : n))
    const out = k.serialize()
    const idx = k.before.models.fitted.nodes.findIndex((n: any) => n.label === target)
    const diff = deepDiff(out, k.before).filter((d) => !d.includes('.paths['))
    const at = `models.fitted.nodes[${idx}].${key}`
    expect(diff.length).toBeGreaterThan(0)
    expect(diff.filter((d) => d !== at && !d.startsWith(at + '.') && !d.startsWith(at + '['))).toEqual([])
    const [top, sub] = key.split('.')
    const written = sub ? out.models.fitted.nodes[idx][top][sub] : out.models.fitted.nodes[idx][top]
    expect(written).toEqual(value)
  })

  const pathEdits: Array<[string, string, any, any]> = [
    ['twoSided', 'numberOfArrows', true, 2],
    ['type', 'type', 'constant', 'constant'],
    ['label', 'label', 'renamed', 'renamed'],
    ['value', 'value', 0.123, 0.123],
    ['freeParameter', 'freeParameter', 'named', 'named'],
    ['parameterType', 'parameterType', 'errorVariance', 'errorVariance'],
    ['optimization', 'optimization', { start: 2 }, { start: 2 }],
    ['side', 'visual.loopSide', 'top', 'top'],
    ['visual', 'visual.midpointOffset', { midpointOffset: { x: 9, y: 9 } }, { x: 9, y: 9 }],
  ]
  it.each(pathEdits)('path %s edit is written to %s and nothing else changes', (field, key, value, written) => {
    const k = loadKitchenSink()
    const i = 0 // F -> x1, has description/tags pass-through
    k.fitted.paths = k.fitted.paths.map((p, j) => (j === i ? ({ ...p, [field]: value } as any) : p))
    const out = k.serialize()
    const at = `models.fitted.paths[${i}].${key}`
    const diff = deepDiff(out, k.before)
    expect(diff.length).toBeGreaterThan(0)
    expect(diff.filter((d) => d !== at && !d.startsWith(at + '.') && !d.startsWith(at + '['))).toEqual([])
    const [top, sub] = key.split('.')
    const got = sub ? out.models.fitted.paths[i][top][sub] : out.models.fitted.paths[i][top]
    expect(got).toEqual(written)
    // pass-through keys untouched
    expect(out.models.fitted.paths[i].description).toBe('loading of x1')
    expect(out.models.fitted.paths[i].tags).toEqual(['measurement'])
  })

  it('model label and parameterTypes edits are written; pass-through untouched', () => {
    const k = loadKitchenSink()
    k.fitted.label = 'New name'
    k.fitted.parameterTypes = { loading: {} }
    const out = k.serialize()
    expect(deepDiff(out, k.before).sort()).toEqual([
      'models.fitted.label',
      'models.fitted.optimization.parameterTypes.errorVariance',
      'models.fitted.optimization.parameterTypes.loading.bounds',
      'models.fitted.optimization.parameterTypes.loading.start',
    ])
    expect(out.models.fitted.optimization.fitFunction).toBe('ML')
    expect(out.models.fitted.provenance).toEqual(k.before.models.fitted.provenance)
  })

  it('a model without label or optimization does not gain them', () => {
    const k = loadKitchenSink()
    const out = k.serialize()
    expect(out.models.second).not.toHaveProperty('label')
    expect(out.models.second).not.toHaveProperty('optimization')
  })
})
