import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'

// Data paths are drawn as cables: one trunk per dataset, then a branch per
// variable, with no arrowheads. The trunk must follow the data paths' layer
// visibility (it used to stay visible, and was drawn once per data path).

function schema(): GraphSchema {
  return {
    schemaVersion: 0,
    models: {
      m: {
        label: 'm',
        nodes: [
          { label: 'x1', type: 'variable', visual: { x: 0, y: 0 } },
          { label: 'x2', type: 'variable', visual: { x: 100, y: 0 } },
          { label: 'x3', type: 'variable', visual: { x: 200, y: 0 } },
          { label: 'data', type: 'dataset', visual: { x: 100, y: 200 },
            datasetSource: { type: 'embedded', columnTypes: { x1: 'number', x2: 'number', x3: 'number' },
                             object: [{ x1: 1, x2: 2, x3: 3 }] } },
        ],
        paths: [
          { from: 'data', to: 'x1', type: 'data', label: 'x1' },
          { from: 'data', to: 'x2', type: 'data', label: 'x2' },
          { from: 'data', to: 'x3', type: 'data', label: 'x3' },
          { from: 'x1', to: 'x2', numberOfArrows: 1 },
        ],
      },
    },
  } as GraphSchema
}

function renderCanvas() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  const adapter = { load: vi.fn(), save: vi.fn(), export: vi.fn() } as unknown as GraphAdapter
  return render(
    <AdapterContext.Provider value={adapter}>
      <CanvasTool initialSchema={schema()} />
    </AdapterContext.Provider>
  )
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); cleanup() })

describe('data cables', () => {
  it('draws data paths as cables (no arrowheads) and other paths as before', async () => {
    const { container } = renderCanvas()
    await waitFor(() => expect(container.querySelectorAll('path[data-cable="true"]').length).toBe(3))
    container.querySelectorAll('path[data-cable="true"]').forEach((el) => {
      expect(el.getAttribute('marker-end')).toBeNull()
    })
    const others = Array.from(container.querySelectorAll('path[data-path-id]')).filter((el) => !el.hasAttribute('data-cable'))
    expect(others).toHaveLength(1)
    expect(others[0].getAttribute('marker-end')).toContain('arrow-end')
  })

  it('draws one trunk per dataset, not one per data path', async () => {
    const { container } = renderCanvas()
    await waitFor(() => expect(container.querySelectorAll('path[data-cable="true"]').length).toBe(3))
    expect(container.querySelectorAll('path[data-cable-trunk]')).toHaveLength(1)
  })

  it('hides the trunk with the data paths when the data layer is not in view', async () => {
    const { container } = renderCanvas()
    await waitFor(() => expect(container.querySelectorAll('path[data-cable-trunk]').length).toBe(1))
    const trunk = () => container.querySelector('path[data-cable-trunk]')!
    const branch = () => container.querySelector('path[data-cable="true"]')!
    // default view: SEM layer, off-layer elements hidden
    expect(screen.getByText('Variables, constants & SEM paths')).toBeTruthy()
    expect(trunk().getAttribute('opacity')).toBe(branch().getAttribute('opacity'))
    expect(Number(trunk().getAttribute('opacity'))).toBe(0)
    fireEvent.click(screen.getByText('Complete Graph'))
    await waitFor(() => expect(Number(trunk().getAttribute('opacity'))).toBe(1))
    expect(trunk().getAttribute('opacity')).toBe(branch().getAttribute('opacity'))
  })

  it('Auto Layout puts the dataset to the side, half a rank off the row it feeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
    let last: any = null
    const adapter = { load: vi.fn(), save: vi.fn(), export: vi.fn() } as unknown as GraphAdapter
    render(
      <AdapterContext.Provider value={adapter}>
        <CanvasTool initialSchema={schema()} onModelChange={(s) => { last = s }} />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(last).not.toBeNull())
    fireEvent.click(screen.getByTitle(/Auto-layout/))
    await waitFor(() => {
      const nodes = last.models.m.nodes
      const ds = nodes.find((n: any) => n.type === 'dataset')
      const vars = nodes.filter((n: any) => n.type === 'variable')
      const maxVarX = Math.max(...vars.map((n: any) => n.visual.x))
      const avgVarY = vars.reduce((a: number, n: any) => a + n.visual.y, 0) / vars.length
      expect(ds.visual.x).toBeGreaterThan(maxVarX)
      expect(Math.abs(ds.visual.y - avgVarY)).toBeCloseTo(75)
    })
  })
})
