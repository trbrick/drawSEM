import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'

// The default SEM layer hides dataset nodes, so adding one (e.g. data loaded
// from R) must switch the view to the All layer.

function schema(withDataset: boolean): GraphSchema {
  const nodes: any[] = [
    { label: 'x', type: 'variable', visual: { x: 0, y: 0 } },
    { label: 'y', type: 'variable', visual: { x: 100, y: 0 } },
  ]
  if (withDataset) {
    nodes.push({
      label: 'mydata', type: 'dataset', visual: { x: 300, y: 450 },
      datasetSource: { type: 'embedded', format: 'json', encoding: 'UTF-8', columnTypes: { x: 'number' }, object: [{ x: 1 }], rowCount: 1 },
    })
  }
  return {
    schemaVersion: 0,
    models: { model1: { label: 'm', nodes, paths: [{ from: 'x', to: 'y', numberOfArrows: 1 }] } },
  } as GraphSchema
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanup()
})

describe('dataset layer switching', () => {
  it('switches from the SEM layer to All when a dataset node is added', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
    let receive: ((s: GraphSchema) => void) | null = null
    const adapter: GraphAdapter = {
      load: vi.fn(async () => { throw new Error('unused') }),
      save: vi.fn(async () => {}),
      export: vi.fn(async () => 'mock'),
      onModelReceived: (cb) => { receive = cb },
    }
    render(
      <AdapterContext.Provider value={adapter}>
        <CanvasTool initialSchema={schema(false)} />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(screen.queryByText('Variables, constants & SEM paths')).not.toBeNull())
    expect(receive).not.toBeNull()
    act(() => receive!(schema(true)))
    await waitFor(() => expect(screen.queryByText('All elements')).not.toBeNull())
  })

  it('does not loop when the initial schema is invalid (no model loaded)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
    const bad: any = schema(true)
    bad.models.model1.nodes[2].datasetSource.columnTypes = { x: 'numeric' }   // not in the enum
    render(
      <AdapterContext.Provider value={{ load: vi.fn(), save: vi.fn(), export: vi.fn() } as unknown as GraphAdapter}>
        <CanvasTool initialSchema={bad} />
      </AdapterContext.Provider>
    )
    // Before the fix this never settled: an effect keyed on a fresh [] re-ran every render.
    await waitFor(() => expect(screen.getByText(/^Nodes: 0/)).toBeTruthy())
  })

  it('keeps the SEM layer when a model with a dataset is first loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
    render(
      <AdapterContext.Provider value={{ load: vi.fn(), save: vi.fn(), export: vi.fn() } as unknown as GraphAdapter}>
        <CanvasTool initialSchema={schema(true)} />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(screen.queryByText('Variables, constants & SEM paths')).not.toBeNull())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('All elements')).toBeNull()
  })

  it('brings a newly attached dataset into view (as R places it, away from the other nodes)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
    let receive: ((s: GraphSchema) => void) | null = null
    const adapter: GraphAdapter = {
      load: vi.fn(async () => { throw new Error('unused') }),
      save: vi.fn(async () => {}),
      export: vi.fn(async () => 'mock'),
      onModelReceived: (cb) => { receive = cb },
    }
    // a fresh model with one unplaced variable, then Load Data adds a dataset
    // at R's fixed spot (see .attachDatasetNode)
    const fresh = { schemaVersion: 0, models: { model1: { nodes: [{ label: 'x', type: 'variable' }], paths: [] } } } as unknown as GraphSchema
    const attached = { schemaVersion: 0, models: { model1: { nodes: [
      { label: 'x', type: 'variable' },
      { label: 'mydata', type: 'dataset', visual: { x: 300, y: 450 },
        datasetSource: { type: 'embedded', format: 'json', encoding: 'UTF-8', columnTypes: { x: 'number' }, object: [{ x: 1 }], rowCount: 1 } },
    ], paths: [] } } } as unknown as GraphSchema
    const { container } = render(
      <AdapterContext.Provider value={adapter}>
        <CanvasTool initialSchema={fresh} />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(receive).not.toBeNull())
    act(() => receive!(attached))
    const canvas = () => container.querySelector('marker#arrow-end')!.closest('svg')!
    await waitFor(() => {
      const [x, y, w, h] = canvas().getAttribute('viewBox')!.split(/\s+/).map(Number)
      expect(300).toBeGreaterThan(x); expect(300).toBeLessThan(x + w)
      expect(450).toBeGreaterThan(y); expect(450).toBeLessThan(y + h)
    })
  })

  it('places a dataset attached from R beside the diagram, in view', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
    let receive: ((s: GraphSchema) => void) | null = null
    let last: any = null
    const adapter: GraphAdapter = {
      load: vi.fn(async () => { throw new Error('unused') }),
      save: vi.fn(async () => {}),
      export: vi.fn(async () => 'mock'),
      onModelReceived: (cb) => { receive = cb },
    }
    // variables drawn in the editor, then Load Data attaches a dataset with no position
    const drawn = { schemaVersion: 0, models: { model1: { nodes: [
      { label: 'x', type: 'variable', visual: { x: -400, y: -300 } },
      { label: 'y', type: 'variable', visual: { x: -250, y: -300 } },
    ], paths: [] } } } as unknown as GraphSchema
    const attached = JSON.parse(JSON.stringify(drawn))
    attached.models.model1.nodes.push({ label: 'mydata', type: 'dataset',
      datasetSource: { type: 'embedded', format: 'json', encoding: 'UTF-8', columnTypes: { x: 'number' }, object: [{ x: 1 }], rowCount: 1 } })
    const { container } = render(
      <AdapterContext.Provider value={adapter}>
        <CanvasTool initialSchema={drawn} onModelChange={(s) => { last = s }} />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(receive).not.toBeNull())
    act(() => receive!(attached))
    await waitFor(() => {
      const ds = last.models.model1.nodes.find((n: any) => n.label === 'mydata')
      expect(ds.visual.x).toBeGreaterThan(-250)        // to the right of the variables
      const [vx, vy, vw, vh] = container.querySelector('marker#arrow-end')!.closest('svg')!
        .getAttribute('viewBox')!.split(/\s+/).map(Number)
      expect(ds.visual.x).toBeGreaterThan(vx); expect(ds.visual.x).toBeLessThan(vx + vw)
      expect(ds.visual.y).toBeGreaterThan(vy); expect(ds.visual.y).toBeLessThan(vy + vh)
    })
    // the variables did not move
    const xNode = last.models.model1.nodes.find((n: any) => n.label === 'x')
    expect(xNode.visual).toEqual({ x: -400, y: -300 })
  })
})
