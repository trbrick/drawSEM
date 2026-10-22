/**
 * Multi-selection, step 2: drag-to-many path creation (fan-out, fan-in,
 * pairwise covariances), Shift for two-headed paths, the macOS Ctrl = right
 * click rule, and the multi-selection popup's group actions (add means,
 * correlate all, change all paths / nodes). Each edit is one undo step.
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
 * Canvas layout (canvas units):
 *   F   latent    (0, 0)
 *   X1  manifest  (-100, 150)  (data path from D)
 *   X2  latent    (100, 150)
 *   X3  latent    (300, 150)
 *   D   dataset   (0, 350)     off-layer in the default SEM layer
 * Paths, in order: l1 F->X1, l2 F->X2, X2<->X2, D->X1 (data).
 */
const POS: Record<string, { x: number; y: number }> = {
  F: { x: 0, y: 0 }, X1: { x: -100, y: 150 }, X2: { x: 100, y: 150 }, X3: { x: 300, y: 150 }, D: { x: 0, y: 350 },
}

function fixture(): GraphSchema {
  return {
    schemaVersion: 0,
    models: {
      m: {
        label: 'Test',
        nodes: [
          { label: 'F', type: 'variable', visual: POS.F },
          { label: 'X1', type: 'variable', visual: POS.X1 },
          { label: 'X2', type: 'variable', visual: POS.X2 },
          { label: 'X3', type: 'variable', visual: POS.X3 },
          {
            label: 'D', type: 'dataset', visual: POS.D,
            datasetSource: { type: 'embedded', columnTypes: { X1: 'number' }, object: [{ X1: 1 }] },
          },
        ],
        paths: [
          { label: 'l1', from: 'F', to: 'X1', numberOfArrows: 1, freeParameter: true },
          { label: 'l2', from: 'F', to: 'X2', numberOfArrows: 1, freeParameter: true, value: 0.5 },
          { from: 'X2', to: 'X2', numberOfArrows: 2, freeParameter: true },
          { from: 'D', to: 'X1', type: 'data', label: 'X1' },
        ],
      },
    },
  } as unknown as GraphSchema
}

const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }

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

/** Mock the platform before the editor mounts (it reads it once). */
function mockPlatform(platform: string) {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
}

async function setup(viewMode: 'full' | 'shiny' | 'widget' = 'shiny', editMode: 'full' | 'layout' = 'full') {
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
  await waitFor(() => expect(screen.getByText('X3')).toBeTruthy())
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  const svg = utils.container.querySelector('svg.w-full') as SVGSVGElement
  installGeometry(svg)
  const root = utils.container.querySelector('.canvas-container') as HTMLElement
  const vb = () => parseViewBox(svg.getAttribute('viewBox')!)!
  const at = (x: number, y: number) => toClient(vb(), { x, y })
  const atNode = (label: string) => at(POS[label].x, POS[label].y)
  return { ...utils, svg, root, vb, at, atNode, onModelChange }
}

type Ctx = Awaited<ReturnType<typeof setup>>

const nextTask = () => act(async () => { await Promise.resolve() })

function nodeGroup(container: HTMLElement, label: string): Element {
  const groups = Array.from(container.querySelectorAll('svg.w-full g')).reverse()
  const g = groups.find((el) => el.querySelector(':scope > text')?.textContent === label)
  if (!g) throw new Error(`no node ${label}`)
  return g
}
const nodeShape = (c: HTMLElement, label: string) => nodeGroup(c, label).firstElementChild as Element
const isNodeSelected = (c: HTMLElement, label: string) =>
  Array.from(nodeGroup(c, label).querySelectorAll('*')).some((el) => el.getAttribute('stroke') === '#ff0000')
const selectedNodeLabels = (c: HTMLElement) => ['F', 'X1', 'X2', 'X3'].filter((l) => isNodeSelected(c, l))
const summary = () => screen.queryByTestId('selection-summary')?.textContent ?? null
const info = () => screen.queryByTestId('info-message')?.textContent ?? null

async function clickNode(ctx: Ctx, label: string, mods: Partial<MouseEventInit> = {}) {
  fireEvent.mouseDown(nodeShape(ctx.container, label), { button: 0, ...mods })
  fireEvent.mouseUp(ctx.svg, { button: 0, ...mods })
  await nextTask()
}

async function select(ctx: Ctx, ...labels: string[]) {
  await clickNode(ctx, labels[0])
  for (const l of labels.slice(1)) await clickNode(ctx, l, { shiftKey: true })
}

/**
 * A path drag from one node to another: press (`button`, `down` modifiers),
 * move onto the target (`move` modifiers), release (`up` modifiers).
 */
async function pathDrag(
  ctx: Ctx,
  from: string,
  to: string,
  opts: { button?: number; down?: Partial<MouseEventInit>; move?: Partial<MouseEventInit>; up?: Partial<MouseEventInit>; beforeUp?: () => void } = {}
) {
  const button = opts.button ?? 2
  fireEvent.mouseDown(nodeShape(ctx.container, from), { button, ...ctx.atNode(from), ...opts.down })
  fireEvent.mouseMove(ctx.svg, { ...ctx.at(POS[from].x + 40, POS[from].y + 40), ...opts.move })
  await nextTask()
  fireEvent.mouseEnter(nodeShape(ctx.container, to))
  fireEvent.mouseMove(ctx.svg, { ...ctx.atNode(to), ...opts.move })
  await nextTask()
  opts.beforeUp?.()
  await nextTask()
  fireEvent.mouseUp(ctx.svg, { button, ...ctx.atNode(to), ...opts.up })
  fireEvent.mouseLeave(nodeShape(ctx.container, to))
  await nextTask()
}

const key = (target: Element, k: string, mods: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(target, { key: k, ...mods })

function lastModel(onModelChange: ReturnType<typeof vi.fn>): any {
  const last = onModelChange.mock.calls[onModelChange.mock.calls.length - 1][0]
  return Object.values(last.models)[0]
}
/** "F->X1", "X2<->X2", ... for the current model's paths, in order */
const pathKeys = (ctx: Ctx): string[] =>
  lastModel(ctx.onModelChange).paths.map((p: any) => `${p.from}${p.numberOfArrows === 2 ? '<->' : '->'}${p.to}`)
const ORIGINAL = ['F->X1', 'F->X2', 'X2<->X2', 'D->X1']

async function undo(ctx: Ctx) {
  key(ctx.root, 'z', { ctrlKey: true })
  await nextTask()
}

describe('drag-to-many paths', () => {
  it('fan-out: from every selected node to an unselected one; the selection is kept; one undo step', async () => {
    const ctx = await setup()
    await select(ctx, 'F', 'X1')
    await pathDrag(ctx, 'F', 'X3')
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'F->X3', 'X1->X3']))
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1'])
    expect(info()).toContain('Added 2 paths.')
    await undo(ctx)
    await waitFor(() => expect(pathKeys(ctx)).toEqual(ORIGINAL))
  })

  it('fan-in: from an unselected node to every selected one; the selection is kept', async () => {
    const ctx = await setup()
    await select(ctx, 'X2', 'X3')
    await pathDrag(ctx, 'F', 'X3')
    // F -> X2 exists: skipped and reported
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'F->X3']))
    expect(info()).toContain('Added 1 path; skipped 1 (already connected: F→X2).')
    expect(selectedNodeLabels(ctx.container)).toEqual(['X2', 'X3'])
  })

  it('from an unselected node to an unselected one: the start node ends up selected alone', async () => {
    const ctx = await setup()
    await select(ctx, 'X2', 'X3')
    fireEvent.mouseDown(nodeShape(ctx.container, 'X1'), { button: 2, ...ctx.atNode('X1') })
    fireEvent.mouseMove(ctx.svg, ctx.at(0, 250))
    await nextTask()
    // the selection stays visible while dragging (the possible fan-in targets)
    expect(selectedNodeLabels(ctx.container)).toEqual(['X2', 'X3'])
    fireEvent.mouseEnter(nodeShape(ctx.container, 'F'))
    fireEvent.mouseUp(ctx.svg, { button: 2, ...ctx.atNode('F') })
    await nextTask()
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'X1->F']))
    expect(selectedNodeLabels(ctx.container)).toEqual(['X1'])
  })

  it('two-headed between two selected nodes: a covariance for every pair, skipping existing ones', async () => {
    const ctx = await setup()
    await select(ctx, 'F', 'X1', 'X2')
    // a covariance F<->X1 already exists, in the other order
    await pathDrag(ctx, 'X1', 'F', { down: { shiftKey: true }, move: { shiftKey: true }, up: { shiftKey: true } })
    await pathDrag(ctx, 'X1', 'X2', { down: { shiftKey: true }, move: { shiftKey: true }, up: { shiftKey: true } })
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'F<->X1', 'F<->X2', 'X1<->X2']))
    // the first drag added all three; the second skipped all three
    expect(info()).toContain('No paths added; skipped 3 (already connected: F↔X1, F↔X2, X1↔X2).')
    await undo(ctx)
    await waitFor(() => expect(pathKeys(ctx)).toEqual(ORIGINAL))
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1', 'X2'])
  })

  it('one-headed between two selected nodes: just the one path', async () => {
    const ctx = await setup()
    await select(ctx, 'F', 'X1', 'X2', 'X3')
    await pathDrag(ctx, 'X2', 'X3')
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'X2->X3']))
    expect(info()).toBeNull()
  })

  it('reports skipped invalid pairs and adds the rest as one step', async () => {
    const ctx = await setup()
    // make a constant, then fan out from {X1, X3} to it and from {X1, X3} to F
    key(ctx.root, 'c')
    await nextTask()
    fireEvent.click(ctx.svg, ctx.at(300, 0))
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes).toHaveLength(6))
    await select(ctx, 'X1', 'X3')
    await pathDrag(ctx, 'X1', 'F')
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'X1->F', 'X3->F']))
    const before = pathKeys(ctx)
    await pathDrag(ctx, 'X3', 'F')
    expect(info()).toContain('No paths added; skipped 2 (already connected: X1→F, X3→F).')
    expect(pathKeys(ctx)).toEqual(before)
    await undo(ctx)
    await waitFor(() => expect(pathKeys(ctx)).toEqual(ORIGINAL))
  })

  it('a single node to itself, two-headed, is still a variance; one-headed, the old error', async () => {
    const ctx = await setup()
    await pathDrag(ctx, 'X3', 'X3', { down: { shiftKey: true }, up: { shiftKey: true } })
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'X3<->X3']))
    const v = lastModel(ctx.onModelChange).paths.at(-1)
    expect(v).toMatchObject({ freeParameter: true, parameterType: 'errorVariance' })
    await pathDrag(ctx, 'X1', 'X1')
    expect(screen.getByText(/Self-paths must be two-headed/)).toBeTruthy()
  })

  it('the preview draws a line from every source, and the fan over a target', async () => {
    const ctx = await setup()
    await select(ctx, 'F', 'X1')
    fireEvent.mouseDown(nodeShape(ctx.container, 'F'), { button: 2, ...ctx.atNode('F') })
    fireEvent.mouseMove(ctx.svg, ctx.at(250, -100))
    await nextTask()
    const preview = () => screen.getByTestId('path-preview')
    expect(Array.from(preview().querySelectorAll('line')).map((l) => l.getAttribute('data-preview-from'))).toEqual(['F', 'X1'])
    expect(preview().getAttribute('data-two-sided')).toBe('false')
    fireEvent.mouseEnter(nodeShape(ctx.container, 'X3'))
    fireEvent.mouseMove(ctx.svg, ctx.atNode('X3'))
    await nextTask()
    expect(Array.from(preview().querySelectorAll('line')).map((l) => `${l.getAttribute('data-preview-from')}-${l.getAttribute('data-preview-to')}`))
      .toEqual(['F-X3', 'X1-X3'])
    fireEvent.mouseUp(ctx.svg, { button: 2, ...ctx.atNode('X3') })
    await nextTask()
    expect(screen.queryByTestId('path-preview')).toBeNull()
  })
})

describe('Shift makes a path drag two-headed', () => {
  it('pressing Shift mid-drag shows both arrowheads; the release decides', async () => {
    const ctx = await setup()
    fireEvent.mouseDown(nodeShape(ctx.container, 'X1'), { button: 2, ...ctx.atNode('X1') })
    fireEvent.mouseMove(ctx.svg, ctx.at(0, 250))
    await nextTask()
    const preview = () => screen.getByTestId('path-preview')
    expect(preview().getAttribute('data-two-sided')).toBe('false')
    expect(preview().querySelector('line')!.getAttribute('marker-start')).toBeNull()
    fireEvent.keyDown(window, { key: 'Shift', shiftKey: true })
    await nextTask()
    expect(preview().getAttribute('data-two-sided')).toBe('true')
    expect(preview().querySelector('line')!.getAttribute('marker-start')).toBe('url(#arrow-start)')
    fireEvent.mouseEnter(nodeShape(ctx.container, 'X3'))
    fireEvent.mouseMove(ctx.svg, { ...ctx.atNode('X3'), shiftKey: true })
    fireEvent.mouseUp(ctx.svg, { button: 2, ...ctx.atNode('X3'), shiftKey: true })
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'X1<->X3']))
  })

  it('releasing Shift before the mouse makes it one-headed again', async () => {
    const ctx = await setup()
    await pathDrag(ctx, 'X1', 'X3', {
      down: { shiftKey: true },
      move: { shiftKey: true },
      beforeUp: () => fireEvent.keyUp(window, { key: 'Shift' }),
    })
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'X1->X3']))
  })

  it('works with the one-headed path tool; the two-headed tool is always two-headed', async () => {
    const ctx = await setup()
    key(ctx.root, 'p')
    await nextTask()
    await pathDrag(ctx, 'X1', 'X3', { button: 0, move: { shiftKey: true }, up: { shiftKey: true } })
    await waitFor(() => expect(pathKeys(ctx)).toContain('X1<->X3'))
    key(ctx.root, 't')
    await nextTask()
    await pathDrag(ctx, 'F', 'X3', { button: 0 })
    await waitFor(() => expect(pathKeys(ctx)).toContain('F<->X3'))
  })

  it('a right press with modifiers never toggles the selection', async () => {
    const ctx = await setup()
    await select(ctx, 'F', 'X2')
    for (const mods of [{ shiftKey: true }, { metaKey: true }, { ctrlKey: true }]) {
      // select mode: a path drag from a selected node keeps the group
      fireEvent.mouseDown(nodeShape(ctx.container, 'F'), { button: 2, ...mods })
      fireEvent.mouseUp(ctx.svg, { button: 2 })
      await nextTask()
      expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X2'])
    }
    // in the add-variable tool a right press does not toggle either
    key(ctx.root, 'v')
    await nextTask()
    fireEvent.mouseDown(nodeShape(ctx.container, 'X3'), { button: 2, shiftKey: true })
    fireEvent.mouseUp(ctx.svg, { button: 2 })
    await nextTask()
    expect(selectedNodeLabels(ctx.container)).toEqual(['X3'])
  })
})

describe('macOS: Ctrl+click is a right click', () => {
  it('Ctrl+left-drag from a node draws a path and keeps the selection', async () => {
    mockPlatform('MacIntel')
    const ctx = await setup()
    await select(ctx, 'F', 'X1')
    await pathDrag(ctx, 'F', 'X3', { button: 0, down: { ctrlKey: true }, move: { ctrlKey: true }, up: { ctrlKey: true } })
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'F->X3', 'X1->X3']))
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X1'])
  })

  it('Ctrl+left-drag on the background pans; Ctrl neither toggles nor adds to a marquee', async () => {
    mockPlatform('MacIntel')
    const ctx = await setup()
    const before = ctx.vb()
    const a = ctx.at(-300, -150)
    fireEvent.mouseDown(ctx.svg, { button: 0, ctrlKey: true, ...a })
    fireEvent.mouseMove(window, { clientX: a.clientX + 50, clientY: a.clientY + 30 })
    fireEvent.mouseUp(window, { button: 0, clientX: a.clientX + 50, clientY: a.clientY + 30 })
    fireEvent.click(ctx.svg, { button: 0, ctrlKey: true, clientX: a.clientX + 50, clientY: a.clientY + 30 })
    await nextTask()
    expect(ctx.vb().x).toBeLessThan(before.x)
    expect(ctx.container.querySelector('[data-testid="selection-marquee"]')).toBeNull()

    await clickNode(ctx, 'F')
    await clickNode(ctx, 'X2', { ctrlKey: true }) // a right click: starts (and ends) a path drag
    expect(selectedNodeLabels(ctx.container)).toEqual(['X2'])
    await clickNode(ctx, 'F', { metaKey: true })
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X2'])
    await clickNode(ctx, 'X3', { shiftKey: true })
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X2', 'X3'])
  })

  it('elsewhere Ctrl still toggles and Ctrl+left-drag on a node moves it', async () => {
    mockPlatform('Win32')
    const ctx = await setup()
    await clickNode(ctx, 'F')
    await clickNode(ctx, 'X2', { ctrlKey: true })
    expect(selectedNodeLabels(ctx.container)).toEqual(['F', 'X2'])
    const before = ctx.vb()
    const a = ctx.at(-300, -150)
    fireEvent.mouseDown(ctx.svg, { button: 0, ctrlKey: true, ...a })
    fireEvent.mouseMove(window, { clientX: a.clientX + 50, clientY: a.clientY + 30 })
    await nextTask()
    // a marquee (adding), not a pan
    expect(ctx.container.querySelector('[data-testid="selection-marquee"]')).not.toBeNull()
    fireEvent.mouseUp(window, { button: 0, clientX: a.clientX + 50, clientY: a.clientY + 30 })
    await nextTask()
    expect(ctx.vb()).toEqual(before)
  })
})

describe('group actions in the multi-selection popup', () => {
  it('Add means: creates the constant "1" below the selection and a free mean path to each variable; one undo step', async () => {
    const ctx = await setup()
    await select(ctx, 'X1', 'X2', 'X3')
    fireEvent.click(screen.getByRole('button', { name: /Add means/ }))
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes).toHaveLength(6))
    const m = lastModel(ctx.onModelChange)
    const one = m.nodes.find((n: any) => n.type === 'constant')
    expect(one.label).toBe('1')
    expect(one.visual.x).toBeCloseTo(103, 6) // centred under X1..X3 ([-130, 336])
    expect(one.visual.y).toBeGreaterThan(186)
    const means = m.paths.filter((p: any) => p.from === '1')
    expect(means.map((p: any) => p.to)).toEqual(['X1', 'X2', 'X3'])
    expect(means[0]).toMatchObject({ numberOfArrows: 1, freeParameter: true, parameterType: 'mean' })
    expect(info()).toContain('Added constant "1" and 3 mean paths.')
    // the new paths join the selection
    expect(summary()).toBe('3 nodes, 3 paths selected')

    // again: nothing to add
    fireEvent.click(screen.getByRole('button', { name: /Add means/ }))
    await nextTask()
    expect(info()).toContain('No mean paths added; skipped 3 (already has a mean: X1, X2, X3).')

    await undo(ctx)
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes).toHaveLength(5))
    expect(pathKeys(ctx)).toEqual(ORIGINAL)
  })

  it('Add means reuses the existing "1" node', async () => {
    const ctx = await setup()
    key(ctx.root, 'c')
    await nextTask()
    fireEvent.click(ctx.svg, ctx.at(300, 0))
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes).toHaveLength(6))
    await select(ctx, 'F', 'X3')
    fireEvent.click(screen.getByRole('button', { name: /Add means/ }))
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, '1->F', '1->X3']))
    expect(lastModel(ctx.onModelChange).nodes).toHaveLength(6)
    expect(info()).toContain('Added 2 mean paths from "1".')
  })

  it('Correlate all: a free covariance between every pair of selected variables; one undo step', async () => {
    const ctx = await setup()
    await select(ctx, 'F', 'X1', 'X2')
    await pathDrag(ctx, 'F', 'X1', { up: { shiftKey: true } }) // F<->X1 + F<->X2 + X1<->X2
    await undo(ctx)
    await pathDrag(ctx, 'X3', 'X3', { up: { shiftKey: true } }) // unrelated; X3 now selected alone
    await select(ctx, 'F', 'X1', 'X2')
    fireEvent.click(screen.getByRole('button', { name: /Correlate all/ }))
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'X3<->X3', 'F<->X1', 'F<->X2', 'X1<->X2']))
    const cov = lastModel(ctx.onModelChange).paths.at(-1)
    expect(cov).toMatchObject({ freeParameter: true, parameterType: 'covariance', numberOfArrows: 2 })
    expect(info()).toContain('Added 3 covariances.')
    expect(summary()).toBe('3 nodes, 3 paths selected')
    fireEvent.click(screen.getByRole('button', { name: /Correlate all/ }))
    await nextTask()
    expect(info()).toContain('No covariances added; skipped 3')
    await undo(ctx)
    await waitFor(() => expect(pathKeys(ctx)).toEqual([...ORIGINAL, 'X3<->X3']))
  })

  it('Change all paths: free/fixed, name and value, showing "mixed"; data paths left out', async () => {
    const ctx = await setup()
    fireEvent.click(screen.getByText('Complete Graph'))
    key(ctx.root, 'a', { ctrlKey: true })
    await nextTask()
    // 4 paths selected, one of them a data path
    expect(screen.getByTestId('group-paths-heading').textContent).toBe('All 3 selected paths (1 data path not changed)')
    const freeFixed = screen.getByLabelText('Free or fixed (all selected paths)') as HTMLSelectElement
    const value = screen.getByLabelText('Value (all selected paths)') as HTMLInputElement
    expect(freeFixed.value).toBe('free')
    expect(value.value).toBe('')
    expect(value.placeholder).toBe('mixed') // l2 has 0.5, the others none
    const name = screen.getByLabelText('Parameter name (all selected paths)') as HTMLInputElement
    expect(name.value).toBe('')

    fireEvent.change(name, { target: { value: 'b' } })
    await waitFor(() => expect(lastModel(ctx.onModelChange).paths.slice(0, 3).map((p: any) => p.freeParameter)).toEqual(['b', 'b', 'b']))
    expect(lastModel(ctx.onModelChange).paths[3].freeParameter).toBeUndefined()
    fireEvent.change(name, { target: { value: '' } })
    await waitFor(() => expect(lastModel(ctx.onModelChange).paths.slice(0, 3).map((p: any) => p.freeParameter)).toEqual([true, true, true]))

    fireEvent.change(value, { target: { value: '0.3' } })
    await waitFor(() => expect(lastModel(ctx.onModelChange).paths.slice(0, 3).map((p: any) => p.value)).toEqual([0.3, 0.3, 0.3]))
    expect(value.value).toBe('0.3')
    expect('value' in lastModel(ctx.onModelChange).paths[3]).toBe(false)

    fireEvent.change(freeFixed, { target: { value: 'fixed' } })
    await waitFor(() => expect(lastModel(ctx.onModelChange).paths.slice(0, 3).every((p: any) => !('freeParameter' in p))).toBe(true))
    expect(screen.queryByLabelText('Parameter name (all selected paths)')).toBeNull()
    await undo(ctx)
    await waitFor(() => expect(lastModel(ctx.onModelChange).paths.slice(0, 3).map((p: any) => p.freeParameter)).toEqual([true, true, true]))

    // make one path fixed: free/fixed shows mixed; choosing free frees it
    await clickNode(ctx, 'F')
    const l1 = document.querySelectorAll('path[data-path-id]')[0]
    fireEvent.click(l1, { shiftKey: true })
    await nextTask()
    const ff = () => screen.getByLabelText('Free or fixed (all selected paths)') as HTMLSelectElement
    // F and l1 selected: one path
    fireEvent.change(ff(), { target: { value: 'fixed' } })
    await nextTask()
    key(ctx.root, 'a', { ctrlKey: true })
    await nextTask()
    expect(ff().value).toBe('mixed')
    fireEvent.change(ff(), { target: { value: 'free' } })
    await waitFor(() => expect(lastModel(ctx.onModelChange).paths.slice(0, 3).map((p: any) => p.freeParameter)).toEqual([true, true, true]))
  })

  it('Change all nodes: the manifest/latent lock, showing "mixed"; one undo step', async () => {
    const ctx = await setup()
    await select(ctx, 'X2', 'X3')
    const ml = () => screen.getByLabelText('Manifest/latent (all selected variables)') as HTMLSelectElement
    expect(ml().value).toBe('auto')
    fireEvent.change(ml(), { target: { value: 'latent' } })
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes.filter((n: any) => n.variableCharacteristics?.manifestLatent === 'latent').map((n: any) => n.label)).toEqual(['X2', 'X3']))
    await clickNode(ctx, 'F', { shiftKey: true })
    expect(ml().value).toBe('mixed')
    fireEvent.change(ml(), { target: { value: 'manifest' } })
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes.filter((n: any) => n.variableCharacteristics?.manifestLatent === 'manifest')).toHaveLength(3))
    // manifest without data: the usual warning
    expect(screen.getByText(/"F" is marked manifest but has no incoming dataset path/)).toBeTruthy()
    await undo(ctx)
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes.filter((n: any) => n.variableCharacteristics?.manifestLatent === 'latent')).toHaveLength(2))
    fireEvent.change(ml(), { target: { value: 'auto' } })
    await waitFor(() => expect(lastModel(ctx.onModelChange).nodes.every((n: any) => !n.variableCharacteristics)).toBe(true))
  })

  it('hidden in layout-only mode, and with a single selection', async () => {
    const ctx = await setup('shiny', 'layout')
    await select(ctx, 'X1', 'X2')
    expect(summary()).toBe('2 nodes selected')
    expect(screen.queryByTestId('group-actions')).toBeNull()
    expect(screen.queryByRole('button', { name: /Add means/ })).toBeNull()
    cleanup()
    const ctx2 = await setup()
    await clickNode(ctx2, 'X1')
    expect(screen.queryByTestId('group-actions')).toBeNull()
    await clickNode(ctx2, 'X2', { shiftKey: true })
    expect(screen.getByTestId('group-actions')).toBeTruthy()
  })

  it('layout-only: a right-drag draws no path', async () => {
    const ctx = await setup('shiny', 'layout')
    await select(ctx, 'X1', 'X2')
    await pathDrag(ctx, 'X1', 'X3')
    expect(pathKeys(ctx)).toEqual(ORIGINAL)
  })
})
