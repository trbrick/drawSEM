/**
 * Copy, cut, paste and duplicate of the selection: the keyboard shortcuts, the
 * popup's Duplicate action, paste events, one paste per Cmd/Ctrl+V, offsets,
 * one undo step each, the pasted elements becoming the selection, page text
 * selections, no-op while typing, and layout-only mode.
 * The rules themselves are unit-tested in tests/utils/clipboard.test.ts.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'
import { convertToUnicode } from '../../src/utils/converters'
import { resetMemoryClipboard, serializeFragment } from '../../src/utils/clipboard'

/*
 * examples/graph.example.json, SEM layer: variables F_1, x_1, x_2, x_3,
 * \epsilon_{x_1}, \epsilon_{x_3} and the constant "1"; the dataset "sample"
 * feeds x_1..x_3 (data paths). Means "1" -> x_1..x_3.
 */
function loadExampleSchema(): GraphSchema {
  return JSON.parse(readFileSync(join(__dirname, '../../examples/graph.example.json'), 'utf-8'))
}

const ORIGINAL_NODES = 8

afterEach(() => {
  resetMemoryClipboard()
  delete (navigator as any).clipboard
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanup()
})

/** A fake system clipboard (navigator.clipboard), or none. */
function installClipboard() {
  const clip = { text: '', writeText: vi.fn(async (t: string) => { clip.text = t }), readText: vi.fn(async () => clip.text) }
  Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true })
  return clip
}

async function setup(editMode: 'full' | 'layout' = 'full') {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  const onModelChange = vi.fn()
  const adapter: GraphAdapter = {
    load: vi.fn(async () => { throw new Error('Not used in this test') }),
    save: vi.fn(async () => {}),
    export: vi.fn(async () => 'mock'),
  }
  const utils = render(
    <AdapterContext.Provider value={adapter}>
      <CanvasTool initialSchema={loadExampleSchema()} onModelChange={onModelChange} viewMode="shiny" editMode={editMode} />
    </AdapterContext.Provider>
  )
  await waitFor(() => expect(onModelChange).toHaveBeenCalled())
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  const svg = utils.container.querySelector('svg.w-full') as SVGSVGElement
  // jsdom has no SVG geometry: identity screen transform (client = svg coords)
  ;(svg as any).createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y } } })
  ;(svg as any).getScreenCTM = () => ({ a: 1, inverse: () => ({}) })
  return { ...utils, svg, onModelChange }
}

type Ctx = Awaited<ReturnType<typeof setup>>

const nextTask = () => act(async () => { await Promise.resolve() })
/** Let the Cmd/Ctrl+V fallback (a timer, then an async clipboard read) finish. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)) })

/** Keys go to the page body: nothing focused, so the (whole-page) editor takes them. */
const key = (k: string, mods: Partial<KeyboardEventInit> = {}, target: Element = document.body) =>
  fireEvent.keyDown(target, { key: k, ...mods })

function lastModel(ctx: Ctx): any {
  const calls = ctx.onModelChange.mock.calls
  return Object.values(calls[calls.length - 1][0].models)[0]
}
const labels = (ctx: Ctx): string[] => lastModel(ctx).nodes.map((n: any) => n.label)
const nodeByLabel = (ctx: Ctx, label: string) => lastModel(ctx).nodes.find((n: any) => n.label === label)
const summary = () => screen.queryByTestId('selection-summary')?.textContent ?? null

/** Select a node by clicking it (its drawn text is the unicode form of the label). */
async function clickNode(ctx: Ctx, label: string, mods: Partial<MouseEventInit> = {}) {
  const text = Array.from(ctx.svg.querySelectorAll('g > text')).reverse().find((t) => t.textContent === convertToUnicode(label))
  if (!text) throw new Error(`no node ${label}`)
  const shape = text.closest('g')!.firstElementChild as Element
  fireEvent.mouseDown(shape, { button: 0, clientX: 0, clientY: 0, ...mods })
  fireEvent.mouseUp(ctx.svg, { button: 0, ...mods })
  await nextTask()
}

/** Select F_1 and x_1 (with the paths between them). */
async function selectFAndX1(ctx: Ctx) {
  await clickNode(ctx, 'F_1')
  await clickNode(ctx, 'x_1', { shiftKey: true })
  expect(summary()).toBe('2 nodes selected')
}

function firePaste(target: Element, text: string | null) {
  const ev = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clipboardData', { value: text === null ? null : { getData: () => text } })
  target.dispatchEvent(ev)
  return ev
}

describe('copy and paste shortcuts', () => {
  it('Cmd/Ctrl+C then Cmd/Ctrl+V pastes renamed copies, offset right, selected, as one undo step', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    await selectFAndX1(ctx)
    expect(key('c', { metaKey: true })).toBe(false) // prevented
    await nextTask()
    expect(clip.writeText).toHaveBeenCalledTimes(1)
    const copied = JSON.parse(clip.text)
    expect(copied.drawSEMClipboard).toBe(1)
    expect(copied.nodes.map((n: any) => n.label)).toEqual(['F_1', 'x_1'])
    // no path was selected: not F_1's variance, the loading or x_1's mean; in the
    // SEM layer (data paths cannot be selected there) x_1's data path comes along
    expect(copied.paths.map((p: any) => `${p.from}->${p.to}`)).toEqual(['sample->x_1'])
    expect(copied.external).toEqual([{ label: 'sample', type: 'dataset' }])
    expect(labels(ctx)).toHaveLength(ORIGINAL_NODES) // copy changes nothing

    key('v', { ctrlKey: true })
    await settle()
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 2))
    expect(labels(ctx).slice(-2)).toEqual(['F_1_2', 'x_1_2'])
    // F_1 (220, 100) and x_1 (100, 250) span 70..250 (60 wide each): 1.5 x 180 to the right
    expect(nodeByLabel(ctx, 'F_1_2').visual).toMatchObject({ x: 490, y: 100 })
    expect(nodeByLabel(ctx, 'x_1_2').visual).toMatchObject({ x: 370, y: 250, width: 60, height: 60 })
    const added = lastModel(ctx).paths.slice(-1)
    // the data path maps the pasted variable's name: a manifest copy
    expect(added).toEqual([{ from: 'sample', to: 'x_1_2', type: 'data', label: 'x_1_2', value: null, description: 'CSV column x_1 linked to manifest variable x_1' }])
    expect(lastModel(ctx).paths.filter((p: any) => p.type === 'data')).toHaveLength(4)
    // the pasted elements are the selection (but for the data path: off-layer in the SEM layer)
    expect(summary()).toBe('2 nodes selected')

    key('z', { metaKey: true })
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES))
    expect(lastModel(ctx).paths).toHaveLength(16)
  })

  it('repeated pastes step further and get fresh labels', async () => {
    installClipboard()
    const ctx = await setup()
    await clickNode(ctx, 'F_1')
    key('c', { ctrlKey: true })
    await nextTask()
    key('v', { ctrlKey: true })
    await settle()
    key('v', { ctrlKey: true })
    await settle()
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 2))
    // one default-width (60) node: steps of 90, in x only
    expect(nodeByLabel(ctx, 'F_1_2').visual).toMatchObject({ x: 310, y: 100 })
    expect(nodeByLabel(ctx, 'F_1_3').visual).toMatchObject({ x: 400, y: 100 })
    // copying again restarts the offset
    key('c', { ctrlKey: true }) // F_1_3 is selected
    await nextTask()
    key('v', { ctrlKey: true })
    await settle()
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 3))
    expect(nodeByLabel(ctx, 'F_1_3_2').visual).toMatchObject({ x: 490, y: 100 })
  })

  it('pastes from a paste event carrying a drawSEM fragment (e.g. copied in another window)', async () => {
    const ctx = await setup()
    const text = serializeFragment({
      drawSEMClipboard: 1,
      nodes: [{ label: 'eta', type: 'variable', visual: { x: 0, y: 0 } }, { label: 'y', type: 'variable', visual: { x: 0, y: 100 } }],
      paths: [{ from: 'eta', to: 'y', numberOfArrows: 1, freeParameter: 'L_2' }, { from: '1', to: 'y', numberOfArrows: 1, freeParameter: true }],
    })
    const ev = firePaste(document.body, text)
    expect(ev.defaultPrevented).toBe(true)
    await waitFor(() => expect(labels(ctx)).toEqual([...labels(ctx).slice(0, ORIGINAL_NODES), 'eta', 'y']))
    const added = lastModel(ctx).paths.slice(-2)
    expect(added.map((p: any) => `${p.from}->${p.to}`)).toEqual(['eta->y', '1->y'])
    expect(added[0].freeParameter).toBe('L_2') // no path of this model is named L_2 (L_2 is a label, not a name)
    expect(summary()).toBe('2 nodes, 2 paths selected')
  })

  it('ignores a paste of other or malformed text', async () => {
    const ctx = await setup()
    expect(firePaste(document.body, 'just some text').defaultPrevented).toBe(false)
    expect(firePaste(document.body, '{"drawSEMClipboard": 1, "nodes": [').defaultPrevented).toBe(false)
    await nextTask()
    expect(labels(ctx)).toHaveLength(ORIGINAL_NODES)
  })

  it('without a system clipboard (jsdom) copy and paste use the in-memory clipboard', async () => {
    const ctx = await setup()
    expect((navigator as any).clipboard).toBeUndefined()
    await clickNode(ctx, '1')
    key('c', { metaKey: true })
    await nextTask()
    key('v', { metaKey: true })
    await settle()
    await waitFor(() => expect(labels(ctx)).toContain('1b'))
    expect(nodeByLabel(ctx, '1b').type).toBe('constant')
  })

  it('copying only datasets or only paths does nothing', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    fireEvent.click(screen.getByText('Complete Graph'))
    await clickNode(ctx, 'sample')
    expect(key('c', { metaKey: true })).toBe(true) // not handled
    key('a', { metaKey: true })
    await nextTask()
    // a lone path: select it by clicking it
    fireEvent.click(ctx.container.querySelector('path[data-path-id]')!, { button: 0 })
    await nextTask()
    key('c', { metaKey: true })
    key('d', { metaKey: true })
    await nextTask()
    expect(clip.writeText).not.toHaveBeenCalled()
    expect(labels(ctx)).toHaveLength(ORIGINAL_NODES)
  })
})

describe('which paths are copied (developer decisions 2026-10-22)', () => {
  const clickPathId = async (ctx: Ctx, id: string, mods: Partial<MouseEventInit> = {}) => {
    fireEvent.click(ctx.container.querySelector(`path[data-path-id="${id}"]`)!, { button: 0, ...mods })
    await nextTask()
  }
  const copiedPaths = (clip: { text: string }) => JSON.parse(clip.text).paths.map((p: any) => `${p.from}->${p.to}`)

  it('x_3 with the selected F_1 -> x_3 path pastes as x_3_2 with F_1 -> x_3_2 (and, in the SEM layer, its data path)', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    await clickNode(ctx, 'x_3')
    await clickPathId(ctx, 'p_L_3', { shiftKey: true })
    expect(summary()).toBe('1 node, 1 path selected')
    key('c', { metaKey: true })
    await nextTask()
    expect(copiedPaths(clip)).toEqual(['F_1->x_3', 'sample->x_3'])
    key('v', { metaKey: true })
    await settle()
    await waitFor(() => expect(labels(ctx).slice(ORIGINAL_NODES)).toEqual(['x_3_2']))
    const added = lastModel(ctx).paths.slice(-2)
    expect(added.map((p: any) => `${p.from}->${p.to}`)).toEqual(['F_1->x_3_2', 'sample->x_3_2'])
    expect(added[0]).toMatchObject({ label: 'L_3', freeParameter: true, parameterType: 'loading', optimization: { bounds: [0, 5] } })
    expect(added[1]).toMatchObject({ type: 'data', label: 'x_3_2' })
    // not copied: x_3's mean (unselected) and its error term's path
    expect(lastModel(ctx).paths.filter((p: any) => p.to === 'x_3_2')).toHaveLength(2)
  })

  it('in the Complete Graph and Data layers a data path is copied only when selected', async () => {
    for (const layer of ['Complete Graph', 'Data']) {
      const clip = installClipboard()
      const ctx = await setup()
      fireEvent.click(screen.getByText(layer))
      await clickNode(ctx, 'x_1')
      key('c', { metaKey: true })
      await nextTask()
      expect(copiedPaths(clip)).toEqual([])
      await clickPathId(ctx, 'p_x_1', { shiftKey: true })
      key('c', { metaKey: true })
      await nextTask()
      expect(copiedPaths(clip)).toEqual(['sample->x_1'])
      key('d', { metaKey: true })
      await waitFor(() => expect(labels(ctx).slice(ORIGINAL_NODES)).toEqual(['x_1_2']))
      expect(lastModel(ctx).paths.slice(-1)).toMatchObject([{ from: 'sample', to: 'x_1_2', type: 'data', label: 'x_1_2' }])
      cleanup()
      resetMemoryClipboard()
    }
  })

  it('a pasted data path is linked to its variable name; the source dataset of another window is matched by label', async () => {
    const ctx = await setup()
    // copied in another window: v maps column "other" of its dataset "sample"
    const text = serializeFragment({
      drawSEMClipboard: 1,
      nodes: [{ label: 'x_2', type: 'variable', visual: { x: 0, y: 0 } }],
      paths: [{ from: 'sample', to: 'x_2', type: 'data', label: 'other' }, { from: 'nope', to: 'x_2', type: 'data', label: 'x_2' }],
      external: [{ label: 'sample', type: 'dataset' }, { label: 'nope', type: 'dataset' }],
    })
    firePaste(document.body, text)
    await waitFor(() => expect(labels(ctx).slice(ORIGINAL_NODES)).toEqual(['x_2_2']))
    // the path from the missing dataset is dropped
    expect(lastModel(ctx).paths.slice(-1)).toMatchObject([{ from: 'sample', to: 'x_2_2', type: 'data', label: 'x_2_2' }])
    await clickNode(ctx, 'x_2_2')
    const box = screen.getByLabelText('Same as variable name') as HTMLInputElement
    expect(box.checked).toBe(true)
    const field = screen.getByLabelText('Column of sample') as HTMLInputElement
    expect(field.disabled).toBe(true)
    expect(field.value).toBe('x_2_2')
    // the example's dataset is not loaded (no columns known): no warning
    expect(screen.queryByTestId('missing-column-warning')).toBeNull()
    expect(ctx.container.querySelector('[data-missing-column]')).toBeNull()
  })
})

describe('one paste per Cmd/Ctrl+V', () => {
  // Browsers order the paste event, the fallback timer and its clipboard read
  // differently (Chrome on macOS sends the paste event late), so each order
  // must paste exactly once.
  async function copyX3() {
    const clip = installClipboard()
    const ctx = await setup()
    await clickNode(ctx, 'x_3')
    key('c', { metaKey: true })
    await nextTask()
    return { clip, ctx }
  }
  const pastedLabels = (ctx: Ctx) => labels(ctx).slice(ORIGINAL_NODES)

  it('a paste event right after the keypress pastes once (the read does not)', async () => {
    const { clip, ctx } = await copyX3()
    key('v', { metaKey: true })
    expect(firePaste(document.body, clip.text).defaultPrevented).toBe(true)
    await settle()
    await waitFor(() => expect(pastedLabels(ctx)).toEqual(['x_3_2']))
    await settle()
    expect(pastedLabels(ctx)).toEqual(['x_3_2'])
  })

  it('a paste event after the clipboard read pasted does not paste again', async () => {
    const { clip, ctx } = await copyX3()
    key('v', { metaKey: true })
    await settle() // the timer and the read: pasted
    await waitFor(() => expect(pastedLabels(ctx)).toEqual(['x_3_2']))
    expect(firePaste(document.body, clip.text).defaultPrevented).toBe(true)
    await settle()
    expect(pastedLabels(ctx)).toEqual(['x_3_2'])
  })

  it('a clipboard read resolving after the paste event pasted does not paste again', async () => {
    const { clip, ctx } = await copyX3()
    let resolveRead: (t: string) => void = () => {}
    clip.readText.mockImplementation(() => new Promise<string>((r) => { resolveRead = r }))
    key('v', { metaKey: true })
    await settle() // the timer: the read starts
    expect(clip.readText).toHaveBeenCalledTimes(1)
    firePaste(document.body, clip.text)
    await waitFor(() => expect(pastedLabels(ctx)).toEqual(['x_3_2']))
    await act(async () => { resolveRead(clip.text) })
    await settle()
    expect(pastedLabels(ctx)).toEqual(['x_3_2'])
  })

  it('a paste event without a keypress (a Paste menu) pastes once, also well after an earlier keypress', async () => {
    const { clip, ctx } = await copyX3()
    firePaste(document.body, clip.text)
    await settle()
    await waitFor(() => expect(pastedLabels(ctx)).toEqual(['x_3_2']))
    key('v', { metaKey: true })
    await settle()
    await waitFor(() => expect(pastedLabels(ctx)).toEqual(['x_3_2', 'x_3_3']))
    // a later paste event is not that keypress's
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 5000)
    firePaste(document.body, clip.text)
    await settle()
    await waitFor(() => expect(pastedLabels(ctx)).toEqual(['x_3_2', 'x_3_3', 'x_3_4']))
  })
})

describe('cut and duplicate', () => {
  it('Cmd/Ctrl+X copies and deletes as one undo step; paste brings it back in place, then steps', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    await selectFAndX1(ctx)
    expect(key('x', { ctrlKey: true })).toBe(false)
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES - 2))
    expect(JSON.parse(clip.text).nodes.map((n: any) => n.label)).toEqual(['F_1', 'x_1'])
    expect(summary()).toBeNull()

    key('z', { ctrlKey: true })
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES))
    key('z', { ctrlKey: true, shiftKey: true }) // redo the cut
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES - 2))

    key('v', { ctrlKey: true })
    await settle()
    // the labels are free again, so they are kept; the first paste is in place
    await waitFor(() => expect(labels(ctx).slice(-2)).toEqual(['F_1', 'x_1']))
    expect(nodeByLabel(ctx, 'F_1').visual).toMatchObject({ x: 220, y: 100 })
    expect(nodeByLabel(ctx, 'x_1').visual).toMatchObject({ x: 100, y: 250 })
    // the next steps one width-and-a-half (1.5 x 180) right
    key('v', { ctrlKey: true })
    await settle()
    await waitFor(() => expect(labels(ctx).slice(-2)).toEqual(['F_1_2', 'x_1_2']))
    expect(nodeByLabel(ctx, 'F_1_2').visual).toMatchObject({ x: 490, y: 100 })
  })

  it('cut leaves selected datasets in the model (they are never copied) and selected', async () => {
    installClipboard()
    const ctx = await setup()
    fireEvent.click(screen.getByText('Complete Graph'))
    await clickNode(ctx, 'sample')
    await clickNode(ctx, 'x_1', { shiftKey: true })
    expect(summary()).toBe('2 nodes selected')
    const before = lastModel(ctx).paths
    expect(key('x', { metaKey: true })).toBe(false)
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES - 1))
    expect(labels(ctx)).toContain('sample')
    expect(labels(ctx)).not.toContain('x_1')
    // every path touching x_1 goes, its data path included; the other data paths stay
    expect(lastModel(ctx).paths).toEqual(before.filter((p: any) => p.from !== 'x_1' && p.to !== 'x_1'))
    expect(lastModel(ctx).paths.filter((p: any) => p.type === 'data')).toHaveLength(2)
    // sample is still selected: Delete removes it
    key('Delete')
    await waitFor(() => expect(labels(ctx)).not.toContain('sample'))
    key('z', { metaKey: true })
    await waitFor(() => expect(labels(ctx)).toContain('sample'))

    key('z', { metaKey: true }) // the cut is one undo step
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES))
    expect(lastModel(ctx).paths).toHaveLength(before.length)
  })

  it('Cmd/Ctrl+D duplicates in place without touching the clipboard, one undo step', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    await selectFAndX1(ctx)
    expect(key('d', { metaKey: true })).toBe(false) // the bookmark shortcut is prevented
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 2))
    expect(clip.writeText).not.toHaveBeenCalled()
    expect(labels(ctx).slice(-2)).toEqual(['F_1_2', 'x_1_2'])
    expect(summary()).toBe('2 nodes selected') // x_1_2's data path is off-layer
    // duplicating the duplicate steps on
    key('d', { metaKey: true })
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 4))
    // each one step (1.5 x 180) right of what it duplicates
    expect(nodeByLabel(ctx, 'F_1_2').visual).toMatchObject({ x: 490, y: 100 })
    expect(nodeByLabel(ctx, 'F_1_2_2').visual).toMatchObject({ x: 760, y: 100 })

    key('z', { metaKey: true })
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 2))
    key('z', { metaKey: true })
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES))
  })

  it("the multi-selection popup's Duplicate action", async () => {
    const ctx = await setup()
    await selectFAndX1(ctx)
    const btn = screen.getByRole('button', { name: /Duplicate/ })
    fireEvent.click(btn)
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 2))
    expect(summary()).toBe('2 nodes selected')
    key('z', { metaKey: true })
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES))
  })

  it('a free named parameter gets a new shared name in the copy', async () => {
    const ctx = await setup()
    // name the two free loadings "lam" via the popup's group parameter-name field
    await clickNode(ctx, 'F_1')
    await clickNode(ctx, 'x_2', { shiftKey: true })
    await clickNode(ctx, 'x_3', { shiftKey: true })
    for (const id of ['p_L_2', 'p_L_3']) {
      fireEvent.click(ctx.container.querySelector(`path[data-path-id="${id}"]`)!, { button: 0, shiftKey: true })
      await nextTask()
    }
    const nameField = screen.getByLabelText(/Parameter name \(all selected paths\)/i) as HTMLInputElement
    fireEvent.change(nameField, { target: { value: 'lam' } })
    await waitFor(() => expect(lastModel(ctx).paths.filter((p: any) => p.freeParameter === 'lam')).toHaveLength(2))
    nameField.blur()

    key('d', { ctrlKey: true })
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 3))
    const copies = lastModel(ctx).paths.filter((p: any) => p.from === 'F_1_2' && p.parameterType === 'loading')
    expect(copies.map((p: any) => p.freeParameter)).toEqual(['lam_2', 'lam_2'])
  })
})

describe('page text selections', () => {
  /** Select the text of a paragraph outside the editor. */
  function selectPageText(): HTMLElement {
    const p = document.createElement('p')
    p.textContent = 'some page text'
    document.body.appendChild(p)
    const range = document.createRange()
    range.selectNodeContents(p)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    return p
  }
  const hasTextSelection = () => window.getSelection()!.toString() !== ''

  it('a real text selection is left to the browser to copy', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    await clickNode(ctx, 'F_1')
    const p = selectPageText()
    expect(key('c', { metaKey: true })).toBe(true) // not handled
    expect(key('x', { metaKey: true })).toBe(true)
    await nextTask()
    expect(clip.writeText).not.toHaveBeenCalled()
    expect(labels(ctx)).toHaveLength(ORIGINAL_NODES)
    p.remove()
  })

  it('a press on a node, a path or the background clears a stale text selection', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    const p = selectPageText()
    await clickNode(ctx, 'F_1')
    expect(hasTextSelection()).toBe(false)
    expect(key('c', { metaKey: true })).toBe(false)
    await nextTask()
    expect(clip.writeText).toHaveBeenCalledTimes(1)

    selectPageText()
    fireEvent.mouseDown(ctx.container.querySelector('path[data-path-id]')!, { button: 0 })
    expect(hasTextSelection()).toBe(false)

    selectPageText()
    fireEvent.mouseDown(ctx.svg, { button: 0 })
    fireEvent.mouseUp(ctx.svg, { button: 0 })
    expect(hasTextSelection()).toBe(false)
    p.remove()
  })

  it('a press in text UI (the popup, a text field) keeps the text selection', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'F_1')
    const p = selectPageText()
    const input = ctx.container.querySelector('input[type="text"], input:not([type])') as HTMLElement
    fireEvent.mouseDown(input, { button: 0 })
    fireEvent.mouseDown(p, { button: 0 })
    expect(hasTextSelection()).toBe(true)
    p.remove()
  })
})

describe('typing and layout-only mode', () => {
  it('does nothing while typing in a text field', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    await selectFAndX1(ctx)
    const input = ctx.container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement
    expect(input).toBeTruthy()
    input.focus()
    for (const k of ['c', 'x', 'd', 'v']) key(k, { metaKey: true }, input)
    expect(firePaste(input, serializeFragment({ drawSEMClipboard: 1, nodes: [{ label: 'q', type: 'variable' }], paths: [] })).defaultPrevented).toBe(false)
    await settle()
    expect(clip.writeText).not.toHaveBeenCalled()
    expect(labels(ctx)).toHaveLength(ORIGINAL_NODES)
  })

  it('layout-only (the addin): copy works; paste, cut and duplicate do nothing', async () => {
    const clip = installClipboard()
    const ctx = await setup('layout')
    await selectFAndX1(ctx)
    key('c', { metaKey: true })
    await nextTask()
    expect(clip.writeText).toHaveBeenCalledTimes(1)

    expect(key('x', { metaKey: true })).toBe(true) // not handled
    key('d', { metaKey: true })
    key('v', { metaKey: true })
    expect(firePaste(document.body, clip.text).defaultPrevented).toBe(false)
    await settle()
    expect(labels(ctx)).toHaveLength(ORIGINAL_NODES)
    expect(clip.writeText).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Duplicate/ })).toBeNull()
  })
})
