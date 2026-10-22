/**
 * Canvas zoom / pan and "Show All": view state only (the canvas viewBox), never
 * a model edit or a per-edit sync; existing interactions keep mapping to the
 * right canvas coordinates at any zoom. Also: the saved view
 * (models[k].visualization viewport / activeLayer / offLayerVisibility) is
 * applied on load and written only at standalone Save and the addin's Done.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'
import { parseViewBox, clientToViewBox } from '../../src/utils/viewport'
import type { ViewBox } from '../../src/utils/viewport'

function createAdapterStub(extra: Partial<GraphAdapter> = {}): GraphAdapter {
  return {
    load: vi.fn(async () => {
      throw new Error('Not used in this test')
    }),
    save: vi.fn(async () => {}),
    export: vi.fn(async () => 'mock'),
    ...extra,
  }
}

afterEach(() => {
  vi.useRealTimers()
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

interface RenderOptions {
  schema?: GraphSchema
  adapter?: Partial<GraphAdapter>
}

function renderCanvas(viewMode: ViewMode = 'shiny', editMode: 'full' | 'layout' = 'full', opts: RenderOptions = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  const onModelChange = vi.fn()
  const adapter = createAdapterStub(opts.adapter)
  const utils = render(
    <AdapterContext.Provider value={adapter}>
      <CanvasTool initialSchema={opts.schema ?? fixture()} onModelChange={onModelChange} viewMode={viewMode} editMode={editMode} />
    </AdapterContext.Provider>
  )
  return { ...utils, onModelChange, adapter }
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

async function setup(viewMode: ViewMode = 'shiny', editMode: 'full' | 'layout' = 'full', opts: RenderOptions = {}) {
  const utils = renderCanvas(viewMode, editMode, opts)
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

/**
 * Dispatch a wheel event with the legacy wheelDeltaX/Y that Chromium and Safari
 * set (jsdom's WheelEvent has no such init field). Returns false when cancelled.
 */
function wheel(target: Element, init: WheelEventInit, legacy: { wheelDeltaX?: number; wheelDeltaY?: number } = {}) {
  const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  for (const [k, v] of Object.entries(legacy)) Object.defineProperty(ev, k, { value: v })
  let notCancelled = true
  act(() => {
    notCancelled = target.dispatchEvent(ev)
  })
  return notCancelled
}

// device-typical wheel events (see isTrackpadWheel)
const MOUSE_NOTCH_OUT: [WheelEventInit, { wheelDeltaY: number }] = [{ deltaY: 100 }, { wheelDeltaY: -120 }]
const TRACKPAD_SCROLL: [WheelEventInit, { wheelDeltaY: number }] = [{ deltaY: 6 }, { wheelDeltaY: -18 }]

const FULL_PAGE = [
  ['full', 'full'],
  ['shiny', 'full'],
  ['shiny', 'layout'],
] as const

describe('wheel by context', () => {
  it.each(FULL_PAGE)('a mouse wheel zooms about the cursor in the full-page editor (%s, %s)', async (mode, edit) => {
    const { svg, vb, fitted, onModelChange } = await setup(mode, edit)
    const calls = onModelChange.mock.calls.length
    const cursor = { x: 600, y: 120 }
    const under = clientToViewBox(fitted, RECT, cursor.x, cursor.y)!
    const notCancelled = wheel(svg, { ...MOUSE_NOTCH_OUT[0], clientX: cursor.x, clientY: cursor.y }, MOUSE_NOTCH_OUT[1])
    expect(notCancelled).toBe(false)
    const z = vb()
    expect(z.width).toBeGreaterThan(fitted.width) // wheel down zooms out
    const back = toClient(z, under)
    expect(back.x).toBeCloseTo(cursor.x, 6)
    expect(back.y).toBeCloseTo(cursor.y, 6)
    // Firefox line-mode mouse wheel, up: zooms in
    wheel(svg, { deltaY: -3, deltaMode: 1, clientX: 400, clientY: 300 })
    expect(vb().width).toBeLessThan(z.width)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(onModelChange.mock.calls.length).toBe(calls) // not a model edit, not synced
  })

  it.each(FULL_PAGE)('trackpad two-finger scroll pans in the full-page editor (%s, %s)', async (mode, edit) => {
    const { svg, vb, fitted } = await setup(mode, edit)
    const s = Math.min(RECT.width / fitted.width, RECT.height / fitted.height)
    // two-axis movement
    expect(fireEvent.wheel(svg, { deltaX: 30, deltaY: 60 })).toBe(false)
    expect(vb().x).toBeCloseTo(fitted.x + 30 / s, 6)
    expect(vb().y).toBeCloseTo(fitted.y + 60 / s, 6)
    expect(vb().width).toBe(fitted.width)
    // one axis, macOS trackpad signature (wheelDeltaY = -3 * deltaY)
    expect(wheel(svg, TRACKPAD_SCROLL[0], TRACKPAD_SCROLL[1])).toBe(false)
    expect(vb().y).toBeCloseTo(fitted.y + 66 / s, 6)
    expect(vb().width).toBe(fitted.width)
  })

  it('Shift+mouse wheel pans sideways', async () => {
    const { svg, vb, fitted } = await setup('full')
    const s = Math.min(RECT.width / fitted.width, RECT.height / fitted.height)
    wheel(svg, { deltaY: 100, shiftKey: true }, { wheelDeltaY: -120 })
    expect(vb().x).toBeCloseTo(fitted.x + 100 / s, 6)
    expect(vb().y).toBe(fitted.y)
  })

  it.each([
    ['mouse wheel', MOUSE_NOTCH_OUT],
    ['trackpad scroll', TRACKPAD_SCROLL],
  ] as const)('the embedded widget leaves the %s to the page and shows the Ctrl + scroll hint', async (_name, [init, legacy]) => {
    const { svg, vb, fitted, container } = await setup('widget')
    vi.useFakeTimers()
    expect(screen.queryByTestId('scroll-zoom-hint')).toBeNull()
    expect(wheel(svg, init, legacy)).toBe(true) // not cancelled: the page scrolls
    expect(vb()).toEqual(fitted)
    const hint = screen.getByTestId('scroll-zoom-hint')
    expect(hint.textContent).toMatch(/^(Ctrl|⌘) \+ scroll to zoom$/)
    expect(hint.style.pointerEvents).toBe('none')
    expect(hint.style.opacity).toBe('1')
    expect(container.querySelector('.canvas-container')!.contains(hint)).toBe(true)
    // fades, then goes away (about 1.5 s); scrolling again restarts it
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    wheel(svg, init, legacy)
    act(() => {
      vi.advanceTimersByTime(1250)
    })
    expect(screen.getByTestId('scroll-zoom-hint').style.opacity).toBe('0')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByTestId('scroll-zoom-hint')).toBeNull()
  })

  it('the hint says ⌘ on macOS and Ctrl elsewhere', async () => {
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const { svg, unmount } = await setup('widget')
    wheel(svg, MOUSE_NOTCH_OUT[0], MOUSE_NOTCH_OUT[1])
    expect(screen.getByTestId('scroll-zoom-hint').textContent).toBe('⌘ + scroll to zoom')
    unmount()
    platform.mockReturnValue('Win32')
    const second = await setup('widget')
    wheel(second.svg, MOUSE_NOTCH_OUT[0], MOUSE_NOTCH_OUT[1])
    expect(screen.getByTestId('scroll-zoom-hint').textContent).toBe('Ctrl + scroll to zoom')
  })

  it('pinch / Ctrl+wheel in the widget zooms, without the hint', async () => {
    const { svg, vb, fitted } = await setup('widget')
    expect(wheel(svg, { deltaY: -4, ctrlKey: true, clientX: 400, clientY: 300 })).toBe(false)
    expect(vb().width).toBeLessThan(fitted.width)
    expect(screen.queryByTestId('scroll-zoom-hint')).toBeNull()
  })

  it.each(FULL_PAGE)('no hint in the full-page editor (%s, %s)', async (mode, edit) => {
    const { svg } = await setup(mode, edit)
    wheel(svg, MOUSE_NOTCH_OUT[0], MOUSE_NOTCH_OUT[1])
    wheel(svg, TRACKPAD_SCROLL[0], TRACKPAD_SCROLL[1])
    expect(screen.queryByTestId('scroll-zoom-hint')).toBeNull()
  })
})

describe('canvas pan', () => {
  it.each(['full', 'shiny', 'widget'] as const)('right-drag on the background pans (%s)', async (mode) => {
    const { svg, vb, fitted, onModelChange, container } = await setup(mode)
    const calls = onModelChange.mock.calls.length
    const s = Math.min(RECT.width / fitted.width, RECT.height / fitted.height)
    const linesBefore = container.querySelectorAll('line').length
    expect(fireEvent.mouseDown(svg, { button: 2, clientX: 700, clientY: 50 })).toBe(false)
    fireEvent.mouseMove(window, { clientX: 640, clientY: 90 })
    fireEvent.mouseUp(window, { button: 2, clientX: 640, clientY: 90 })
    expect(vb().x).toBeCloseTo(fitted.x + 60 / s, 6)
    expect(vb().y).toBeCloseTo(fitted.y - 40 / s, 6)
    expect(vb().width).toBe(fitted.width)
    // no context menu, on the canvas or (released elsewhere) on the page
    expect(fireEvent.contextMenu(svg)).toBe(false)
    expect(fireEvent.contextMenu(document.body)).toBe(false)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(fireEvent.contextMenu(document.body)).toBe(true) // only right after the pan
    // released: no further panning, no rubber band
    fireEvent.mouseMove(window, { clientX: 0, clientY: 0 })
    expect(vb().x).toBeCloseTo(fitted.x + 60 / s, 6)
    expect(container.querySelectorAll('line').length).toBe(linesBefore)
    expect(onModelChange.mock.calls.length).toBe(calls)
  })

  it('right-drag from a node still draws a path, and does not pan', async () => {
    const { svg, vb, fitted, onModelChange } = await setup('shiny')
    const pX1 = toClient(fitted, { x: -100, y: 150 })
    const pX2 = toClient(fitted, { x: 100, y: 150 })
    fireEvent.mouseDown(nodeCircle('X1'), { button: 2, clientX: pX1.x, clientY: pX1.y })
    fireEvent.mouseMove(svg, { clientX: pX2.x, clientY: pX2.y })
    fireEvent.mouseMove(window, { clientX: pX2.x, clientY: pX2.y })
    expect(vb()).toEqual(fitted)
    fireEvent.mouseEnter(nodeCircle('X2'))
    fireEvent.mouseUp(svg, { button: 2, clientX: pX2.x, clientY: pX2.y })
    fireEvent.mouseUp(window, { button: 2, clientX: pX2.x, clientY: pX2.y })
    expect(vb()).toEqual(fitted)
    await waitFor(() => {
      const ps = (Object.values(onModelChange.mock.calls.at(-1)![0].models)[0] as any).paths as any[]
      expect(ps.some((p) => p.from === 'X1' && p.to === 'X2' && p.numberOfArrows === 1)).toBe(true)
    })
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

describe('saved view (visualization viewport / activeLayer / offLayerVisibility)', () => {
  const STORED = {
    viewport: { x: -250, y: -120, width: 400, height: 200 },
    activeLayer: 'data' as const,
    offLayerVisibility: 'transparent' as const,
  }
  function withView(view: Record<string, unknown> = STORED): GraphSchema {
    const s = fixture() as any
    s.models.m.visualization = { anchor: { x: 1, y: 2 }, ...view }
    return s
  }
  const offLayerSelect = () => screen.getByText('Off-Layer:').querySelector('select') as HTMLSelectElement
  const layerButton = (name: string) => screen.getByRole('button', { name })
  const isActive = (el: HTMLElement) => el.className.includes('bg-sky-100')
  const DONE = 'Close editor and return model to R'

  it.each(['full', 'shiny', 'widget'] as const)('the stored viewport is applied on load (%s)', async (mode) => {
    const { vb } = await setup(mode, 'full', { schema: withView() })
    expect(vb()).toEqual(STORED.viewport)
  })

  it.each(['full', 'shiny'] as const)('the stored layer state is applied on load (%s)', async (mode) => {
    await setup(mode, 'full', { schema: withView() })
    expect(isActive(layerButton('Data'))).toBe(true)
    expect(offLayerSelect().value).toBe('transparent')
  })

  it('without a stored view the model is fitted and the layer defaults stay', async () => {
    const { fitted, svg, vb } = await setup('full')
    expect(isActive(layerButton('SEM'))).toBe(true)
    expect(offLayerSelect().value).toBe('invisible')
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 100, clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByTitle('Zoom to show the whole model (Shift+1)'))
    expect(vb()).toEqual(fitted) // Show All = the load-time fit
  })

  it('a stored layer without a viewport applies, and the view is fitted', async () => {
    const plain = await setup('full')
    const fit = plain.vb()
    cleanup()
    const { vb } = await setup('full', 'full', { schema: withView({ activeLayer: 'all' }) })
    expect(vb()).toEqual(fit)
    expect(isActive(layerButton('Complete Graph'))).toBe(true)
    expect(offLayerSelect().value).toBe('invisible')
  })

  it('a stored viewport whose aspect differs from the canvas is letterboxed, not cropped', async () => {
    // a 4:1 region in an 800x600 canvas: the whole region stays visible, centred
    const { vb } = await setup('full', 'full', { schema: withView({ viewport: { x: 0, y: 0, width: 400, height: 100 } }) })
    const v = vb()
    const topLeft = toClient(v, { x: 0, y: 0 })
    const bottomRight = toClient(v, { x: 400, y: 100 })
    expect(topLeft.x).toBeCloseTo(0, 6)
    expect(bottomRight.x).toBeCloseTo(800, 6)
    expect(topLeft.y).toBeCloseTo(200, 6)
    expect(bottomRight.y).toBeCloseTo(400, 6)
  })

  it('a model pushed from R applies its stored view', async () => {
    let push: ((s: GraphSchema) => void) | null = null
    const { vb } = await setup('shiny', 'full', { adapter: { onModelReceived: (cb) => { push = cb } } })
    await act(async () => {
      push!(withView())
    })
    expect(vb()).toEqual(STORED.viewport)
    expect(isActive(layerButton('Data'))).toBe(true)
  })

  it('the standalone file load applies the stored view', async () => {
    const loaded = withView()
    const { vb, container } = await setup('full', 'full', { adapter: { load: vi.fn(async () => loaded) } })
    const input = container.querySelector('input[type="file"][accept*="json"]') as HTMLInputElement
    const file = new File([JSON.stringify(loaded)], 'm.json', { type: 'application/json' })
    ;(file as any).text = async () => JSON.stringify(loaded)
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await waitFor(() => expect(vb()).toEqual(STORED.viewport))
    expect(offLayerSelect().value).toBe('transparent')
  })

  it('view changes are not synced; a later edit echoes the view as loaded', async () => {
    const { svg, onModelChange } = await setup('shiny', 'full', { schema: withView() })
    const calls = onModelChange.mock.calls.length
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 100, clientX: 10, clientY: 10 })
    fireEvent.click(layerButton('Complete Graph'))
    fireEvent.change(offLayerSelect(), { target: { value: 'invisible' } })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(onModelChange.mock.calls.length).toBe(calls)
    fireEvent.doubleClick(svg, { clientX: 500, clientY: 400 })
    await waitFor(() => expect(onModelChange.mock.calls.length).toBeGreaterThan(calls))
    const last = onModelChange.mock.calls.at(-1)![0]
    expect(last.models.m.visualization).toEqual({ anchor: { x: 1, y: 2 }, ...STORED })
  })

  it('view changes are not undo steps (and undo leaves the view alone)', async () => {
    const { svg, vb, onModelChange, container } = await setup('shiny', 'full', { schema: withView() })
    const root = container.querySelector('.canvas-container') as HTMLElement
    const nodeLabels = () => (Object.values(onModelChange.mock.calls.at(-1)![0].models)[0] as any).nodes.map((n: any) => n.label)
    fireEvent.doubleClick(svg, { clientX: 500, clientY: 400 }) // one model edit: adds V1
    await waitFor(() => expect(nodeLabels()).toContain('V1'))
    await act(async () => { await Promise.resolve() })
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 100, clientX: 10, clientY: 10 })
    fireEvent.click(layerButton('SEM'))
    fireEvent.change(offLayerSelect(), { target: { value: 'invisible' } })
    const view = vb()
    await act(async () => { await Promise.resolve() })
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true }) // undoes the node, not the view
    await waitFor(() => expect(nodeLabels()).not.toContain('V1'))
    expect(vb()).toEqual(view)
    expect(isActive(layerButton('SEM'))).toBe(true)
    expect(offLayerSelect().value).toBe('invisible')
  })

  it('standalone Save writes the live view into the current model', async () => {
    const save = vi.fn(async (_s: GraphSchema) => {})
    const { svg, vb } = await setup('full', 'full', { schema: withView(), adapter: { save } })
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 37, clientX: 123, clientY: 77 })
    fireEvent.click(layerButton('Complete Graph'))
    fireEvent.change(offLayerSelect(), { target: { value: 'invisible' } })
    const live = vb()
    await act(async () => {
      fireEvent.click(screen.getByTitle('Save model to a JSON file'))
    })
    expect(save).toHaveBeenCalledTimes(1)
    const v = (save.mock.calls[0][0] as any).models.m.visualization
    expect(v.anchor).toEqual({ x: 1, y: 2 }) // pass-through kept
    expect(v.activeLayer).toBe('all')
    expect(v.offLayerVisibility).toBe('invisible')
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(v.viewport[k]).toBeCloseTo(live[k], 2)
  })

  it('Save of a model without a stored view adds one', async () => {
    const save = vi.fn(async (_s: GraphSchema) => {})
    const { fitted } = await setup('full', 'full', { adapter: { save } })
    await act(async () => {
      fireEvent.click(screen.getByTitle('Save model to a JSON file'))
    })
    const v = (save.mock.calls[0][0] as any).models.m.visualization
    expect(v.activeLayer).toBe('sem')
    expect(v.offLayerVisibility).toBe('invisible')
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(v.viewport[k]).toBeCloseTo(fitted[k], 2)
  })

  it('addin Done (layout-only) sends the changed view', async () => {
    const done = vi.fn()
    const { svg, vb } = await setup('shiny', 'layout', { schema: withView(), adapter: { done } })
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 50, clientX: 300, clientY: 200 })
    fireEvent.click(layerButton('SEM'))
    const live = vb()
    fireEvent.click(screen.getByTitle(DONE))
    expect(done).toHaveBeenCalledTimes(1)
    const arg = done.mock.calls[0][0]
    expect(Object.keys(arg.visualization)).toEqual(['m'])
    const v = arg.visualization.m
    expect(v.activeLayer).toBe('sem')
    expect(v.offLayerVisibility).toBe('transparent')
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(v.viewport[k]).toBeCloseTo(live[k], 2)
  })

  it('addin Done sends the undo history and the changed view together', async () => {
    const done = vi.fn()
    const { svg } = await setup('shiny', 'layout', { schema: withView(), adapter: { done } })
    fireEvent.mouseDown(nodeCircle('F'), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.mouseUp(svg)
    await new Promise((r) => setTimeout(r, 0))
    fireEvent.keyDown(document.body, { key: 'ArrowRight' }) // a layout edit: one undo step
    await new Promise((r) => setTimeout(r, 0))
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 50, clientX: 300, clientY: 200 })
    fireEvent.click(screen.getByTitle(DONE))
    const arg = done.mock.calls[done.mock.calls.length - 1][0]
    expect(typeof arg.editHistory).toBe('string')
    expect(Object.keys(arg.visualization)).toEqual(['m'])
  })

  it('addin Done without a view change sends no view', async () => {
    const done = vi.fn()
    await setup('shiny', 'layout', { schema: withView(), adapter: { done } })
    fireEvent.click(screen.getByTitle(DONE))
    expect(done).toHaveBeenCalledWith()
  })

  it('drawSEM() Done (full editing) never sends the view, and syncs never carry it', async () => {
    const done = vi.fn()
    const { svg, onModelChange } = await setup('shiny', 'full', { schema: withView(), adapter: { done } })
    fireEvent.wheel(svg, { ctrlKey: true, deltaY: 50, clientX: 300, clientY: 200 })
    fireEvent.click(layerButton('SEM'))
    fireEvent.click(screen.getByTitle(DONE))
    expect(done).toHaveBeenCalledWith()
    for (const c of onModelChange.mock.calls) expect(c[0].models.m.visualization).toEqual({ anchor: { x: 1, y: 2 }, ...STORED })
  })
})
