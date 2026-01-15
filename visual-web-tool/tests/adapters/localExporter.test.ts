/**
 * Unit tests for standalone local exporter adapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLocalExporter, ExporterError } from '../../src/adapters/standalone/localExporter'
import { GraphSchema } from '../../src/core/types'

// Valid test schema
const validSchema: GraphSchema = {
  schemaVersion: 1,
  models: {
    model1: {
      label: 'Test Model',
      nodes: [
        { label: 'X', type: 'variable' },
        { label: 'Y', type: 'variable' },
      ],
      paths: [{ fromLabel: 'X', toLabel: 'Y', numberOfArrows: 1 }],
    },
  },
}

describe('LocalExporter', () => {
  let exporter: ReturnType<typeof createLocalExporter>
  let fetchMock: any

  beforeEach(() => {
    exporter = createLocalExporter()
    // Mock fetch on window
    fetchMock = vi.fn()
    window.fetch = fetchMock as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('load()', () => {
    it('should load from HTTPS URL', async () => {
      const mockResponse = new Response(JSON.stringify(validSchema))
      fetchMock.mockResolvedValueOnce(mockResponse)

      const result = await exporter.load('https://example.com/graph.json')

      expect(result).toEqual(validSchema)
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/graph.json')
    })

    it('should load from HTTP URL', async () => {
      const mockResponse = new Response(JSON.stringify(validSchema))
      fetchMock.mockResolvedValueOnce(mockResponse)

      const result = await exporter.load('http://localhost:3000/graph.json')
      expect(result).toEqual(validSchema)
    })

    it('should load from /examples path', async () => {
      const mockResponse = new Response(JSON.stringify(validSchema))
      fetchMock.mockResolvedValueOnce(mockResponse)

      const result = await exporter.load('/examples/test.json')
      expect(result).toEqual(validSchema)
      expect(fetchMock).toHaveBeenCalledWith('/examples/test.json')
    })

    it('should parse JSON string directly', async () => {
      const jsonString = JSON.stringify(validSchema)
      const result = await exporter.load(jsonString)

      expect(result).toEqual(validSchema)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should throw ExporterError on fetch failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

      await expect(exporter.load('https://example.com/missing.json')).rejects.toThrow(ExporterError)
    })

    it('should throw ExporterError on invalid JSON', async () => {
      await expect(exporter.load('{ invalid json')).rejects.toThrow(ExporterError)
    })

    it('should throw ExporterError on invalid schema', async () => {
      const invalidSchema = { foo: 'bar' }
      await expect(exporter.load(JSON.stringify(invalidSchema))).rejects.toThrow(ExporterError)
    })

    it('should include error code in ExporterError', async () => {
      try {
        await exporter.load('invalid json {')
      } catch (error) {
        expect(error).toBeInstanceOf(ExporterError)
        expect((error as ExporterError).code).toBe('PARSE_ERROR')
      }
    })
  })

  describe('save()', () => {
    it('should trigger browser download with valid schema', async () => {
      // Mock URL.createObjectURL
      const blobUrl = 'blob:http://localhost/test-uuid'
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => blobUrl),
        revokeObjectURL: vi.fn(),
      })

      const clickSpy = vi.fn()
      const linkElement = {
        click: clickSpy,
        href: '',
        download: '',
        tagName: 'A',
      }
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(linkElement as any)
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => linkElement as any)
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => linkElement as any)

      await exporter.save(validSchema)

      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(appendChildSpy).toHaveBeenCalledWith(linkElement)
      expect(clickSpy).toHaveBeenCalled()
      expect(removeChildSpy).toHaveBeenCalledWith(linkElement)

      createElementSpy.mockRestore()
      appendChildSpy.mockRestore()
      removeChildSpy.mockRestore()
      vi.unstubAllGlobals()
    })

    it('should create download with timestamp filename', async () => {
      // Mock URL.createObjectURL
      const blobUrl = 'blob:http://localhost/test-uuid'
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => blobUrl),
        revokeObjectURL: vi.fn(),
      })

      const clickSpy = vi.fn()
      const linkElement = {
        click: clickSpy,
        href: '',
        download: '',
        tagName: 'A',
      }
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(linkElement as any)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => linkElement as any)
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => linkElement as any)

      await exporter.save(validSchema)

      expect(linkElement.download).toMatch(/^graph-\d{4}-\d{2}-\d{2}\.json$/)

      createElementSpy.mockRestore()
      vi.unstubAllGlobals()
    })

    it('should throw ExporterError on invalid schema', async () => {
      const invalidSchema = { foo: 'bar' } as any
      await expect(exporter.save(invalidSchema)).rejects.toThrow(ExporterError)
    })

    it('should include error code INVALID_SCHEMA', async () => {
      try {
        await exporter.save({ models: {} } as any)
      } catch (error) {
        expect((error as ExporterError).code).toBe('INVALID_SCHEMA')
      }
    })
  })

  describe('export()', () => {
    it('should POST to /api/export with correct payload', async () => {
      const mockCode = '# R code here'
      const mockResponse = new Response(mockCode, { status: 200 })
      fetchMock.mockResolvedValueOnce(mockResponse)

      const result = await exporter.export(validSchema, 'openmx')

      expect(fetchMock).toHaveBeenCalledWith('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"schema"'),
      })
      expect(result).toBe(mockCode)
    })

    it('should support all three export formats', async () => {
      fetchMock.mockResolvedValueOnce(new Response('# code', { status: 200 }))
      fetchMock.mockResolvedValueOnce(new Response('# code', { status: 200 }))
      fetchMock.mockResolvedValueOnce(new Response('# code', { status: 200 }))

      await exporter.export(validSchema, 'openmx')
      await exporter.export(validSchema, 'lavaan')
      await exporter.export(validSchema, 'blavaan')

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('should include export options in request', async () => {
      const mockResponse = new Response('# code', { status: 200 })
      fetchMock.mockResolvedValueOnce(mockResponse)

      await exporter.export(validSchema, 'openmx', { modelId: 'model1', includeComments: true })

      const callArgs = fetchMock.mock.calls[0]
      const body = JSON.parse(callArgs[1].body as string)

      expect(body.options.modelId).toBe('model1')
      expect(body.options.includeComments).toBe(true)
    })

    it('should throw ExporterError on server error', async () => {
      const mockResponse = new Response('Export failed', { status: 500, statusText: 'Internal Server Error' })
      fetchMock.mockResolvedValueOnce(mockResponse)

      await expect(exporter.export(validSchema, 'openmx')).rejects.toThrow(ExporterError)
    })

    it('should throw ExporterError with EXPORT_SERVER_ERROR code on 5xx', async () => {
      const mockResponse = new Response('Error', { status: 500, statusText: 'Server Error' })
      fetchMock.mockResolvedValueOnce(mockResponse)

      try {
        await exporter.export(validSchema, 'openmx')
      } catch (error) {
        expect((error as ExporterError).code).toBe('EXPORT_SERVER_ERROR')
      }
    })

    it('should throw ExporterError on invalid schema', async () => {
      const invalidSchema = { foo: 'bar' } as any
      await expect(exporter.export(invalidSchema, 'openmx')).rejects.toThrow(ExporterError)
    })

    it('should throw ExporterError on invalid format', async () => {
      await expect(exporter.export(validSchema, 'invalid-format' as any)).rejects.toThrow(ExporterError)
    })

    it('should throw ExporterError with INVALID_FORMAT code', async () => {
      try {
        await exporter.export(validSchema, 'invalid' as any)
      } catch (error) {
        expect((error as ExporterError).code).toBe('INVALID_FORMAT')
      }
    })

    it('should throw ExporterError on empty response', async () => {
      const mockResponse = new Response('', { status: 200 })
      fetchMock.mockResolvedValueOnce(mockResponse)

      await expect(exporter.export(validSchema, 'openmx')).rejects.toThrow(ExporterError)
    })
  })

  describe('error handling', () => {
    it('ExporterError should have code and details properties', async () => {
      try {
        await exporter.load('invalid')
      } catch (error) {
        expect(error).toBeInstanceOf(ExporterError)
        expect((error as ExporterError).code).toBeDefined()
      }
    })

    it('should provide error details for debugging', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

      try {
        await exporter.load('https://example.com/missing.json')
      } catch (error) {
        expect((error as ExporterError).details).toBeDefined()
      }
    })
  })
})
