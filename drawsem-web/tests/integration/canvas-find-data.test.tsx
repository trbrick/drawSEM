import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'

// A file-based dataset whose data the editor can't load shows "No Data Loaded"
// with a "Find data file..." button; in Shiny it asks R to load data for that
// dataset. The Shiny toolbar keeps the dataset icon.

const schema = {
  schemaVersion: 0,
  models: { m: {
    nodes: [
      { label: 'x_1', type: 'variable', visual: { x: 0, y: 0 } },
      { label: 'sample', type: 'dataset', visual: { x: 0, y: 200 },
        datasetSource: { type: 'file', location: 'sample.csv', columnTypes: { x_1: 'number' } } },
    ],
    paths: [{ from: 'sample', to: 'x_1', type: 'data', label: 'x_1' }],
  } },
} as unknown as GraphSchema

function renderCanvas(viewMode: 'shiny' | 'full', adapter: Partial<GraphAdapter>) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  const full = { load: vi.fn(), save: vi.fn(), export: vi.fn(), ...adapter } as unknown as GraphAdapter
  return render(
    <AdapterContext.Provider value={full}>
      <CanvasTool initialSchema={schema} viewMode={viewMode} />
    </AdapterContext.Provider>
  )
}

async function selectDataset(container: HTMLElement) {
  await waitFor(() => expect(screen.getByText('sample')).toBeTruthy())
  // jsdom has no SVG coordinate transforms; node mouse-down needs them
  const svg = container.querySelector('marker#arrow-end')!.closest('svg')! as any
  svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y } } })
  svg.getScreenCTM = () => ({ a: 1, inverse: () => ({}) })
  const label = screen.getAllByText('sample').find((el) => el.closest('svg'))!
  const shape = label.closest('g')!.querySelector('[style*="grab"], rect, path, ellipse') as Element
  fireEvent.mouseDown(shape, { button: 0 })
  fireEvent.mouseUp(container.querySelector('svg')!)
  await waitFor(() => expect(screen.getByText('⚠ No Data Loaded')).toBeTruthy())
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); cleanup() })

describe('finding a missing data file', () => {
  it('Shiny toolbar keeps the dataset icon', async () => {
    renderCanvas('shiny', { requestLoadData: vi.fn() })
    const btn = await waitFor(() => screen.getByTitle('Load Data (into the R session)'))
    expect(btn.textContent).toBe('⛁')
  })

  it('in Shiny, "Find data file..." asks R to load data for that dataset', async () => {
    const requestLoadData = vi.fn()
    const { container } = renderCanvas('shiny', { requestLoadData })
    await selectDataset(container)
    expect(screen.getByText(/⛁ Load Data button/)).toBeTruthy()
    fireEvent.click(screen.getByText('Find data file…'))
    expect(requestLoadData).toHaveBeenCalledWith('sample')
  })

  it('outside Shiny, the message names the Add Dataset button and the button opens a file picker', async () => {
    const { container } = renderCanvas('full', {})
    await selectDataset(container)
    expect(screen.getByText(/⛁ Add Dataset button/)).toBeTruthy()
    const input = container.querySelector('input[type="file"][accept*="csv"]') as HTMLInputElement
    const clicked = vi.spyOn(input, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByText('Find data file…'))
    expect(clicked).toHaveBeenCalled()
  })
})
