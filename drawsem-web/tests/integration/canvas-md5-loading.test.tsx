import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema } from '../../src/core/types'

function loadExampleSchema(): GraphSchema {
  const schemaPath = join(__dirname, '../../examples/graph.example.json')
  return JSON.parse(readFileSync(schemaPath, 'utf-8'))
}

function getSampleDatasetNode(schema: GraphSchema): any {
  const model = schema.models[Object.keys(schema.models)[0]]
  return model.nodes.find((n: any) => n.type === 'dataset')
}

function createAdapterStub(): GraphAdapter {
  return {
    load: vi.fn(async () => {
      throw new Error('Not used in this test')
    }),
    save: vi.fn(async () => {}),
    export: vi.fn(async () => 'mock')
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('CanvasTool CSV MD5 loading', () => {
  it('shows dataset loading error when fetched CSV checksum does not match schema md5', async () => {
    const schema = loadExampleSchema()
    const csvWithMismatchedChecksum = [
      'x_1,x_2,x_3',
      '9,9,9',
      '8,8,8'
    ].join('\n')

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('examples/sample.csv')) {
        return {
          ok: true,
          status: 200,
          text: async () => csvWithMismatchedChecksum,
        } as Response
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AdapterContext.Provider value={createAdapterStub()}>
        <CanvasTool initialSchema={schema} />
      </AdapterContext.Provider>
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('examples/sample.csv'))
    })

    await waitFor(() => {
      expect(screen.getByText('Dataset loading errors:')).toBeTruthy()
      expect(screen.getByText(/File integrity check failed for sample\.csv\./)).toBeTruthy()
    })
  })

  it('does not show dataset loading error when fetched CSV checksum matches schema md5', async () => {
    const schema = loadExampleSchema()
    const validCsv = readFileSync(join(__dirname, '../../examples/sample.csv'), 'utf-8')

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('examples/sample.csv')) {
        return {
          ok: true,
          status: 200,
          text: async () => validCsv,
        } as Response
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AdapterContext.Provider value={createAdapterStub()}>
        <CanvasTool initialSchema={schema} />
      </AdapterContext.Provider>
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('examples/sample.csv'))
    })

    await waitFor(() => {
      expect(screen.queryByText('Dataset loading errors:')).toBeNull()
    })
  })

  it('shows dataset loading error when CSV fetch returns HTTP error', async () => {
    const schema = loadExampleSchema()

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('examples/sample.csv')) {
        return {
          ok: false,
          status: 404,
          text: async () => 'Not found',
        } as Response
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AdapterContext.Provider value={createAdapterStub()}>
        <CanvasTool initialSchema={schema} />
      </AdapterContext.Provider>
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('examples/sample.csv'))
    })

    await waitFor(() => {
      expect(screen.getByText('Dataset loading errors:')).toBeTruthy()
      expect(screen.getByText('File not found: sample.csv (HTTP 404)')).toBeTruthy()
    })
  })

  it('bypasses md5 verification when schema has no md5 for dataset source', async () => {
    const schema = loadExampleSchema()
    const datasetNode = getSampleDatasetNode(schema)
    delete datasetNode.datasetSource.md5

    const csvWithoutMatchingMd5 = [
      'x_1,x_2,x_3',
      '9,9,9',
      '8,8,8'
    ].join('\n')

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('examples/sample.csv')) {
        return {
          ok: true,
          status: 200,
          text: async () => csvWithoutMatchingMd5,
        } as Response
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AdapterContext.Provider value={createAdapterStub()}>
        <CanvasTool initialSchema={schema} />
      </AdapterContext.Provider>
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('examples/sample.csv'))
    })

    await waitFor(() => {
      expect(screen.queryByText('Dataset loading errors:')).toBeNull()
    })
  })

  it('shows dataset loading error when CSV parse fails', async () => {
    const schema = loadExampleSchema()
    const datasetNode = getSampleDatasetNode(schema)
    delete datasetNode.datasetSource.md5

    const malformedCsv = 'x_1,x_2,x_3\n"1,2,3\n4,5,6'

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('examples/sample.csv')) {
        return {
          ok: true,
          status: 200,
          text: async () => malformedCsv,
        } as Response
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AdapterContext.Provider value={createAdapterStub()}>
        <CanvasTool initialSchema={schema} />
      </AdapterContext.Provider>
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('examples/sample.csv'))
    })

    await waitFor(() => {
      expect(screen.getByText('Dataset loading errors:')).toBeTruthy()
      expect(screen.getByText(/CSV parse error in sample\.csv:/)).toBeTruthy()
    })
  })

  it('shows dataset loading error when expected columns are missing in CSV', async () => {
    const schema = loadExampleSchema()
    const datasetNode = getSampleDatasetNode(schema)
    delete datasetNode.datasetSource.md5

    const missingColumnsCsv = [
      'x_1,x_2',
      '1,2',
      '3,4'
    ].join('\n')

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('examples/sample.csv')) {
        return {
          ok: true,
          status: 200,
          text: async () => missingColumnsCsv,
        } as Response
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AdapterContext.Provider value={createAdapterStub()}>
        <CanvasTool initialSchema={schema} />
      </AdapterContext.Provider>
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('examples/sample.csv'))
    })

    await waitFor(() => {
      expect(screen.getByText('Dataset loading errors:')).toBeTruthy()
      expect(screen.getByText('Dataset sample.csv is missing expected columns: x_3')).toBeTruthy()
    })
  })
})
