/**
 * Component-level round trip: every schema CanvasTool reports through
 * onModelChange after a load with no user edit must equal the loaded document
 * (including the second echo caused by the embedded-dataset column effect).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'
import { deepDiff } from '../utils/test-helpers'

const read = (rel: string): GraphSchema => JSON.parse(readFileSync(join(__dirname, rel), 'utf-8'))
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanup()
})

function stubFetch404() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
}

/** Every echo, as JSON (what Shiny would receive). */
const echoes = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => JSON.parse(JSON.stringify(c[0])))

describe('CanvasTool round trip (no edits)', () => {
  it.each([
    ['kitchen-sink (fit results, 2 models, embedded data)', '../fixtures/models/kitchen-sink.json', 2],
    ['graph.example.json', '../../examples/graph.example.json', 1],
    ['cfa-model', '../fixtures/models/cfa-model.json', 1],
  ])('%s: every onModelChange call equals the input', async (_name, rel, minCalls) => {
    stubFetch404()
    const input = read(rel)
    const before = clone(input)
    const onModelChange = vi.fn()
    render(
      <AdapterContext.Provider value={createAdapterStub()}>
        <CanvasTool initialSchema={input} onModelChange={onModelChange} viewMode="shiny" />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(onModelChange.mock.calls.length).toBeGreaterThanOrEqual(minCalls))
    // let any remaining effects settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    for (const e of echoes(onModelChange)) {
      expect(deepDiff(e, before)).toEqual([])
      expect(e).toEqual(before)
    }
    // the caller's object is never mutated
    expect(input).toEqual(before)
  })

  it('layout-only mode echoes the input unchanged too', async () => {
    stubFetch404()
    const input = read('../fixtures/models/kitchen-sink.json')
    const before = clone(input)
    const onModelChange = vi.fn()
    render(
      <AdapterContext.Provider value={createAdapterStub()}>
        <CanvasTool initialSchema={input} onModelChange={onModelChange} viewMode="shiny" editMode="layout" />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(onModelChange.mock.calls.length).toBeGreaterThanOrEqual(2))
    for (const e of echoes(onModelChange)) expect(e).toEqual(before)
  })

  it('a model pushed from R (onModelReceived, fitted) is echoed back unchanged', async () => {
    stubFetch404()
    let push: ((s: GraphSchema) => void) | null = null
    const adapter = createAdapterStub({
      onModelReceived: (cb) => {
        push = cb
      },
    })
    const onModelChange = vi.fn()
    // initial empty-but-valid model, then R pushes the fitted one
    const initial = read('../fixtures/models/cfa-model.json')
    render(
      <AdapterContext.Provider value={adapter}>
        <CanvasTool initialSchema={initial} onModelChange={onModelChange} viewMode="shiny" />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(push).not.toBeNull())
    await waitFor(() => expect(onModelChange).toHaveBeenCalled())
    const fitted = read('../fixtures/models/kitchen-sink.json')
    const before = clone(fitted)
    const callsBefore = onModelChange.mock.calls.length
    await act(async () => {
      push!(fitted)
    })
    await waitFor(() => expect(onModelChange.mock.calls.length).toBeGreaterThan(callsBefore + 1))
    const after = echoes(onModelChange).slice(callsBefore)
    for (const e of after) expect(e).toEqual(before)
    expect(after[after.length - 1].models.fitted.provenance.fitResults[0].converged).toBe(true)
  })

  it('a positionless model is auto-laid-out on load: nodes gain visual.x/y and nothing else', async () => {
    stubFetch404()
    const input = read('../fixtures/models/layout/cfa_with_errors.json')
    const before = clone(input)
    const onModelChange = vi.fn()
    render(
      <AdapterContext.Provider value={createAdapterStub()}>
        <CanvasTool initialSchema={input} onModelChange={onModelChange} viewMode="shiny" />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(onModelChange).toHaveBeenCalled())
    const out = echoes(onModelChange).at(-1)
    const diff = deepDiff(out, before)
    expect(diff.length).toBeGreaterThan(0)
    // only whole new `visual` objects on nodes, each holding just x and y
    for (const d of diff) expect(d).toMatch(/^models\.[^.]+\.nodes\[\d+\]\.visual$/)
    const modelKey = Object.keys(out.models)[0]
    for (const n of out.models[modelKey].nodes) {
      if (n.visual) expect(Object.keys(n.visual).sort()).toEqual(['x', 'y'])
    }
  })
})
