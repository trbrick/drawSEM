/**
 * Self-loop sides in the canvas: automatic side (resolved from positions,
 * never stored), the inspector "Loop side" control, and drag-to-pin.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'
import { effectiveSchemaLoopSide } from '../../src/utils/loopSide'

function createAdapterStub(): GraphAdapter {
  return {
    load: vi.fn(async () => {
      throw new Error('Not used in this test')
    }),
    save: vi.fn(async () => {}),
    export: vi.fn(async () => 'mock'),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanup()
})

function fixture(): GraphSchema {
  return {
    schemaVersion: 0,
    models: {
      m: {
        nodes: [
          { label: 'F', type: 'variable', visual: { x: 0, y: 0 } },
          { label: 'X1', type: 'variable', visual: { x: -100, y: 150 } },
          { label: 'X2', type: 'variable', visual: { x: 100, y: 150 } },
        ],
        paths: [
          { label: 'l1', from: 'F', to: 'X1', numberOfArrows: 1 },
          { label: 'l2', from: 'F', to: 'X2', numberOfArrows: 1 },
          { label: 'vF', from: 'F', to: 'F', numberOfArrows: 2 },
          { label: 'vX1', from: 'X1', to: 'X1', numberOfArrows: 2, visual: { loopSide: 'right' } },
        ],
      },
    },
  } as unknown as GraphSchema
}

function renderCanvas(editMode: 'full' | 'layout' = 'full') {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  const onModelChange = vi.fn()
  const utils = render(
    <AdapterContext.Provider value={createAdapterStub()}>
      <CanvasTool initialSchema={fixture()} onModelChange={onModelChange} viewMode="shiny" editMode={editMode} />
    </AdapterContext.Provider>
  )
  return { ...utils, onModelChange }
}

const loopEl = (container: HTMLElement, label: string) =>
  container.querySelector(`path[data-path-id="p_${label}"]`) as SVGPathElement

/** The loopSide of path `label` in the most recent schema reported to the host. */
function lastLoopSide(onModelChange: ReturnType<typeof vi.fn>, label: string) {
  const last = onModelChange.mock.calls[onModelChange.mock.calls.length - 1][0]
  const model: any = Object.values(last.models)[0]
  const p = model.paths.find((x: any) => x.label === label)
  return p.visual?.loopSide
}

describe('CanvasTool self-loop sides', () => {
  it('draws unpinned loops on the automatic side and pinned loops on their stored side', async () => {
    const { container } = renderCanvas()
    await waitFor(() => expect(loopEl(container, 'vF')).toBeTruthy())
    const model = fixture().models.m
    const vF = model.paths.find((p) => p.label === 'vF')!
    expect(effectiveSchemaLoopSide(vF as any, model.nodes as any, model.paths as any)).toBe('top')
    expect(loopEl(container, 'vF').getAttribute('data-loop-side')).toBe('top')
    expect(loopEl(container, 'vX1').getAttribute('data-loop-side')).toBe('right')
    // non-loop paths carry no side
    expect(loopEl(container, 'l1').getAttribute('data-loop-side')).toBeNull()
  })

  it.each(['full', 'layout'] as const)('Loop side control pins and unpins (%s mode)', async (mode) => {
    const { container, onModelChange } = renderCanvas(mode)
    await waitFor(() => expect(loopEl(container, 'vF')).toBeTruthy())
    expect(screen.queryByRole('group', { name: 'Loop side' })).toBeNull()

    fireEvent.click(loopEl(container, 'vF'))
    const group = await screen.findByRole('group', { name: 'Loop side' })
    const auto = screen.getByRole('button', { name: 'Auto (top)' })
    expect(auto.getAttribute('aria-pressed')).toBe('true')
    expect(group.querySelectorAll('button')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Left' }))
    await waitFor(() => expect(lastLoopSide(onModelChange, 'vF')).toBe('left'))
    expect(loopEl(container, 'vF').getAttribute('data-loop-side')).toBe('left')
    expect(screen.getByRole('button', { name: 'Left' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Auto (top)' }))
    await waitFor(() => expect(lastLoopSide(onModelChange, 'vF')).toBeUndefined())
    const last = onModelChange.mock.calls[onModelChange.mock.calls.length - 1][0]
    const vF = (Object.values(last.models)[0] as any).paths.find((x: any) => x.label === 'vF')
    expect('visual' in vF).toBe(false)
    expect(loopEl(container, 'vF').getAttribute('data-loop-side')).toBe('top')
  })

  it('the Loop side control is not shown for other paths', async () => {
    const { container } = renderCanvas()
    await waitFor(() => expect(loopEl(container, 'l1')).toBeTruthy())
    fireEvent.click(loopEl(container, 'l1'))
    await waitFor(() => expect(screen.getByText('From:')).toBeTruthy())
    expect(screen.queryByRole('group', { name: 'Loop side' })).toBeNull()
  })

  it.each(['full', 'layout'] as const)('dragging a loop pins the nearest side (%s mode)', async (mode) => {
    const { container, onModelChange } = renderCanvas(mode)
    await waitFor(() => expect(loopEl(container, 'vF')).toBeTruthy())
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
    const nodeCountBefore = screen.getByText(/^Nodes: /).textContent
    const callsBefore = onModelChange.mock.calls.length

    const loop = loopEl(container, 'vF')
    fireEvent.mouseDown(loop, { button: 0, clientX: 0, clientY: 0 })
    // below the threshold nothing happens
    fireEvent.mouseMove(svg, { clientX: 2, clientY: 1 })
    expect(loopEl(container, 'vF').getAttribute('data-loop-side')).toBe('top')
    // past the threshold the loop follows the nearest side (preview only)
    fireEvent.mouseMove(svg, { clientX: -10000, clientY: 0 })
    expect(loopEl(container, 'vF').getAttribute('data-loop-side')).toBe('left')
    fireEvent.mouseUp(svg)
    fireEvent.click(svg) // the click the browser sends after the drag is swallowed

    await waitFor(() => expect(lastLoopSide(onModelChange, 'vF')).toBe('left'))
    expect(onModelChange.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(loopEl(container, 'vF').getAttribute('data-loop-side')).toBe('left')
    // the path is selected (not deselected by the trailing click), no node moved or was added
    expect(screen.getByRole('button', { name: 'Left' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/^Nodes: /).textContent).toBe(nodeCountBefore)
    const last = onModelChange.mock.calls[onModelChange.mock.calls.length - 1][0]
    const nodes = (Object.values(last.models)[0] as any).nodes
    expect(nodes.find((n: any) => n.label === 'F').visual).toEqual({ x: 0, y: 0 })
  })

  it('a plain click on a loop only selects it', async () => {
    const { container, onModelChange } = renderCanvas()
    await waitFor(() => expect(loopEl(container, 'vF')).toBeTruthy())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    const callsBefore = onModelChange.mock.calls.length
    const loop = loopEl(container, 'vF')
    fireEvent.mouseDown(loop, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.mouseUp(loop)
    fireEvent.click(loop)
    fireEvent.doubleClick(loop)
    await screen.findByRole('group', { name: 'Loop side' })
    expect(onModelChange.mock.calls.length).toBe(callsBefore)
    expect(loopEl(container, 'vF').getAttribute('data-loop-side')).toBe('top')
    expect(loopEl(container, 'vF').getAttribute('marker-start')).not.toBeNull()
  })
})
