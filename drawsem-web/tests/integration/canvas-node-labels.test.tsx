import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'

// Node labels are the schema's node references, so the editor must never
// produce two nodes with the same label.

// The example model has no V-numbered nodes, so only the ones a test adds count.
function loadExampleSchema(): GraphSchema {
  return JSON.parse(readFileSync(join(__dirname, '../../examples/graph.example.json'), 'utf-8'))
}

function createAdapterStub(): GraphAdapter {
  return {
    load: vi.fn(async () => { throw new Error('Not used in this test') }),
    save: vi.fn(async () => {}),
    export: vi.fn(async () => 'mock'),
  }
}

function renderCanvas() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  return render(
    <AdapterContext.Provider value={createAdapterStub()}>
      <CanvasTool initialSchema={loadExampleSchema()} />
    </AdapterContext.Provider>
  )
}

function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg.w-full') as SVGSVGElement
  // jsdom has no SVG geometry: identity screen transform (client = svg coords)
  ;(svg as any).createSVGPoint = () => ({
    x: 0,
    y: 0,
    matrixTransform() {
      return { x: this.x, y: this.y }
    },
  })
  ;(svg as any).getScreenCTM = () => ({ a: 1, inverse: () => ({}) })
  return svg
}

// Node labels as drawn on the canvas
function nodeLabels(container: HTMLElement): string[] {
  return Array.from(canvasSvg(container).querySelectorAll('g text'))
    .map((t) => t.textContent ?? '')
    .filter((t) => /^V\d+$/.test(t))
    .sort()
}

function selectNode(container: HTMLElement, label: string) {
  const text = Array.from(canvasSvg(container).querySelectorAll('g text')).find((t) => t.textContent === label)!
  const shape = text.closest('g')!.querySelector('circle, rect') as Element
  fireEvent.mouseDown(shape, { button: 0, clientX: 0, clientY: 0 })
  fireEvent.mouseUp(canvasSvg(container))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('node labels stay unique', () => {
  it('a variable added after a deletion does not reuse a remaining label', async () => {
    const { container } = renderCanvas()
    await waitFor(() => expect(canvasSvg(container).querySelector('g text')).toBeTruthy())
    const svg = canvasSvg(container)
    fireEvent.doubleClick(svg)
    fireEvent.doubleClick(svg)
    expect(nodeLabels(container)).toEqual(['V1', 'V2'])

    selectNode(container, 'V1')
    fireEvent.keyDown(document.body, { key: 'Delete' }) // unfocused page: the editor takes the key
    expect(nodeLabels(container)).toEqual(['V2'])

    fireEvent.doubleClick(svg)
    expect(nodeLabels(container)).toEqual(['V1', 'V2'])
  })

  it('the inspector refuses to rename a node to another node\'s label', async () => {
    const { container } = renderCanvas()
    await waitFor(() => expect(canvasSvg(container).querySelector('g text')).toBeTruthy())
    const svg = canvasSvg(container)
    fireEvent.doubleClick(svg)
    fireEvent.doubleClick(svg) // V2, selected

    const input = screen.getByDisplayValue('V2')
    fireEvent.change(input, { target: { value: 'V1' } })
    expect(screen.getByText(/A node named "V1" already exists/)).toBeTruthy()
    expect(nodeLabels(container)).toEqual(['V1', 'V2'])

    fireEvent.change(input, { target: { value: 'V3' } })
    expect(nodeLabels(container)).toEqual(['V1', 'V3'])
  })
})
