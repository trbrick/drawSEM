/**
 * Canvas zoom / pan and "Show All": view state only (the canvas viewBox), never
 * the schema; existing interactions keep mapping to the right canvas
 * coordinates at any zoom.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'
import { parseViewBox, clientToViewBox } from '../../src/utils/viewport'
import type { ViewBox } from '../../src/utils/viewport'

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
        ],
      },
    },
  } as unknown as GraphSchema
}

type ViewMode = 'full' | 'shiny' | 'widget'

function renderCanvas(viewMode: ViewMode = 'shiny', editMode: 'full' | 'layout' = 'full') {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  const onModelChange = vi.fn()
  const utils = render(
    <AdapterContext.Provider value={createAdapterStub()}>
      <CanvasTool initialSchema={fixture()} onModelChange={onModelChange} viewMode={viewMode} editMode={editMode} />
    </AdapterContext.Provider>
  )
  return { ...utils, onModelChange }
}

const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }

/**
 * jsdom has no SVG geometry. Give the canvas a fixed 800x600 box and a screen
 * transform derived from its *current* viewBox attribute (xMidYMid meet), so
 * the component's own coordinate mapping is exercised as the view changes.
 */
function installGeometry(svg: SVGSVGElement) {
  const vbNow = () => parseViewBox(svg.getAttribute('viewBox')!)!
  ;(svg as any).getBoundingClientRect = () => RECT
  ;(svg as any).createSVGPoint = () => ({
    x: 0,
    y: 0,
    matrixTransform(m: any) {
      return m.apply({ x: this.x, y: this.y })
    },
  })
  ;(svg as any).getScreenCTM = () => {
    const vb = vbNow()
    const s = Math.min(RECT.width / vb.width, RECT.height / vb.height)
    const offX = (RECT.width - vb.width * s) / 2
    const offY = (RECT.height - vb.height * s) / 2
    return {
      a: s,
      apply: (p: { x: number; y: number }) => ({ x: offX + (p.x - vb.x) * s, y: offY + (p.y - vb.y) * s }),
      inverse: () => ({ a: 1 / s, apply: (p: { x: number; y: number }) => clientToViewBox(vb, RECT, p.x, p.y) }),
    }
  }
}

function toClient(vb: ViewBox, p: { x: number; y: number }) {
  const s = Math.min(RECT.width / vb.width, RECT.height / vb.height)
  return {
    x: (RECT.width - vb.width * s) / 2 + (p.x - vb.x) * s,
    y: (RECT.height - vb.height * s) / 2 + (p.y - vb.y) * s,
  }
}

async function setup(viewMode: ViewMode = 'shiny', editMode: 'full' | 'layout' = 'full') {
  const utils = renderCanvas(viewMode, editMode)
  await waitFor(() => expect(screen.getByText('X2')).toBeTruthy())
  // let load-time effects settle so onModelChange counts are stable
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  const svg = utils.container.querySelector('svg.w-full') as SVGSVGElement
  installGeometry(svg)
  const vb = () => parseViewBox(svg.getAttribute('viewBox')!)!
  return { ...utils, svg, vb, fitted: vb() }
}

function lastNodes(onModelChange: ReturnType<typeof vi.fn>) {
  const last = onModelChange.mock.calls[onModelChange.mock.calls.length - 1][0]
  return (Object.values(last.models)[0] as any).nodes as any[]
}

const nodeCircle = (label: string) => screen.getByText(label).previousElementSibling as SVGCircleElement

describe('canvas zoom', () => {
  it.each(['full', 'shiny', 'widget'] as const)('Ctrl/Cmd+wheel zooms about the cursor and touches nothing else (%s)', async (mode) => {
    const { svg, vb, fitted, onModelChange } = await setup(mode)
    const calls = onModelChange.mock.calls.length
    const cursor = { x: 250, y: 180 }
    const under = clientToViewBox(fitted, RECT, cursor.x, cursor.y)!

    const notCancelled = fireEvent.wheel(svg, { ctrlKey: true, deltaY: -100, clientX: cursor.x, clientY: cursor.y })
    expect(notCancelled).toBe(false) // preventDefault: no browser page zoom
    const z = vb()
    expect(z.width).toBeLessThan(fitted.width)
    const back = toClient(z, under)
    expect(back.x).toBeCloseTo(cursor.x, 6)
    expect(back.y).toBeCloseTo(cursor.y, 6)

    fireEvent.wheel(svg, { metaKey: true, deltaY: 100, clientX: cursor.x, clientY: cursor.y })
    expect(vb().width).toBeCloseTo(fitted.width, 6)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(onModelChange.mock.calls.length).toBe(calls) // view state is never sent to the host
  })

  it('zoom-in is clamped', async () => {
    const { svg, vb } = await setup()
    for (let i = 0; i < 100; i++) fireEvent.wheel(svg, { ctrlKey: true, deltaY: -100, clientX: 400, clientY: 300 })
    expect(Math.max(vb().width, vb().height)).toBeCloseTo(60, 6)
  })

  it('Safari gesture events zoom', async () => {
    const { svg, vb, fitted } = await setup('widget')
    const start = new Event('gesturestart', { cancelable: true })
    Object.assign(start, { scale: 1, clientX: 400, clientY: 300 })
    svg.dispatchEvent(start)
    const change = new Event('gesturechange', { cancelable: true })
    Object.assign(change, { scale: 2, clientX: 400, clientY: 300 })
    act(() => {
      svg.dispatchEvent(change)
    })
    expect(change.defaultPrevented).toBe(true)
    expect(vb().width).toBeCloseTo(fitted.width / 2, 6)
  })
})

describe('canvas pan', () => {
  it.each([
    ['full', 'full'],
    ['shiny', 'full'],
    ['shiny', 'layout'],
  ] as const)('plain wheel pans in the full-page editor (%s, %s)', async (mode, edit) => {
    const { svg, vb, fitted } = await setup(mode, edit)
    const s = Math.min(RECT.width / fitted.width, RECT.height / fitted.height)
    const notCancelled = fireEvent.wheel(svg, { deltaX: 30, deltaY: 60 })
    expect(notCancelled).toBe(false)
    expect(vb().x).toBeCloseTo(fitted.x + 30 / s, 6)
    expect(vb().y).toBeCloseTo(fitted.y + 60 / s, 6)
    expect(vb().width).toBe(fitted.width)
  })

  it('the embedded widget leaves plain wheel to the page', async () => {
    const { svg, vb, fitted } = await setup('widget')
    const notCancelled = fireEvent.wheel(svg, { deltaY: 60 })
    expect(notCancelled).toBe(true)
    expect(vb()).toEqual(fitted)
  })

  it.each(['shiny', 'widget'] as const)('middle-button drag pans (%s)', async (mode) => {
    const { svg, vb, fitted, onModelChange } = await setup(mode)
    const calls = onModelChange.mock.calls.length
    const s = Math.min(RECT.width / fitted.width, RECT.height / fitted.height)
    // starting on a node must not drag the node
    const p = toClient(fitted, { x: 0, y: 0 })
    fireEvent.mouseDown(nodeCircle('F'), { button: 1, clientX: p.x, clientY: p.y })
    fireEvent.mouseMove(window, { clientX: p.x + 40, clientY: p.y - 20 })
    fireEvent.mouseUp(window, { button: 1, clientX: p.x + 40, clientY: p.y - 20 })
    expect(vb().x).toBeCloseTo(fitted.x - 40 / s, 6)
    expect(vb().y).toBeCloseTo(fitted.y + 20 / s, 6)
    // released: further moves do nothing
    fireEvent.mouseMove(window, { clientX: 0, clientY: 0 })
    expect(vb().x).toBeCloseTo(fitted.x - 40 / s, 6)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(onModelChange.mock.calls.length).toBe(calls)
  })

  it.each(['shiny', 'widget'] as const)('Space+drag pans without selecting or moving a node (%s)', async (mode) => {
    const { svg, vb, fitted, onModelChange } = await setup(mode)
    const calls = onModelChange.mock.calls.length
    const s = Math.min(RECT.width / fitted.width, RECT.height / fitted.height)
    fireEvent.mouseEnter(svg)
    const notCancelled = fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(notCancelled).toBe(false)
    const p = toClient(fitted, { x: 0, y: 0 })
    fireEvent.mouseDown(nodeCircle('F'), { button: 0, clientX: p.x, clientY: p.y })
    fireEvent.mouseMove(svg, { clientX: p.x + 50, clientY: p.y })
    fireEvent.mouseMove(window, { clientX: p.x + 50, clientY: p.y })
    fireEvent.mouseUp(window, { button: 0 })
    fireEvent.click(svg)
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    expect(vb().x).toBeCloseTo(fitted.x - 50 / s, 6)
    expect(screen.getByText('F').previousElementSibling!.getAttribute('stroke')).toBe(
      screen.getByText('X1').previousElementSibling!.getAttribute('stroke')
    ) // F not selected
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(onModelChange.mock.calls.length).toBe(calls)

    // with Space released a left-drag on the background does not pan (reserved for marquee)
    const before = vb()
    fireEvent.mouseDown(svg, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 200 })
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 })
    fireEvent.mouseUp(svg, { button: 0 })
    expect(vb()).toEqual(before)
  })

  it('Space does not arm panning when the pointer is not over the canvas', async () => {
    const { svg, vb, fitted } = await setup()
    const notCancelled = fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(notCancelled).toBe(true)
    fireEvent.mouseDown(svg, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 })
    fireEvent.mouseUp(window, { button: 0 })
    expect(vb()).toEqual(fitted)
  })
})

describe('interactions under zoom and pan', () => {
  async function zoomedAndPanned(mode: ViewMode = 'shiny', edit: 'full' | 'layout' = 'full') {
    const ctx = await setup(mode, edit)
    fireEvent.wheel(ctx.svg, { ctrlKey: true, deltaY: -100, clientX: 300, clientY: 200 })
    fireEvent.wheel(ctx.svg, { ctrlKey: true, deltaY: -100, clientX: 300, clientY: 200 })
    fireEvent.mouseDown(ctx.svg, { button: 1, clientX: 0, clientY: 0 })
    fireEvent.mouseMove(window, { clientX: 37, clientY: -23 })
    fireEvent.mouseUp(window, { button: 1 })
    const z = ctx.vb()
    expect(z.width).toBeLessThan(ctx.fitted.width)
    return { ...ctx, z }
  }

  it.each(['full', 'layout'] as const)('node drag moves the node by the cursor distance in canvas units (%s)', async (edit) => {
    const { onModelChange, svg, z } = await zoomedAndPanned('shiny', edit)
    const s = Math.min(RECT.width / z.width, RECT.height / z.height)
    const p = toClient(z, { x: 0, y: 0 })
    fireEvent.mouseDown(nodeCircle('F'), { button: 0, clientX: p.x + 3, clientY: p.y + 2 })
    fireEvent.mouseMove(svg, { clientX: p.x + 3 + 60, clientY: p.y + 2 + 30 })
    fireEvent.mouseUp(svg)
    await waitFor(() => {
      const f = lastNodes(onModelChange).find((n) => n.label === 'F')
      expect(f.visual.x).toBeCloseTo(60 / s, 6)
      expect(f.visual.y).toBeCloseTo(30 / s, 6)
    })
  })

  it('double-click places a new node under the cursor', async () => {
    const { onModelChange, svg, z } = await zoomedAndPanned()
    fireEvent.doubleClick(svg, { clientX: 500, clientY: 400 })
    const expected = clientToViewBox(z, RECT, 500, 400)!
    await waitFor(() => {
      const n = lastNodes(onModelChange).find((x) => x.label === 'V1')
      expect(n.visual.x).toBeCloseTo(expected.x, 6)
      expect(n.visual.y).toBeCloseTo(expected.y, 6)
    })
  })

  it('path rubber band follows the cursor', async () => {
    const { container, svg, z } = await zoomedAndPanned()
    const p = toClient(z, { x: 0, y: 0 })
    fireEvent.mouseDown(nodeCircle('F'), { button: 2, clientX: p.x, clientY: p.y })
    fireEvent.mouseMove(svg, { clientX: 640, clientY: 90 })
    const target = clientToViewBox(z, RECT, 640, 90)!
    const line = Array.from(container.querySelectorAll('line')).find(
      (l) => Math.abs(Number(l.getAttribute('x2')) - target.x) < 1e-6
    )
    expect(line).toBeTruthy()
    expect(Number(line!.getAttribute('y2'))).toBeCloseTo(target.y, 6)
    expect(Number(line!.getAttribute('x1'))).toBeCloseTo(0, 6)
  })

  it('the inline label editor stays on its node when the view changes', async () => {
    const { container, svg, vb } = await zoomedAndPanned()
    fireEvent.doubleClick(screen.getByText('X2'))
    const input = await waitFor(() => {
      const el = container.querySelector('input[style*="absolute"]') as HTMLInputElement
      expect(el).toBeTruthy()
      return el
    })
    const at = (v: ViewBox) => toClient(v, { x: 100, y: 150 })
    expect(parseFloat(input.style.left)).toBeCloseTo(at(vb()).x, 6)
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 100, clientX: 10, clientY: 10 })
    await waitFor(() => expect(parseFloat(input.style.left)).toBeCloseTo(at(vb()).x, 6))
    expect(parseFloat(input.style.top)).toBeCloseTo(at(vb()).y, 6)
  })
})

describe('Show All', () => {
  const TITLE = 'Zoom to show the whole model (Shift+1)'

  it.each([
    ['full', 'full'],
    ['shiny', 'full'],
    ['shiny', 'layout'],
    ['full', 'layout'],
  ] as const)('the button is in the toolbar and restores the load-time fit (%s, %s)', async (mode, edit) => {
    const { svg, vb, fitted, onModelChange } = await setup(mode, edit)
    const btn = screen.getByTitle(TITLE)
    expect(btn.textContent).toContain('Show All')
    expect(btn.textContent).not.toMatch(/fit/i)
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 100, clientX: 10, clientY: 10 })
    expect(vb()).not.toEqual(fitted)
    const calls = onModelChange.mock.calls.length
    fireEvent.click(btn)
    expect(vb()).toEqual(fitted)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(onModelChange.mock.calls.length).toBe(calls)
  })

  it('the embedded widget has no toolbar button', async () => {
    await setup('widget')
    expect(screen.queryByTitle(TITLE)).toBeNull()
  })

  it.each(['full', 'shiny', 'widget'] as const)('Shift+1 shows all when the pointer is over the editor (%s)', async (mode) => {
    const { container, svg, vb, fitted } = await setup(mode)
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 100, clientX: 10, clientY: 10 })
    const zoomed = vb()
    // pointer elsewhere on the page: another instance's key, ignored
    fireEvent.keyDown(window, { code: 'Digit1', key: '!', shiftKey: true })
    expect(vb()).toEqual(zoomed)
    fireEvent.mouseEnter(container.querySelector('.canvas-container')!)
    fireEvent.keyDown(window, { code: 'Digit1', key: '!', shiftKey: true })
    expect(vb()).toEqual(fitted)
  })

  it('Shift+1 is ignored while typing', async () => {
    const { container, svg, vb } = await setup('full')
    fireEvent.mouseEnter(container.querySelector('.canvas-container')!)
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 100, clientX: 10, clientY: 10 })
    const zoomed = vb()
    const nameInput = screen.getByTitle('Model name — click to edit')
    fireEvent.keyDown(nameInput, { code: 'Digit1', key: '!', shiftKey: true })
    expect(vb()).toEqual(zoomed)
  })
})
