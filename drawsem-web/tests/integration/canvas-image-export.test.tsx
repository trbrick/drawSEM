/**
 * Image export draws what the canvas shows: the current layer and the Path
 * Labels mode.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'

afterEach(() => cleanup())

const schema: GraphSchema = {
  schemaVersion: 0,
  models: { m: { nodes: [
    { label: 'F', type: 'variable', visual: { x: 0, y: 0 } },
    { label: 'x', type: 'variable', visual: { x: 0, y: 150 } },
    { label: 'd', type: 'dataset', visual: { x: 200, y: 150 } },
  ], paths: [
    { from: 'F', to: 'x', numberOfArrows: 1, freeParameter: 'lam', label: 'lam', value: 0.5 },
    { from: 'd', to: 'x', type: 'data', label: 'x' },
  ] } },
}

const nodeLabels = (svg: string) =>
  [...svg.matchAll(/<text[^>]*font-size="14"[^>]*>([^<]*)</g)].map((m) => m[1]).sort()

describe('Image export in Shiny', () => {
  it('follows the current layer and path label mode', async () => {
    const exportImage = vi.fn()
    const adapter = {
      load: vi.fn(async () => { throw new Error('unused') }),
      save: vi.fn(async () => {}),
      export: vi.fn(async () => 'mock'),
      exportImage,
    } as unknown as GraphAdapter
    render(
      <AdapterContext.Provider value={adapter}>
        <CanvasTool initialSchema={schema} viewMode="shiny" />
      </AdapterContext.Provider>
    )
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const image = () => {
      fireEvent.click(screen.getByTitle('Export image (R converts to SVG/PNG/PDF)'))
      return exportImage.mock.calls.at(-1)![0] as string
    }

    // SEM layer, off-layer hidden: no dataset; default labels show the name
    let svg = image()
    expect(nodeLabels(svg)).toEqual(['F', 'x'])
    expect(svg).toMatch(/font-size="12"[^>]*>lam</)

    fireEvent.click(screen.getByText('Complete Graph'))
    expect(nodeLabels(image())).toEqual(['F', 'd', 'x'])

    fireEvent.change(screen.getByDisplayValue('Default'), { target: { value: 'values' } })
    svg = image()
    expect(svg).toMatch(/font-size="12"[^>]*>=0.50</)
  })
})
