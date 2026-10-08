/**
 * Undo/redo and keyboard shortcuts in the canvas: what counts as one undo step,
 * which shortcuts are available in which mode, and scoping of shortcuts to the
 * editor instance being used.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'

function createAdapterStub(): GraphAdapter {
  return {
    load: vi.fn(async () => { throw new Error('Not used in this test') }),
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
        label: 'Test',
        nodes: [
          { label: 'F', type: 'variable', visual: { x: 0, y: 0 } },
          { label: 'G', type: 'variable', visual: { x: 200, y: 0 } },
        ],
        paths: [
          { label: 'b', from: 'F', to: 'G', numberOfArrows: 1, freeParameter: true },
          { from: 'F', to: 'F', numberOfArrows: 2, freeParameter: true },
          { from: 'G', to: 'G', numberOfArrows: 2, freeParameter: true },
        ],
      },
    },
  } as unknown as GraphSchema
}

type ViewMode = 'widget' | 'shiny' | 'full'

function canvasElement(viewMode: ViewMode, editMode: 'full' | 'layout', onModelChange: ReturnType<typeof vi.fn>) {
  return (
    <AdapterContext.Provider value={createAdapterStub()}>
      <CanvasTool initialSchema={fixture()} onModelChange={onModelChange} viewMode={viewMode} editMode={editMode} />
    </AdapterContext.Provider>
  )
}

/** jsdom has no SVG geometry: identity screen transform (client = svg coords). */
function mockSvgGeometry(container: HTMLElement) {
  const svg = container.querySelector('svg.w-full') as SVGSVGElement
  ;(svg as any).createSVGPoint = () => ({
    x: 0,
    y: 0,
    matrixTransform() { return { x: this.x, y: this.y } },
  })
  ;(svg as any).getScreenCTM = () => ({ a: 1, inverse: () => ({}) })
  return svg
}

async function renderCanvas(viewMode: ViewMode = 'shiny', editMode: 'full' | 'layout' = 'full') {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  const onModelChange = vi.fn()
  const utils = render(canvasElement(viewMode, editMode, onModelChange))
  await waitFor(() => expect(nodeCircle(utils.container, 'F')).toBeTruthy())
  const svg = mockSvgGeometry(utils.container)
  const root = utils.container.querySelector('.canvas-container') as HTMLElement
  return { ...utils, onModelChange, svg, root }
}

/** The latent circle of the node labelled `label`. */
function nodeCircle(container: HTMLElement, label: string): SVGCircleElement | null {
  const groups = Array.from(container.querySelectorAll('svg.w-full g'))
  const g = groups.find((el) => el.querySelector(':scope > text')?.textContent === label && el.querySelector(':scope > circle'))
  return (g?.querySelector(':scope > circle') as SVGCircleElement) ?? null
}

/** The first model of the most recent schema reported to the host. */
function lastModel(onModelChange: ReturnType<typeof vi.fn>): any {
  const last = onModelChange.mock.calls[onModelChange.mock.calls.length - 1][0]
  return Object.values(last.models)[0]
}

function nodePos(onModelChange: ReturnType<typeof vi.fn>, label: string) {
  const n = lastModel(onModelChange).nodes.find((x: any) => x.label === label)
  return n ? { x: n.visual?.x, y: n.visual?.y } : undefined
}

// Separate user events are separate tasks (edits within one task are one step).
const nextTask = () => act(async () => { await Promise.resolve() })

const key = (target: Element, k: string, mods: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(target, { key: k, ...mods })
const undo = (target: Element) => key(target, 'z', { ctrlKey: true })
const redo = (target: Element) => key(target, 'z', { ctrlKey: true, shiftKey: true })

async function dragNode(container: HTMLElement, svg: SVGSVGElement, label: string, to: { x: number; y: number }) {
  fireEvent.mouseDown(nodeCircle(container, label)!, { button: 0, clientX: 0, clientY: 0 })
  for (let i = 1; i <= 5; i++) {
    fireEvent.mouseMove(svg, { clientX: (to.x * i) / 5, clientY: (to.y * i) / 5 })
    await nextTask()
  }
  fireEvent.mouseUp(svg)
  await nextTask()
}

describe('undo/redo', () => {
  it.each(['full', 'layout'] as const)('a whole node drag is one step, undone and redone (%s mode)', async (mode) => {
    const { container, svg, root, onModelChange } = await renderCanvas('shiny', mode)
    await dragNode(container, svg, 'F', { x: 50, y: 30 })
    expect(nodePos(onModelChange, 'F')).toEqual({ x: 50, y: 30 })

    undo(root)
    await waitFor(() => expect(nodePos(onModelChange, 'F')).toEqual({ x: 0, y: 0 }))
    redo(root)
    await waitFor(() => expect(nodePos(onModelChange, 'F')).toEqual({ x: 50, y: 30 }))
    undo(root)
    await waitFor(() => expect(nodePos(onModelChange, 'F')).toEqual({ x: 0, y: 0 }))
    key(root, 'y', { ctrlKey: true })
    await waitFor(() => expect(nodePos(onModelChange, 'F')).toEqual({ x: 50, y: 30 }))
  })

  it('the loaded model is the start of history', async () => {
    const { root, onModelChange } = await renderCanvas()
    const calls = onModelChange.mock.calls.length
    undo(root)
    await nextTask()
    expect(onModelChange.mock.calls.length).toBe(calls)
  })

  it('deleting a node and its paths is one step; undo restores them', async () => {
    const { container, root, onModelChange } = await renderCanvas()
    fireEvent.mouseDown(nodeCircle(container, 'F')!, { button: 0 })
    fireEvent.mouseUp(container.querySelector('svg.w-full')!)
    await nextTask()
    key(root, 'Delete')
    await waitFor(() => expect(lastModel(onModelChange).nodes.map((n: any) => n.label)).toEqual(['G']))
    expect(lastModel(onModelChange).paths).toHaveLength(1)

    undo(root)
    await waitFor(() => expect(lastModel(onModelChange).nodes).toHaveLength(2))
    expect(lastModel(onModelChange).paths).toHaveLength(3)
  })

  it('adding a variable (node + variance path) is one step and undo clears its selection', async () => {
    const { svg, root, onModelChange } = await renderCanvas()
    key(root, 'v')
    await nextTask()
    fireEvent.click(svg, { clientX: 100, clientY: 150 })
    await waitFor(() => expect(lastModel(onModelChange).nodes).toHaveLength(3))
    expect(lastModel(onModelChange).paths).toHaveLength(4)
    expect(screen.queryByTitle('Close popup')).not.toBeNull()

    undo(root)
    await waitFor(() => expect(lastModel(onModelChange).nodes).toHaveLength(2))
    expect(lastModel(onModelChange).paths).toHaveLength(3)
    expect(screen.queryByTitle('Close popup')).toBeNull()
  })

  it('Clear canvas is undoable', async () => {
    const { root, onModelChange } = await renderCanvas('full')
    fireEvent.click(screen.getByTitle('Clear the canvas'))
    await waitFor(() => expect(lastModel(onModelChange).nodes).toHaveLength(0))
    undo(root)
    await waitFor(() => expect(lastModel(onModelChange).nodes).toHaveLength(2))
    expect(lastModel(onModelChange).label).toBe('Test')
  })

  it('typing in an inspector field is one step', async () => {
    const { container, root, onModelChange } = await renderCanvas()
    fireEvent.mouseDown(nodeCircle(container, 'F')!, { button: 0 })
    fireEvent.mouseUp(container.querySelector('svg.w-full')!)
    await nextTask()
    const input = screen.getByDisplayValue('F') as HTMLInputElement
    input.focus()
    for (const v of ['Fa', 'Fac', 'Fact']) {
      fireEvent.change(input, { target: { value: v } })
      await nextTask()
    }
    await waitFor(() => expect(lastModel(onModelChange).nodes.map((n: any) => n.label)).toContain('Fact'))

    // Cmd/Ctrl+Z inside the field is the field's own (browser) undo
    const calls = onModelChange.mock.calls.length
    undo(input)
    await nextTask()
    expect(onModelChange.mock.calls.length).toBe(calls)

    root.focus()
    undo(root)
    await waitFor(() => expect(lastModel(onModelChange).nodes.map((n: any) => n.label)).toEqual(['F', 'G']))
  })
})

describe('keyboard shortcuts', () => {
  it.each(['full', 'layout'] as const)('arrow keys nudge the selected node; a run is one step (%s mode)', async (mode) => {
    const { container, root, onModelChange } = await renderCanvas('shiny', mode)
    fireEvent.mouseDown(nodeCircle(container, 'G')!, { button: 0 })
    fireEvent.mouseUp(container.querySelector('svg.w-full')!)
    await nextTask()
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight']) {
      key(root, k)
      await nextTask()
    }
    key(root, 'ArrowDown', { shiftKey: true })
    await waitFor(() => expect(nodePos(onModelChange, 'G')).toEqual({ x: 203, y: 10 }))

    undo(root)
    await waitFor(() => expect(nodePos(onModelChange, 'G')).toEqual({ x: 200, y: 0 }))
  })

  it('tool keys select add modes and Escape returns to select', async () => {
    const { root } = await renderCanvas()
    for (const [k, mode] of [['v', 'add-variable'], ['c', 'add-constant'], ['p', 'add-one-path'], ['t', 'add-two-path']]) {
      key(root, k)
      await waitFor(() => expect(screen.getByText(`Mode: ${mode}`)).toBeTruthy())
      key(root, 'Escape')
      await waitFor(() => expect(screen.getByText('Mode: select')).toBeTruthy())
    }
  })

  it('tool keys do nothing in layout-only mode, and Delete does not delete', async () => {
    const { container, root, onModelChange } = await renderCanvas('shiny', 'layout')
    key(root, 'v')
    await nextTask()
    expect(screen.getByText('Mode: select')).toBeTruthy()
    fireEvent.mouseDown(nodeCircle(container, 'F')!, { button: 0 })
    fireEvent.mouseUp(container.querySelector('svg.w-full')!)
    await nextTask()
    key(root, 'Delete')
    await nextTask()
    expect(lastModel(onModelChange).nodes).toHaveLength(2)
  })

  it('Escape deselects (closing the element popup)', async () => {
    const { container, root } = await renderCanvas()
    fireEvent.mouseDown(nodeCircle(container, 'F')!, { button: 0 })
    fireEvent.mouseUp(container.querySelector('svg.w-full')!)
    await waitFor(() => expect(screen.queryByTitle('Close popup')).not.toBeNull())
    key(root, 'Escape')
    await waitFor(() => expect(screen.queryByTitle('Close popup')).toBeNull())
  })

  it('shortcuts do not fire while typing in a field', async () => {
    const { container, onModelChange } = await renderCanvas()
    fireEvent.mouseDown(nodeCircle(container, 'F')!, { button: 0 })
    fireEvent.mouseUp(container.querySelector('svg.w-full')!)
    await nextTask()
    const input = screen.getByDisplayValue('F')
    key(input, 'Backspace')
    key(input, 'v')
    key(input, 'ArrowLeft')
    await nextTask()
    expect(lastModel(onModelChange).nodes).toHaveLength(2)
    expect(nodePos(onModelChange, 'F')).toEqual({ x: 0, y: 0 })
    expect(screen.getByText('Mode: select')).toBeTruthy()
  })

  it('in full-page contexts shortcuts work with nothing focused', async () => {
    await renderCanvas('shiny')
    key(document.body, 'p')
    await waitFor(() => expect(screen.getByText('Mode: add-one-path')).toBeTruthy())
  })

  it('in the widget preview, shortcuts apply only to the instance in use', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
    const a = vi.fn()
    const b = vi.fn()
    const { container } = render(
      <>
        <div data-testid="a">{canvasElement('widget', 'full', a)}</div>
        <div data-testid="b">{canvasElement('widget', 'full', b)}</div>
      </>
    )
    const [ca, cb] = [screen.getByTestId('a'), screen.getByTestId('b')]
    await waitFor(() => expect(nodeCircle(ca, 'F') && nodeCircle(cb, 'F')).toBeTruthy())
    mockSvgGeometry(ca)
    mockSvgGeometry(cb)
    expect(container).toBeTruthy()

    // Select F in both instances (each keeps its own selection)
    for (const c of [ca, cb]) {
      fireEvent.mouseDown(nodeCircle(c, 'F')!, { button: 0 })
      fireEvent.mouseUp(c.querySelector('svg.w-full')!)
    }
    await nextTask()

    // Nothing focused: a widget on a document page does not react
    key(document.body, 'ArrowRight')
    await nextTask()
    expect(nodePos(a, 'F')).toEqual({ x: 0, y: 0 })
    expect(nodePos(b, 'F')).toEqual({ x: 0, y: 0 })

    // Only the instance the key event belongs to reacts
    const rootB = cb.querySelector('.canvas-container') as HTMLElement
    rootB.focus()
    key(rootB, 'ArrowRight')
    await waitFor(() => expect(nodePos(b, 'F')).toEqual({ x: 1, y: 0 }))
    expect(nodePos(a, 'F')).toEqual({ x: 0, y: 0 })

    // Undo works in the widget preview too, on that instance only
    undo(rootB)
    await waitFor(() => expect(nodePos(b, 'F')).toEqual({ x: 0, y: 0 }))
  })

  it('the editor root is focusable so clicking it scopes shortcuts to it', async () => {
    const { root } = await renderCanvas('widget')
    expect(root.tabIndex).toBe(-1)
  })
})
