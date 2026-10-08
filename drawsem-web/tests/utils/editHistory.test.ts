import { describe, it, expect } from 'vitest'
import { convertDocToRuntime } from '../../src/utils/runtimeConverter'
import { modelsToSchema } from '../../src/utils/runtimeToSchema'
import {
  serializeEditHistory,
  parseEditHistory,
  restoreEditHistory,
  carryForwardHostState,
  comparableDocument,
  EDIT_HISTORY_FORMAT,
  type DocSnapshot,
} from '../../src/utils/editHistory'

const rows = [{ x: 1.25, y: 2 }, { x: 3.75, y: 4 }]

function doc(opts: { ax?: number; extraNode?: boolean; provenance?: any; data?: any[] } = {}): any {
  const nodes: any[] = [
    { label: 'A', type: 'variable', visual: { x: opts.ax ?? 0, y: 0 } },
    { label: 'B', type: 'variable', visual: { x: 200, y: 0 } },
    {
      label: 'd', type: 'dataset', visual: { x: -200, y: 0 },
      datasetSource: { type: 'embedded', format: 'json', columnTypes: { x: 'numeric', y: 'numeric' }, object: opts.data ?? rows },
    },
  ]
  if (opts.extraNode) nodes.push({ label: 'C', type: 'variable', visual: { x: 400, y: 0 } })
  const model: any = {
    label: 'M',
    nodes,
    paths: [
      { from: 'A', to: 'B', numberOfArrows: 1, freeParameter: 'b', value: 0.5 },
      { from: 'd', to: 'A', type: 'data' },
    ],
  }
  if (opts.provenance) model.provenance = opts.provenance
  return { schemaVersion: 0, models: { m: model } }
}

const snap = (d: any): DocSnapshot => ({ models: convertDocToRuntime(d), currentModelId: 'm' })

const fit = { fitResults: [{ structureHash: 'abc', fitValue: 12.3 }] }

describe('serializeEditHistory / restoreEditHistory', () => {
  it('round-trips the undo and redo stacks in schema form', () => {
    const past = [snap(doc({ ax: 0 })), snap(doc({ ax: 10 }))]
    const present = snap(doc({ ax: 20 }))
    const future = [snap(doc({ ax: 40 })), snap(doc({ ax: 30 }))]
    const text = serializeEditHistory({ past, future }, present)!
    expect(typeof text).toBe('string')
    const h = parseEditHistory(text)!
    expect(h.format).toBe(EDIT_HISTORY_FORMAT)
    expect(h.past).toHaveLength(2)
    expect(h.future).toHaveLength(2)
    // labels, not runtime ids
    expect(h.past[0].models.m.paths[0]).toMatchObject({ from: 'A', to: 'B' })

    // Reopened on the same document (runtime ids regenerated): stacks restored as saved
    const restored = restoreEditHistory(text, snap(doc({ ax: 20 })))!
    expect(restored.matched).toBe(true)
    const xOfA = (s: DocSnapshot) => s.models[0].nodes.find((n) => n.label === 'A')!.x
    expect(restored.past.map(xOfA)).toEqual([0, 10])
    expect(restored.future.map(xOfA)).toEqual([40, 30])
    expect(restored.past[0].currentModelId).toBe('m')
    // and the restored snapshots serialize back to the same documents
    expect(comparableDocument(restored.past[1].models)).toBe(comparableDocument(past[1].models))
    expect(modelsToSchema(restored.past[0].models).models.m.nodes[2].datasetSource).toMatchObject({ object: rows })
  })

  it('stores embedded data once, not per snapshot, and leaves out provenance', () => {
    const past = Array.from({ length: 5 }, (_, i) => snap(doc({ ax: i, provenance: fit })))
    const text = serializeEditHistory({ past, future: [] }, snap(doc({ ax: 9, provenance: fit })))!
    const h = parseEditHistory(text)!
    expect(Object.keys(h.data!)).toHaveLength(1)
    expect(text.split('"x":3.75').length - 1).toBe(1) // the rows appear once
    expect(h.past[0].models.m.nodes[2].datasetSource.objectRef).toBe(Object.keys(h.data!)[0])
    expect(h.past[0].models.m.nodes[2].datasetSource.object).toBeUndefined()
    expect(text).not.toContain('fitResults')
  })

  it('returns null when there is nothing to undo or redo', () => {
    expect(serializeEditHistory({ past: [], future: [] }, snap(doc()))).toBeNull()
  })

  it('caps the number of steps, dropping the oldest undo steps first', () => {
    const past = Array.from({ length: 8 }, (_, i) => snap(doc({ ax: i })))
    const future = [snap(doc({ ax: 100 }))]
    const h = parseEditHistory(serializeEditHistory({ past, future }, snap(doc({ ax: 50 })), { maxSteps: 4 }))!
    expect(h.past.map((s) => s.models.m.nodes[0].visual.x)).toEqual([5, 6, 7])
    expect(h.future).toHaveLength(1)
  })

  it('caps the size, dropping the oldest undo steps first', () => {
    const past = Array.from({ length: 10 }, (_, i) => snap(doc({ ax: i })))
    const present = snap(doc({ ax: 50 }))
    const one = JSON.stringify(parseEditHistory(serializeEditHistory({ past: [past[0]], future: [] }, present))!.past[0]).length
    const h = parseEditHistory(serializeEditHistory({ past, future: [] }, present, { maxChars: one * 4 }))!
    expect(h.past.length).toBeLessThan(4)
    expect(h.past[h.past.length - 1].models.m.nodes[0].visual.x).toBe(9)
    // nothing fits: no history at all
    expect(serializeEditHistory({ past, future: [] }, present, { maxChars: 10 })).toBeNull()
  })

  it('ignores malformed or foreign histories', () => {
    const opened = snap(doc())
    expect(restoreEditHistory('not json', opened)).toBeNull()
    expect(restoreEditHistory(JSON.stringify({ format: 'other', version: 1 }), opened)).toBeNull()
    expect(restoreEditHistory(undefined, opened)).toBeNull()
  })

  it('treats number noise from R and a fit in R as no change', () => {
    const text = serializeEditHistory({ past: [snap(doc({ ax: 0 }))], future: [snap(doc({ ax: 5 }))] }, snap(doc({ ax: 20.0000001 })))!
    // setLocation() writes whole numbers; a fit adds provenance
    const restored = restoreEditHistory(text, snap(doc({ ax: 20, provenance: fit })))!
    expect(restored.matched).toBe(true)
    expect(restored.future).toHaveLength(1)
  })

  it('a model changed in R in between: the saved state becomes an undo step, redo steps are dropped', () => {
    const text = serializeEditHistory({ past: [snap(doc({ ax: 0 }))], future: [snap(doc({ ax: 5 }))] }, snap(doc({ ax: 20 })))!
    const restored = restoreEditHistory(text, snap(doc({ ax: 20, extraNode: true })))!
    expect(restored.matched).toBe(false)
    expect(restored.past).toHaveLength(2)
    expect(restored.past[1].models[0].nodes.map((n) => n.label)).toEqual(['A', 'B', 'd'])
    expect(restored.future).toHaveLength(0)
  })

  it('layout-only editor: keeps a layout history, drops one whose steps change structure', () => {
    const layoutOnly = serializeEditHistory({ past: [snap(doc({ ax: 0 }))], future: [] }, snap(doc({ ax: 20 })))!
    expect(restoreEditHistory(layoutOnly, snap(doc({ ax: 20 })), { layoutOnly: true })).not.toBeNull()
    // moved in R (setLocation) since: still only layout, appended
    expect(restoreEditHistory(layoutOnly, snap(doc({ ax: 77 })), { layoutOnly: true })!.past).toHaveLength(2)

    const structural = serializeEditHistory({ past: [snap(doc({ extraNode: true }))], future: [] }, snap(doc()))!
    expect(restoreEditHistory(structural, snap(doc()))).not.toBeNull()
    expect(restoreEditHistory(structural, snap(doc()), { layoutOnly: true })).toBeNull()
  })
})

describe('carryForwardHostState', () => {
  it('keeps the current provenance (fit results) when restoring an older snapshot', () => {
    const older = convertDocToRuntime(doc({ ax: 0 }))
    const current = convertDocToRuntime(doc({ ax: 30, provenance: fit }))
    const out = carryForwardHostState(older, current)
    expect(out[0].passthrough?.provenance).toBe(current[0].passthrough!.provenance)
    expect(out[0].nodes[0].x).toBe(0)
  })

  it('drops provenance a snapshot had when the current document has none', () => {
    const older = convertDocToRuntime(doc({ provenance: fit }))
    const out = carryForwardHostState(older, convertDocToRuntime(doc()))
    expect(out[0].passthrough?.provenance).toBeUndefined()
    expect(modelsToSchema(out).models.m).not.toHaveProperty('provenance')
  })

  it('keeps column summaries R sent for a dataset it holds', () => {
    const sessionDoc = () => {
      const d = doc()
      delete d.models.m.nodes[2].datasetSource
      return d
    }
    const older = convertDocToRuntime(sessionDoc())
    const current = convertDocToRuntime(sessionDoc())
    current[0].nodes[2] = { ...current[0].nodes[2], dataset: { fileName: 'd', headers: ['x'], columns: [] } }
    const out = carryForwardHostState(older, current)
    expect(out[0].nodes[2].dataset).toEqual({ fileName: 'd', headers: ['x'], columns: [] })
  })

  it('returns the target itself when there is nothing to carry', () => {
    const t = convertDocToRuntime(doc())
    expect(carryForwardHostState(t, convertDocToRuntime(doc({ ax: 5 })))).toBe(t)
  })
})
