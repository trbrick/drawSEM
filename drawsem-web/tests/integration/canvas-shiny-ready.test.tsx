/**
 * The editor and R in Shiny: R answers each signalReady() with dataset
 * summaries. Summaries that change nothing must not change the models, or the
 * two keep sending each other messages (signalReady runs on models changes).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'

afterEach(() => cleanup())

const schema: GraphSchema = {
  schemaVersion: 0,
  models: { m: { nodes: [
    { label: 'x', type: 'variable', visual: { x: 0, y: 0 } },
    { label: 'd', type: 'dataset', visual: { x: 100, y: 0 } },
  ], paths: [{ from: 'd', to: 'x', type: 'data' }] } },
}

describe('Shiny ready signal', () => {
  it('summaries that change nothing do not start a message loop', async () => {
    let summaries: ((s: Record<string, never>) => void) | undefined
    const signalReady = vi.fn(() => { setTimeout(() => summaries?.({}), 0) })
    const adapter = {
      load: vi.fn(async () => { throw new Error('unused') }),
      save: vi.fn(async () => {}),
      export: vi.fn(async () => 'mock'),
      signalReady,
      onDatasetSummaries: (cb: (s: Record<string, never>) => void) => { summaries = cb },
    } as unknown as GraphAdapter
    const onModelChange = vi.fn()
    render(
      <AdapterContext.Provider value={adapter}>
        <CanvasTool initialSchema={schema} onModelChange={onModelChange} viewMode="shiny" />
      </AdapterContext.Provider>
    )
    await waitFor(() => expect(signalReady).toHaveBeenCalled())
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })
    // one signal at load; the unchanged summaries R answers with must not send another
    expect(signalReady).toHaveBeenCalledTimes(1)
  })
})
