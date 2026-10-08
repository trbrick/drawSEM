import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'

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

function renderCanvas(editMode: 'full' | 'layout') {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  return render(
    <AdapterContext.Provider value={createAdapterStub()}>
      <CanvasTool initialSchema={loadExampleSchema()} editMode={editMode} />
    </AdapterContext.Provider>
  )
}

const STRUCTURAL_TITLES = [
  'Add Variable: square or circle (V)',
  'Add Constant: triangle (C)',
  'Add Dataset (cylinder)',
  'Add One-headed Path (P)',
  'Add Two-headed Path (T)',
  'Load a model from a JSON file',
  'Clear the canvas',
]

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanup()
})

describe('CanvasTool editMode', () => {
  it("renders the structural tools in 'full' mode", async () => {
    renderCanvas('full')
    for (const t of STRUCTURAL_TITLES) expect(screen.queryByTitle(t)).not.toBeNull()
    expect(screen.queryByTitle('Model name — click to edit')).not.toBeNull()
  })

  it("hides structural tools, save and export in 'layout' mode but keeps auto-layout", async () => {
    renderCanvas('layout')
    for (const t of STRUCTURAL_TITLES) expect(screen.queryByTitle(t)).toBeNull()
    expect(screen.queryByTitle('Model name — click to edit')).toBeNull()
    expect(screen.queryByTitle(/Auto-layout/)).not.toBeNull()
    expect(screen.queryByTitle('Export graph image')).toBeNull()
    expect(screen.queryByTitle('Save model to a JSON file')).toBeNull()
    expect(screen.queryByText('Path Labels:')).not.toBeNull()
  })

  it("does not add a node on canvas double-click in 'layout' mode", async () => {
    const { container } = renderCanvas('layout')
    await waitFor(() => expect(screen.getByText(/^Nodes: [1-9]/)).toBeTruthy())
    const before = screen.getByText(/^Nodes: /).textContent
    const svg = container.querySelector('svg.w-full') as SVGSVGElement
    fireEvent.doubleClick(svg)
    expect(screen.getByText(/^Nodes: /).textContent).toBe(before)
  })
})
