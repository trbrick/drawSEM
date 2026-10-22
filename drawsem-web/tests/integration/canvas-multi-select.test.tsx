/**
 * Multi-selection: Shift/Cmd/Ctrl-click toggling, the background-drag selection
 * rectangle (marquee), group move / nudge / delete as one undo step each,
 * select all, Escape, and the same behaviour in layout-only mode and the plain
 * widget. A single selection behaves as before.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'
import { parseViewBox, clientToViewBox } from '../../src/utils/viewport'
import type { ViewBox } from '../../src/utils/viewport'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanup()
})

/*
 * Canvas layout (shape bounding boxes, canvas units):
 *   F   latent    (0, 0)      [-36, 36] x [-36, 36]
 *   X1  manifest  (-100, 150) [-130, -70] x [120, 180]   (data path from D)
 *   X2  latent    (100, 150)  [64, 136] x [114, 186]
 *   D   dataset   (0, 350)    off-layer in the default SEM layer
 * Paths, in order: l1 F->X1, l2 F->X2, X2<->X2, D->X1 (data).
 */
function fixture(): GraphSchema {
  return {
    schemaVersion: 0,
    models: {
      m: {
        label: 'Test',
        nodes: [
          { label: 'F', type: 'variable', visual: { x: 0, y: 0 } },
          { label: 'X1', type: 'variable', visual: { x: -100, y: 150 } },
          { label: 'X2', type: 'variable', visual: { x: 100, y: 150 } },
          {
            label: 'D', type: 'dataset', visual: { x: 0, y: 350 },
            datasetSource: { type: 'embedded', columnTypes: { X1: 'number' }, object: [{ X1: 1 }] },
          },
        ],
        paths: [
          { label: 'l1', from: 'F', to: 'X1', numberOfArrows: 1, freeParameter: true },
          { label: 'l2', from: 'F', to: 'X2', numberOfArrows: 1, freeParameter: true },
          { from: 'X2', to: 'X2', numberOfArrows: 2, freeParameter: true },
          { from: 'D', to: 'X1', type: 'data', label: 'X1' },
        ],
      },
    },
  } as unknown as GraphSchema
}

type ViewMode = 'full' | 'shiny' | 'widget'

const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }

/** jsdom has no SVG geometry: an 800x600 canvas mapped from its current viewBox (xMidYMid meet). */
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
    clientX: (RECT.width - vb.width * s) / 2 + (p.x - vb.x) * s,
    clientY: (RECT.height - vb.height * s) / 2 + (p.y - vb.y) * s,
  }
}

async function setup(viewMode: ViewMode = 'shiny', editMode: 'full' | 'layout' = 'full') {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  const onModelChange = vi.fn()
  const adapter: GraphAdapter = {
    load: vi.fn(async () => { throw new Error('Not used in this test') }),
    save: vi.fn(async () => {}),
    export: vi.fn(async () => 'mock'),
  }
  const utils = render(
    <AdapterContext.Provider value={adapter}>
      <CanvasTool initialSchema={fixture()} onModelChange={onModelChange} viewMode={viewMode} editMode={editMode} />
    </AdapterContext.Provider>
  )
  await waitFor(() => expect(screen.getByText('X2')).toBeTruthy())
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  const svg = utils.container.querySelector('svg.w-full') as SVGSVGElement
  installGeometry(svg)
  const root = utils.container.querySelector('.canvas-container') as HTMLElement
  const vb = () => parseViewBox(svg.getAttribute('viewBox')!)!
  /** client coordinates of a canvas point in the current view */
  const at = (x: number, y: number) => toClient(vb(), { x, y })
  return { ...utils, svg, root, vb, at, onModelChange }
}

type Ctx = Awaited<ReturnType<typeof setup>>

// Separate user events are separate tasks (edits within one task are one step).
const nextTask = () => act(async () => { await Promise.resolve() })

/** The <g> of the node labelled `label` (nodes are drawn after the path labels). */
function nodeGroup(container: HTMLElement, label: string): Element {
  const groups = Array.from(container.querySelectorAll('svg.w-full g')).reverse()
  const g = groups.find((el) => el.querySelector(':scope > text')?.textContent === label)
  if (!g) throw new Error(`no node ${label}`)
  return g
}
/** The node's hit shape (its first child). */
const nodeShape = (c: HTMLElement, label: string) => nodeGroup(c, label).firstElementChild as Element
const isNodeSelected = (c: HTMLElement, label: string) =>
  Array.from(nodeGroup(c, label).querySelectorAll('*')).some((el) => el.getAttribute('stroke') === '#ff0000')
const selectedNodeLabels = (c: HTMLElement) => ['F', 'X1', 'X2', 'D'].filter((l) => isNodeSelected(c, l))

/** Path elements in model order: l1, l2, X2 loop, data path. */
const pathEls = (c: HTMLElement) => Array.from(c.querySelectorAll('path[data-path-id]'))
const PATH_NAMES = ['l1', 'l2', 'loop', 'data']
const selectedPathNames = (c: HTMLElement) =>
  pathEls(c).map((el, i) => (el.getAttribute('stroke') === '#ff0000' ? PATH_NAMES[i] : null)).filter(Boolean)

const summary = () => screen.queryByTestId('selection-summary')?.textContent ?? null

/** A plain or modified click on a node (selection happens on mousedown). */
async function clickNode(ctx: Ctx, label: string, mods: Partial<MouseEventInit> = {}) {
  fireEvent.mouseDown(nodeShape(ctx.container, label), { button: 0, ...mods })
  fireEvent.mouseUp(ctx.svg, { button: 0, ...mods })
  await nextTask()
}

async function clickPath(ctx: Ctx, name: string, mods: Partial<MouseEventInit> = {}) {
  fireEvent.click(pathEls(ctx.container)[PATH_NAMES.indexOf(name)], { button: 0, ...mods })
  await nextTask()
}

/** Left-drag on the background between two canvas points, then the click the browser sends. */
async function marquee(ctx: Ctx, from: { x: number; y: number }, to: { x: number; y: number }, mods: Partial<MouseEventInit> = {}) {
  const a = ctx.at(from.x, from.y)
  const b = ctx.at(to.x, to.y)
  fireEvent.mouseDown(ctx.svg, { button: 0, ...a, ...mods })
  for (let i = 1; i <= 4; i++) {
    fireEvent.mouseMove(ctx.svg, { clientX: a.clientX + ((b.clientX - a.clientX) * i) / 4, clientY: a.clientY + ((b.clientY - a.clientY) * i) / 4, ...mods })
    await nextTask()
  }
  expect(ctx.container.querySelector('[data-testid="selection-marquee"]')).not.toBeNull()
  fireEvent.mouseUp(ctx.svg, { button: 0, ...b, ...mods })
  fireEvent.click(ctx.svg, { button: 0, ...b, ...mods })
  await nextTask()
  expect(ctx.container.querySelector('[data-testid="selection-marquee"]')).toBeNull()
}

/** Drag a node by a canvas offset. */
async function dragNode(ctx: Ctx, label: string, start: { x: number; y: number }, by: { x: number; y: number }) {
  const a = ctx.at(start.x, start.y)
  const b = ctx.at(start.x + by.x, start.y + by.y)
  fireEvent.mouseDown(nodeShape(ctx.container, label), { button: 0, ...a })
  for (let i = 1; i <= 5; i++) {
    fireEvent.mouseMove(ctx.svg, { clientX: a.clientX + ((b.clientX - a.clientX) * i) / 5, clientY: a.clientY + ((b.clientY - a.clientY) * i) / 5 })
    await nextTask()
  }
  fireEvent.mouseUp(ctx.svg, { button: 0, ...b })
  await nextTask()
}

const key = (target: Element, k: string, mods: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(target, { key: k, ...mods })

function lastModel(onModelChange: ReturnType<typeof vi.fn>): any {
  const last = onModelChange.mock.calls[onModelChange.mock.calls.length - 1][0]
  return Object.values(last.models)[0]
}
function pos(onModelChange: ReturnType<typeof vi.fn>, label: string) {
  const n = lastModel(onModelChange).nodes.find((x: any) => x.label === label)
  return { x: Math.round(n.visual.x * 1000) / 1000, y: Math.round(n.visual.y * 1000) / 1000 }
}

// Marquee around F and X1 (not X2, whose box starts at x = 64)
const AROUND_F_X1: [{ x: number; y: number }, { x: number; y: number }] = [{ x: -150, y: -50 }, { x: 50, y: 200 }]

describe('click selection', () => {
  it('Shift-, Cmd- and Ctrl-click toggle nodes and paths; a plain click selects only that element', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'F')
    expect(selectedNodeLabels(ctx.container)).toEqual(['F'])
    await clickNode(ctx, 'X2', { shiftKey: true })
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X2'])
    expect(summary()).toBe('2 nodes selected')
    await clickPath(ctx, 'l1', { metaKey: true })
    expect(selectedPathNames(ctx.container)).toEqual(['l1'])
    expect(summary()).toBe('2 nodes, 1 path selected')
    await clickNode(ctx, 'F', { ctrlKey: true })
    expect(selectedNodeLabels(ctx.container)).toEqual(['X2'])
    await clickPath(ctx, 'l1', { shiftKey: true })
    expect(selectedPathNames(ctx.container)).toEqual([])
    // one element left: the single-element popup again
    expect(summary()).toBeNull()
    expect(screen.getByText('Node: X2')).toBeTruthy()

    await clickNode(ctx, 'F', { shiftKey: true })
    await clickPath(ctx, 'l2', { shiftKey: true })
    expect(summary()).toBe('2 nodes, 1 path selected')
    // a plain click on a selected node selects it alone
    await clickNode(ctx, 'F')
    expect(selectedNodeLabels(ctx.container)).toEqual(['F'])
    expect(selectedPathNames(ctx.container)).toEqual([])
    // a plain click on a path selects it alone
    await clickNode(ctx, 'X2', { shiftKey: true })
    await clickPath(ctx, 'l1')
    expect(selectedNodeLabels(ctx.container)).toEqual([])
    expect(selectedPathNames(ctx.container)).toEqual(['l1'])
  })

  it("a press inside a variable's drawn area selects the variable, never a path drawn beneath it", async () => {
    const ctx = await setup()
    fireEvent.click(screen.getByText('Complete Graph'))
    await nextTask()
    // Hit order: every node (shape and label) is drawn after, so over, every
    // path, loop grab area, cable branch and path label.
    const svg = ctx.svg
    const under = Array.from(svg.querySelectorAll('path[data-path-id], path[stroke="transparent"], [data-path-label]'))
    expect(under.length).toBeGreaterThan(4)
    for (const label of ['F', 'X1', 'X2']) {
      const g = nodeGroup(ctx.container, label)
      for (const el of under) expect(el.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // a press on a node's label text (inside its shape) selects the node
    fireEvent.mouseDown(nodeGroup(ctx.container, 'X2').querySelector(':scope > text')!, { button: 0 })
    fireEvent.mouseUp(ctx.svg, { button: 0 })
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual(['X2'])
    expect(selectedPathNames(ctx.container)).toEqual([])
    fireEvent.mouseDown(nodeGroup(ctx.container, 'X1').querySelector(':scope > text')!, { button: 0, shiftKey: true })
    fireEvent.mouseUp(ctx.svg, { button: 0, shiftKey: true })
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual(['X1', 'X2'])
    expect(selectedPathNames(ctx.container)).toEqual([])
  })

  it('a plain click on the background clears the selection', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'F')
    await clickNode(ctx, 'X2', { shiftKey: true })
    fireEvent.click(ctx.svg, ctx.at(300, -200))
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual([])
    expect(screen.queryByTitle('Close popup')).toBeNull()
  })
})

describe('selection rectangle', () => {
  it('selects the nodes inside it and the paths attached to them that it covers enough of', async () => {
    const ctx = await setup()
    await marquee(ctx, ...AROUND_F_X1)
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1'])
    // l2 (F -> X2) is mostly inside, though X2 is not
    expect(selectedPathNames(ctx.container)).toEqual(['l1', 'l2'])
    expect(summary()).toBe('2 nodes, 2 paths selected')
    expect(ctx.onModelChange.mock.calls.length).toBeGreaterThan(0)
  })

  it('leaves out a node only partly inside, and paths attached to no selected node', async () => {
    const ctx = await setup()
    await marquee(ctx, { x: -150, y: -50 }, { x: 20, y: 200 }) // F reaches x = 36
    expect(selectedNodeLabels(ctx.container)).toEqual(['X1'])
    // l1 runs from F's edge to X1: all of it is inside, and X1 is selected
    expect(selectedPathNames(ctx.container)).toEqual(['l1'])
    // a box over l1 and l2 alone, with no node inside, selects nothing
    await marquee(ctx, { x: -60, y: 40 }, { x: 60, y: 100 })
    expect(selectedNodeLabels(ctx.container)).toEqual([])
    expect(selectedPathNames(ctx.container)).toEqual([])
  })

  it('a box close around a node leaves out its paths; a broad one takes them all', async () => {
    const ctx = await setup()
    // X2's box is [64, 136] x [114, 186]; its loop is drawn outside it
    await marquee(ctx, { x: 60, y: 110 }, { x: 140, y: 190 })
    expect(selectedNodeLabels(ctx.container)).toEqual(['X2'])
    expect(selectedPathNames(ctx.container)).toEqual([])
    await marquee(ctx, { x: 50, y: 100 }, { x: 150, y: 200 })
    expect(selectedPathNames(ctx.container)).toEqual([])
    // broad: the loop, and enough of l2 (from F, outside the box)
    await marquee(ctx, { x: 0, y: 60 }, { x: 260, y: 300 })
    expect(selectedNodeLabels(ctx.container)).toEqual(['X2'])
    expect(selectedPathNames(ctx.container)).toEqual(['l2', 'loop'])
  })

  it('in the Complete Graph a tight box around a manifest variable leaves out its data cable', async () => {
    const ctx = await setup()
    fireEvent.click(screen.getByText('Complete Graph'))
    await nextTask()
    // X1 is [-130, -70] x [120, 180]; its cable branch from D ends on its edge
    await marquee(ctx, { x: -135, y: 115 }, { x: -65, y: 185 })
    expect(selectedNodeLabels(ctx.container)).toEqual(['X1'])
    expect(selectedPathNames(ctx.container)).toEqual([])
    // the branch (not D's shared trunk) inside the box selects the data path
    await marquee(ctx, { x: -135, y: 115 }, { x: 40, y: 340 })
    expect(selectedNodeLabels(ctx.container)).toEqual(['X1'])
    expect(selectedPathNames(ctx.container)).toEqual(['data'])
  })

  it('draws what it would select while dragging, before the release changes the selection', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'X2')
    const a = ctx.at(AROUND_F_X1[0].x, AROUND_F_X1[0].y)
    fireEvent.mouseDown(ctx.svg, { button: 0, ...a })
    // part way: a box around X1 only
    const mid = ctx.at(-60, 200)
    fireEvent.mouseMove(ctx.svg, { clientX: mid.clientX, clientY: mid.clientY })
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual(['X1'])
    // the whole box: F and X1 light up, with their paths; X2 (not additive) does not
    const b = ctx.at(AROUND_F_X1[1].x, AROUND_F_X1[1].y)
    fireEvent.mouseMove(ctx.svg, { clientX: b.clientX, clientY: b.clientY })
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1'])
    expect(selectedPathNames(ctx.container)).toEqual(['l1', 'l2'])
    // the selection itself is still X2 until the release
    expect(screen.getByText('Node: X2')).toBeTruthy()
    fireEvent.mouseUp(ctx.svg, { button: 0, ...b })
    fireEvent.click(ctx.svg, { button: 0, ...b })
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1'])
    expect(summary()).toBe('2 nodes, 2 paths selected')
  })

  it('works in either drag direction', async () => {
    const ctx = await setup()
    await marquee(ctx, AROUND_F_X1[1], AROUND_F_X1[0])
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1'])
  })

  it.each(['shiftKey', 'metaKey', 'ctrlKey'] as const)('adds to the selection with a modifier (%s)', async (mod) => {
    const ctx = await setup()
    await clickNode(ctx, 'X2')
    await marquee(ctx, ...AROUND_F_X1, { [mod]: true })
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1', 'X2'])
    // the paths the box covers: l1 and l2, not X2's loop (outside it), though X2 is selected
    expect(selectedPathNames(ctx.container)).toEqual(['l1', 'l2'])
  })

  it('replaces the selection without a modifier', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'X2')
    await marquee(ctx, ...AROUND_F_X1)
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1'])
  })

  it('an empty rectangle clears the selection', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'X2')
    await marquee(ctx, { x: 200, y: -100 }, { x: 300, y: 0 })
    expect(selectedNodeLabels(ctx.container)).toEqual([])
  })

  it('never selects off-layer elements, hidden or translucent', async () => {
    const ctx = await setup()
    const everything: [{ x: number; y: number }, { x: number; y: number }] = [{ x: -400, y: -200 }, { x: 400, y: 500 }]
    // default: SEM layer, off-layer hidden
    expect(screen.getByText('Variables, constants & SEM paths')).toBeTruthy()
    await marquee(ctx, ...everything)
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1', 'X2'])
    expect(selectedPathNames(ctx.container)).toEqual(['l1', 'l2', 'loop'])

    // translucent off-layer elements are still not selectable by rectangle
    fireEvent.change(screen.getByText('Off-Layer:').querySelector('select')!, { target: { value: 'transparent' } })
    await marquee(ctx, ...everything)
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1', 'X2'])

    // Data layer: the dataset and the manifest variable it feeds
    fireEvent.click(screen.getByText('Data'))
    await marquee(ctx, ...everything)
    expect(selectedNodeLabels(ctx.container)).toEqual(['X1', 'D'])
    expect(selectedPathNames(ctx.container)).toEqual(['data'])

    fireEvent.click(screen.getByText('Complete Graph'))
    await marquee(ctx, ...everything)
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1', 'X2', 'D'])
    expect(summary()).toBe('4 nodes, 4 paths selected')
  })

  it('maps to the canvas at any zoom and pan', async () => {
    const ctx = await setup()
    const before = ctx.vb()
    fireEvent.wheel(ctx.svg, { ctrlKey: true, deltaY: -300, clientX: 600, clientY: 450 })
    fireEvent.wheel(ctx.svg, { deltaX: 40, deltaY: 25 })
    await nextTask()
    expect(ctx.vb().width).toBeLessThan(before.width)
    await marquee(ctx, { x: 50, y: 100 }, { x: 150, y: 200 })
    expect(selectedNodeLabels(ctx.container)).toEqual(['X2'])
    expect(selectedPathNames(ctx.container)).toEqual([]) // X2's loop is drawn outside the box
    // the rectangle is drawn in canvas coordinates with a zoom-independent stroke
    const a = ctx.at(-150, -50)
    fireEvent.mouseDown(ctx.svg, { button: 0, ...a })
    fireEvent.mouseMove(ctx.svg, ctx.at(50, 200))
    const rect = ctx.container.querySelector('[data-testid="selection-marquee"]')!
    expect(Number(rect.getAttribute('x'))).toBeCloseTo(-150, 6)
    expect(Number(rect.getAttribute('width'))).toBeCloseTo(200, 6)
    expect(rect.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    fireEvent.mouseUp(ctx.svg, { button: 0 })
  })

  it('the click after the release neither deselects nor adds a node, in select or add mode', async () => {
    const ctx = await setup()
    await marquee(ctx, ...AROUND_F_X1) // asserts the click is sent
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1'])

    // add-variable tool: a background drag is still a selection rectangle
    key(ctx.root, 'v')
    await nextTask()
    const nodesBefore = lastModel(ctx.onModelChange).nodes.length
    await marquee(ctx, { x: 50, y: 100 }, { x: 150, y: 200 })
    expect(lastModel(ctx.onModelChange).nodes).toHaveLength(nodesBefore)
    expect(selectedNodeLabels(ctx.container)).toEqual(['X2'])
    // the tool still acts on a click
    expect(screen.getByText(/^Mode: add-variable/)).toBeTruthy()
    fireEvent.click(ctx.svg, ctx.at(300, -200))
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes).toHaveLength(nodesBefore + 1))
  })

  it('a press released without moving is an ordinary background click', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'F')
    const p = ctx.at(300, -200)
    fireEvent.mouseDown(ctx.svg, { button: 0, ...p })
    fireEvent.mouseMove(ctx.svg, { clientX: p.clientX + 2, clientY: p.clientY + 1 })
    expect(ctx.container.querySelector('[data-testid="selection-marquee"]')).toBeNull()
    fireEvent.mouseUp(ctx.svg, { button: 0, ...p })
    fireEvent.click(ctx.svg, p)
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual([])
  })
})

describe('group move, nudge and delete', () => {
  it('dragging a selected node moves the whole selection as one undo step', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'F')
    await clickNode(ctx, 'X2', { shiftKey: true })
    await dragNode(ctx, 'F', { x: 0, y: 0 }, { x: 50, y: 30 })
    await waitFor(() => expect(pos(ctx.onModelChange, 'F')).toEqual({ x: 50, y: 30 }))
    expect(pos(ctx.onModelChange, 'X2')).toEqual({ x: 150, y: 180 })
    expect(pos(ctx.onModelChange, 'X1')).toEqual({ x: -100, y: 150 })
    // still both selected after the drag
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X2'])

    key(ctx.root, 'z', { ctrlKey: true })
    await waitFor(() => expect(pos(ctx.onModelChange, 'F')).toEqual({ x: 0, y: 0 }))
    expect(pos(ctx.onModelChange, 'X2')).toEqual({ x: 100, y: 150 })
  })

  it('dragging an unselected node selects and moves it alone', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'F')
    await clickNode(ctx, 'X2', { shiftKey: true })
    await dragNode(ctx, 'X1', { x: -100, y: 150 }, { x: -20, y: 10 })
    await waitFor(() => expect(pos(ctx.onModelChange, 'X1')).toEqual({ x: -120, y: 160 }))
    expect(pos(ctx.onModelChange, 'F')).toEqual({ x: 0, y: 0 })
    expect(selectedNodeLabels(ctx.container)).toEqual(['X1'])
  })

  it('arrow keys nudge every selected node, coalesced into one undo step', async () => {
    const ctx = await setup()
    await marquee(ctx, ...AROUND_F_X1)
    for (let i = 0; i < 3; i++) {
      key(ctx.root, 'ArrowRight')
      await nextTask()
    }
    key(ctx.root, 'ArrowDown', { shiftKey: true })
    await waitFor(() => expect(pos(ctx.onModelChange, 'F')).toEqual({ x: 3, y: 10 }))
    expect(pos(ctx.onModelChange, 'X1')).toEqual({ x: -97, y: 160 })
    expect(pos(ctx.onModelChange, 'X2')).toEqual({ x: 100, y: 150 })
    key(ctx.root, 'z', { ctrlKey: true })
    await waitFor(() => expect(pos(ctx.onModelChange, 'F')).toEqual({ x: 0, y: 0 }))
    expect(pos(ctx.onModelChange, 'X1')).toEqual({ x: -100, y: 150 })
  })

  it('hiding a layer drops its elements from the selection, so Delete never removes hidden elements', async () => {
    const ctx = await setup()
    fireEvent.click(screen.getByText('Complete Graph'))
    await marquee(ctx, { x: -400, y: -200 }, { x: 400, y: 500 })
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1', 'X2', 'D'])

    // SEM layer with off-layer elements hidden: the dataset and its data path leave the selection
    fireEvent.click(screen.getByRole('button', { name: 'SEM' }))
    await nextTask()
    expect(summary()).toBe('3 nodes, 3 paths selected')
    key(ctx.root, 'Delete')
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes.map((n: any) => n.label)).toEqual(['D']))
  })

  it('Delete removes the selected nodes with their paths and the selected paths, as one undo step', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'F')
    await clickPath(ctx, 'loop', { shiftKey: true })
    key(ctx.root, 'Delete')
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes.map((n: any) => n.label)).toEqual(['X1', 'X2', 'D']))
    // l1, l2 (incident to F) and the selected loop are gone
    expect(lastModel(ctx.onModelChange).paths.map((p: any) => `${p.from}-${p.to}`)).toEqual(['D-X1'])
    expect(screen.queryByTitle('Close popup')).toBeNull()

    key(ctx.root, 'z', { ctrlKey: true })
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes).toHaveLength(4))
    expect(lastModel(ctx.onModelChange).paths).toHaveLength(4)
    // the deleted elements were deselected; nothing comes back selected
    expect(selectedNodeLabels(ctx.container)).toEqual([])
  })

  it("the popup's Delete button deletes the whole selection", async () => {
    const ctx = await setup()
    await marquee(ctx, ...AROUND_F_X1)
    fireEvent.click(screen.getByTitle('Delete the selected elements (Backspace)'))
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes.map((n: any) => n.label)).toEqual(['X2', 'D']))
    expect(lastModel(ctx.onModelChange).paths.map((p: any) => `${p.from}-${p.to}`)).toEqual(['X2-X2'])
  })

  it('undo/redo drops selected elements that no longer exist', async () => {
    const ctx = await setup()
    // add a node, then select it with F; undoing the add leaves F selected
    key(ctx.root, 'v')
    await nextTask()
    fireEvent.click(ctx.svg, ctx.at(300, -200))
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes).toHaveLength(5))
    await clickNode(ctx, 'F', { shiftKey: true })
    expect(summary()).toBe('2 nodes selected')
    key(ctx.root, 'z', { ctrlKey: true })
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes).toHaveLength(4))
    expect(summary()).toBeNull()
    expect(screen.getByText('Node: F')).toBeTruthy()
  })
})

describe('select all and Escape', () => {
  it('Cmd/Ctrl+A selects everything in the active layer', async () => {
    const ctx = await setup()
    key(ctx.root, 'a', { ctrlKey: true })
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1', 'X2'])
    expect(selectedPathNames(ctx.container)).toEqual(['l1', 'l2', 'loop'])
    expect(summary()).toBe('3 nodes, 3 paths selected')
    fireEvent.click(screen.getByText('Complete Graph'))
    key(ctx.root, 'a', { metaKey: true })
    await nextTask()
    expect(summary()).toBe('4 nodes, 4 paths selected')
  })

  it('Cmd/Ctrl+A does nothing while typing', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'F')
    const input = screen.getByDisplayValue('F') as HTMLInputElement
    input.focus()
    key(input, 'a', { ctrlKey: true })
    await nextTask()
    expect(summary()).toBeNull()
    expect(selectedNodeLabels(ctx.container)).toEqual(['F'])
  })

  it('Escape clears the whole selection, after leaving an add mode', async () => {
    const ctx = await setup()
    key(ctx.root, 'a', { ctrlKey: true })
    key(ctx.root, 'v')
    await nextTask()
    key(ctx.root, 'Escape')
    await nextTask()
    expect(screen.getByText(/^Mode: select/)).toBeTruthy()
    expect(summary()).toBe('3 nodes, 3 paths selected')
    key(ctx.root, 'Escape')
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual([])
    expect(screen.queryByTitle('Close popup')).toBeNull()
  })

  it("the popup's Close button clears the whole selection", async () => {
    const ctx = await setup()
    key(ctx.root, 'a', { ctrlKey: true })
    await nextTask()
    fireEvent.click(screen.getByTitle('Close popup'))
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual([])
  })
})

describe('contexts', () => {
  it('layout-only: select, move and nudge a group; no delete', async () => {
    const ctx = await setup('shiny', 'layout')
    await marquee(ctx, ...AROUND_F_X1)
    await clickNode(ctx, 'X2', { shiftKey: true })
    expect(summary()).toBe('3 nodes, 2 paths selected')
    expect(screen.queryByTitle('Delete the selected elements (Backspace)')).toBeNull()
    await dragNode(ctx, 'X2', { x: 100, y: 150 }, { x: 10, y: 0 })
    await waitFor(() => expect(pos(ctx.onModelChange, 'F')).toEqual({ x: 10, y: 0 }))
    expect(pos(ctx.onModelChange, 'X1')).toEqual({ x: -90, y: 150 })
    key(ctx.root, 'ArrowUp')
    await waitFor(() => expect(pos(ctx.onModelChange, 'X2')).toEqual({ x: 110, y: 149 }))
    key(ctx.root, 'Backspace')
    key(ctx.root, 'Delete')
    await nextTask()
    expect(lastModel(ctx.onModelChange).nodes).toHaveLength(4)
    expect(lastModel(ctx.onModelChange).paths).toHaveLength(4)
    expect(summary()).toBe('3 nodes, 2 paths selected')
  })

  it('widget: select (no popup), move and nudge a group', async () => {
    const ctx = await setup('widget')
    await marquee(ctx, ...AROUND_F_X1)
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1'])
    expect(selectedPathNames(ctx.container)).toEqual(['l1', 'l2'])
    expect(screen.queryByTitle('Close popup')).toBeNull()
    await clickNode(ctx, 'X2', { shiftKey: true })
    await dragNode(ctx, 'F', { x: 0, y: 0 }, { x: 0, y: -40 })
    await waitFor(() => expect(pos(ctx.onModelChange, 'X2')).toEqual({ x: 100, y: 110 }))
    ctx.root.focus()
    key(ctx.root, 'ArrowLeft')
    await waitFor(() => expect(pos(ctx.onModelChange, 'X1')).toEqual({ x: -101, y: 110 }))
  })
})

describe('single selection is unchanged', () => {
  it('one node: the popup shows its details and the label field', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'F')
    expect(screen.getByText('Node: F')).toBeTruthy()
    expect(screen.getByDisplayValue('F')).toBeTruthy()
    expect(screen.getByTitle('Delete (Backspace)')).toBeTruthy()
    expect(summary()).toBeNull()
  })

  it('one path: the popup shows its details', async () => {
    const ctx = await setup()
    await clickPath(ctx, 'l1')
    expect(screen.getByText('Path: l1')).toBeTruthy()
  })

  it('the dataset panel only with exactly one dataset node selected', async () => {
    const ctx = await setup()
    fireEvent.click(screen.getByText('Complete Graph'))
    await clickNode(ctx, 'D')
    await waitFor(() => expect(screen.getByText('Dataset: D')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('Mean')).toBeTruthy())
    await clickNode(ctx, 'F', { shiftKey: true })
    expect(screen.queryByText('Dataset: D')).toBeNull()
    expect(screen.queryByText('Mean')).toBeNull()
    expect(summary()).toBe('2 nodes selected')
  })

  it('dragging a lone node moves only it, as one step', async () => {
    const ctx = await setup()
    await dragNode(ctx, 'F', { x: 0, y: 0 }, { x: 50, y: 30 })
    await waitFor(() => expect(pos(ctx.onModelChange, 'F')).toEqual({ x: 50, y: 30 }))
    expect(pos(ctx.onModelChange, 'X2')).toEqual({ x: 100, y: 150 })
    expect(selectedNodeLabels(ctx.container)).toEqual(['F'])
    key(ctx.root, 'z', { ctrlKey: true })
    await waitFor(() => expect(pos(ctx.onModelChange, 'F')).toEqual({ x: 0, y: 0 }))
  })
})
