/**
 * Copy, cut, paste and duplicate of the selection: the keyboard shortcuts, the
 * popup's Duplicate action, paste events, one undo step each, the pasted
 * elements becoming the selection, no-op while typing, and layout-only mode.
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
  it('Cmd/Ctrl+C then Cmd/Ctrl+V pastes renamed copies, offset, selected, as one undo step', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    await selectFAndX1(ctx)
    expect(key('c', { metaKey: true })).toBe(false) // prevented
    await nextTask()
    expect(clip.writeText).toHaveBeenCalledTimes(1)
    const copied = JSON.parse(clip.text)
    expect(copied.drawSEMClipboard).toBe(1)
    expect(copied.nodes.map((n: any) => n.label)).toEqual(['F_1', 'x_1'])
    // F_1's variance, the loading, x_1's mean from "1"; not the data path from the dataset
    expect(copied.paths.map((p: any) => `${p.from}->${p.to}`)).toEqual(['F_1->F_1', 'F_1->x_1', '1->x_1'])
    expect(labels(ctx)).toHaveLength(ORIGINAL_NODES) // copy changes nothing

    key('v', { ctrlKey: true })
    await settle()
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 2))
    expect(labels(ctx).slice(-2)).toEqual(['F_1_2', 'x_1_2'])
    expect(nodeByLabel(ctx, 'F_1_2').visual).toMatchObject({ x: 250, y: 130 })
    expect(nodeByLabel(ctx, 'x_1_2').visual).toMatchObject({ x: 130, y: 280, width: 60, height: 60 })
    const added = lastModel(ctx).paths.slice(-3)
    expect(added.map((p: any) => `${p.from}->${p.to}`)).toEqual(['F_1_2->F_1_2', 'F_1_2->x_1_2', '1->x_1_2'])
    expect(added[0].label).toBe('V_{F_1_2}') // a default variance label follows its node
    // the copy of a manifest variable has no data connection
    expect(lastModel(ctx).paths.filter((p: any) => p.type === 'data')).toHaveLength(3)
    // the pasted elements are the selection
    expect(summary()).toBe('2 nodes, 3 paths selected')

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
    expect(nodeByLabel(ctx, 'F_1_2').visual).toMatchObject({ x: 250, y: 130 })
    expect(nodeByLabel(ctx, 'F_1_3').visual).toMatchObject({ x: 280, y: 160 })
    // copying again restarts the offset
    key('c', { ctrlKey: true }) // F_1_3 is selected
    await nextTask()
    key('v', { ctrlKey: true })
    await settle()
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 3))
    expect(nodeByLabel(ctx, 'F_1_3_2').visual).toMatchObject({ x: 310, y: 190 })
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

describe('cut and duplicate', () => {
  it('Cmd/Ctrl+X copies and deletes as one undo step; paste brings it back', async () => {
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
    // the labels are free again, so they are kept
    await waitFor(() => expect(labels(ctx).slice(-2)).toEqual(['F_1', 'x_1']))
  })

  it('Cmd/Ctrl+D duplicates in place without touching the clipboard, one undo step', async () => {
    const clip = installClipboard()
    const ctx = await setup()
    await selectFAndX1(ctx)
    expect(key('d', { metaKey: true })).toBe(false) // the bookmark shortcut is prevented
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 2))
    expect(clip.writeText).not.toHaveBeenCalled()
    expect(labels(ctx).slice(-2)).toEqual(['F_1_2', 'x_1_2'])
    expect(summary()).toBe('2 nodes, 3 paths selected')
    // duplicating the duplicate steps on
    key('d', { metaKey: true })
    await waitFor(() => expect(labels(ctx)).toHaveLength(ORIGINAL_NODES + 4))
    expect(nodeByLabel(ctx, 'F_1_2_2').visual).toMatchObject({ x: 280, y: 160 })

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
    expect(summary()).toBe('2 nodes, 3 paths selected')
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
