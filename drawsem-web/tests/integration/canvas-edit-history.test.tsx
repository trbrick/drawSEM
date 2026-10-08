/**
 * Undo history across R: models pushed from R that update the document (Load
 * Data, Fit) keep the history, ones that replace it (loading a model) start a
 * new one; undo never reverts fit results; the history goes to R on Done and
 * is restored when R reopens the editor with it.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema, ModelUpdateKind } from '../../src/core/types'
import { parseEditHistory } from '../../src/utils/editHistory'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (window as any).drawSEMConfig
  cleanup()
})

function fixture(opts: { ax?: number; fitted?: boolean; dataset?: boolean } = {}): GraphSchema {
  const nodes: any[] = [
    { label: 'F', type: 'variable', visual: { x: opts.ax ?? 0, y: 0 } },
    { label: 'G', type: 'variable', visual: { x: 200, y: 0 } },
  ]
  if (opts.dataset) nodes.push({ label: 'd', type: 'dataset', visual: { x: -200, y: 0 } })
  const model: any = {
    label: 'Test',
    nodes,
    paths: [
      { label: 'b', from: 'F', to: 'G', numberOfArrows: 1, freeParameter: 'b', value: opts.fitted ? 0.42 : 1 },
      { from: 'F', to: 'F', numberOfArrows: 2, freeParameter: true },
      { from: 'G', to: 'G', numberOfArrows: 2, freeParameter: true },
    ],
  }
  if (opts.fitted) {
    model.provenance = { fitResults: [{ backend: 'OpenMx', timestamp: '2026-01-01T00:00:00Z', structureHash: 'h1', converged: true, fitValue: 1 }] }
  }
  return { schemaVersion: 0, models: { m: model } } as unknown as GraphSchema
}

type Receive = (s: GraphSchema, u?: { kind?: ModelUpdateKind }) => void

async function renderShiny(options: { initialSchema?: GraphSchema } = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  let receive: Receive | null = null
  const done = vi.fn()
  const adapter: GraphAdapter = {
    load: vi.fn(async () => { throw new Error('unused') }),
    save: vi.fn(async () => {}),
    export: vi.fn(async () => 'mock'),
    onModelReceived: (cb) => { receive = cb },
    done,
  }
  const onModelChange = vi.fn()
  const utils = render(
    <AdapterContext.Provider value={adapter}>
      <CanvasTool initialSchema={options.initialSchema} onModelChange={onModelChange} viewMode="shiny" />
    </AdapterContext.Provider>
  )
  await waitFor(() => expect(onModelChange).toHaveBeenCalled())
  // jsdom has no SVG geometry: identity screen transform (client = svg coords)
  const svg = utils.container.querySelector('svg.w-full') as any
  svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y } } })
  svg.getScreenCTM = () => ({ a: 1, inverse: () => ({}) })
  const root = utils.container.querySelector('.canvas-container') as HTMLElement
  return { ...utils, root, onModelChange, done, push: (s: GraphSchema, kind?: ModelUpdateKind) => act(() => receive!(s, kind ? { kind } : undefined)) }
}

function lastModel(onModelChange: ReturnType<typeof vi.fn>): any {
  const last = onModelChange.mock.calls[onModelChange.mock.calls.length - 1][0]
  return Object.values(last.models)[0]
}
const xOf = (m: any, label: string) => m.nodes.find((n: any) => n.label === label)?.visual?.x

const nextTask = () => act(async () => { await Promise.resolve() })
const undo = (root: Element) => fireEvent.keyDown(root, { key: 'z', ctrlKey: true })
const redo = (root: Element) => fireEvent.keyDown(root, { key: 'z', ctrlKey: true, shiftKey: true })

/** Select node F and nudge it right with the arrow key: one undo step. */
async function nudgeF(container: HTMLElement, root: HTMLElement) {
  const g = Array.from(container.querySelectorAll('svg.w-full g'))
    .find((el) => el.querySelector(':scope > text')?.textContent === 'F' && el.querySelector(':scope > circle'))!
  fireEvent.mouseDown(g.querySelector(':scope > circle')!, { button: 0 })
  fireEvent.mouseUp(container.querySelector('svg.w-full')!)
  await nextTask()
  fireEvent.keyDown(root, { key: 'ArrowRight' })
  await nextTask()
}

describe('models pushed from R', () => {
  it("a fit ('fit') keeps the history and undo keeps the fit results", async () => {
    const { container, root, onModelChange, push } = await renderShiny({ initialSchema: fixture() })
    await nudgeF(container, root)
    const moved = xOf(lastModel(onModelChange), 'F')
    expect(moved).toBeGreaterThan(0)

    // R fits the model as it now is
    push(fixture({ ax: moved, fitted: true }), 'fit')
    await waitFor(() => expect(lastModel(onModelChange).provenance).toBeDefined())

    undo(root)
    await waitFor(() => expect(xOf(lastModel(onModelChange), 'F')).toBe(0))
    // the fit is carried forward (R then reports it stale from its structureHash)
    expect(lastModel(onModelChange).provenance.fitResults).toHaveLength(1)

    redo(root)
    await waitFor(() => expect(xOf(lastModel(onModelChange), 'F')).toBe(moved))
    expect(lastModel(onModelChange).provenance.fitResults).toHaveLength(1)
    expect(lastModel(onModelChange).paths[0].value).toBe(0.42)
  })

  it("attaching data ('data') is an undo step", async () => {
    const { container, root, onModelChange, push } = await renderShiny({ initialSchema: fixture() })
    await nudgeF(container, root)
    const moved = xOf(lastModel(onModelChange), 'F')
    push(fixture({ ax: moved, dataset: true }), 'data')
    await waitFor(() => expect(lastModel(onModelChange).nodes).toHaveLength(3))

    undo(root)
    await waitFor(() => expect(lastModel(onModelChange).nodes).toHaveLength(2))
    expect(xOf(lastModel(onModelChange), 'F')).toBe(moved)
    undo(root)
    await waitFor(() => expect(xOf(lastModel(onModelChange), 'F')).toBe(0))
    redo(root)
    redo(root)
    await waitFor(() => expect(lastModel(onModelChange).nodes).toHaveLength(3))
  })

  it.each([['load' as const], [undefined]])('loading a model (kind %s) starts a new history', async (kind) => {
    const { container, root, onModelChange, push } = await renderShiny({ initialSchema: fixture() })
    await nudgeF(container, root)
    push(fixture({ ax: 77 }), kind)
    await waitFor(() => expect(xOf(lastModel(onModelChange), 'F')).toBe(77))
    const calls = onModelChange.mock.calls.length
    undo(root)
    await nextTask()
    expect(onModelChange.mock.calls.length).toBe(calls)
  })
})

describe('history on Done and reopening', () => {
  it('Done sends no history when there is nothing to undo, and the serialized history after an edit', async () => {
    const { container, root, done } = await renderShiny({ initialSchema: fixture() })
    fireEvent.click(screen.getByText('Done'))
    expect(done).toHaveBeenLastCalledWith()

    await nudgeF(container, root)
    fireEvent.click(screen.getByText('Done'))
    const extras = done.mock.calls[done.mock.calls.length - 1][0]
    const h = parseEditHistory(extras.editHistory)!
    expect(h.past).toHaveLength(1)
    expect(h.past[0].models.m.nodes[0].visual.x).toBe(0)
    expect(h.present.models.m.nodes[0].visual.x).toBeGreaterThan(0)
  })

  it('reopening with the history from Done restores undo and redo', async () => {
    // First session: two moves, one undone, then Done
    const first = await renderShiny({ initialSchema: fixture() })
    await nudgeF(first.container, first.root)
    await nudgeF(first.container, first.root)
    await nextTask()
    undo(first.root)
    await nextTask()
    const shown = lastModel(first.onModelChange)
    fireEvent.click(screen.getByText('Done'))
    const editHistory = first.done.mock.calls[0][0].editHistory as string
    cleanup()

    // R reopens the editor on the returned model with its @metadata$editHistory
    const reopened = JSON.parse(JSON.stringify(fixture({ ax: xOf(shown, 'F') })))
    ;(window as any).drawSEMConfig = { initialModel: reopened, editHistory }
    const second = await renderShiny()
    expect(xOf(lastModel(second.onModelChange), 'F')).toBe(xOf(shown, 'F'))

    redo(second.root)
    await waitFor(() => expect(xOf(lastModel(second.onModelChange), 'F')).toBeGreaterThan(xOf(shown, 'F')))
    undo(second.root)
    undo(second.root)
    await waitFor(() => expect(xOf(lastModel(second.onModelChange), 'F')).toBe(0))
  })
})
