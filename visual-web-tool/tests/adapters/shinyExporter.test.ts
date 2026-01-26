/**
 * Unit tests for Shiny exporter adapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createShinyAdapter, createConditionalShinyAdapter, isShinyContext, ShinyExporterError } from '../../src/adapters/shiny/shinyExporter'
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

// Mock Shiny object
const mockShiny = {
  addCustomMessageHandler: vi.fn(),
  setInputValue: vi.fn(),
}

describe('ShinyExporter', () => {
  beforeEach(() => {
    // Setup Shiny in window
    window.Shiny = mockShiny as any
    // Clean up any lingering graphToolConfig
    delete (window as any).graphToolConfig
    // Reset mock implementations (not just call counts)
    mockShiny.addCustomMessageHandler.mockReset()
    mockShiny.setInputValue.mockReset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete (window as any).Shiny
    delete (window as any).graphToolConfig
  })

  describe('isShinyContext()', () => {
    it('should return true when Shiny is available', () => {
      expect(isShinyContext()).toBe(true)
    })

    it('should return false when Shiny is not available', () => {
      delete (window as any).Shiny
      expect(isShinyContext()).toBe(false)
    })

    it('should return false when Shiny methods are missing', () => {
      window.Shiny = {} as any
      expect(isShinyContext()).toBe(false)
    })
  })

  describe('createShinyAdapter()', () => {
    it('should throw ShinyExporterError when Shiny is not available', () => {
      delete (window as any).Shiny
      expect(() => createShinyAdapter()).toThrow(ShinyExporterError)
    })

    it('should return exporter when Shiny is available', () => {
      const exporter = createShinyAdapter()
      expect(exporter).toBeDefined()
      expect(exporter.load).toBeDefined()
      expect(exporter.save).toBeDefined()
      expect(exporter.export).toBeDefined()
    })
  })

  describe('load()', () => {
    beforeEach(() => {
      // Ensure graphToolConfig is not set for load tests
      ;(window as any).graphToolConfig = undefined
    })

    it('should return initialModel from window.graphToolConfig if available', async () => {
      window.graphToolConfig = { initialModel: validSchema }
      const exporter = createShinyAdapter()

      const result = await exporter.load('')

      expect(result).toEqual(validSchema)
      expect(mockShiny.addCustomMessageHandler).not.toHaveBeenCalled()
    })

    it('should throw ShinyExporterError if initialModel is invalid', async () => {
      window.graphToolConfig = { initialModel: { foo: 'bar' } as any }
      const exporter = createShinyAdapter()

      await expect(exporter.load()).rejects.toThrow(ShinyExporterError)
    })

    it('should request model via message handler if no initialModel', async () => {
      const exporter = createShinyAdapter()

      // Mock the handler to simulate R sending back data
      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type === 'graph_model') {
          setTimeout(() => handler(validSchema), 10)
        }
      })

      const result = await exporter.load('')
      expect(result).toEqual(validSchema)
    })

    it('should throw ShinyExporterError on message timeout', async () => {
      const exporter = createShinyAdapter(100) // 100ms timeout

      await expect(exporter.load()).rejects.toThrow(ShinyExporterError)
    })

    it('should throw ShinyExporterError with MESSAGE_TIMEOUT code on timeout', async () => {
      const exporter = createShinyAdapter(50)

      try {
        await exporter.load('')
      } catch (error) {
        expect((error as ShinyExporterError).code).toBe('MESSAGE_TIMEOUT')
      }
    })
  })

  describe('save()', () => {
    it('should call setInputValue with graph_model and schema', async () => {
      const exporter = createShinyAdapter()

      await exporter.save(validSchema)

      expect(mockShiny.setInputValue).toHaveBeenCalledWith('graph_model', validSchema)
    })

    it('should throw ShinyExporterError on invalid schema', async () => {
      const exporter = createShinyAdapter()
      const invalidSchema = { foo: 'bar' } as any

      await expect(exporter.save(invalidSchema)).rejects.toThrow(ShinyExporterError)
    })

    it('should throw ShinyExporterError with INVALID_SCHEMA code', async () => {
      const exporter = createShinyAdapter()
      const invalidSchema = { models: {} } as any

      try {
        await exporter.save(invalidSchema)
      } catch (error) {
        expect((error as ShinyExporterError).code).toBe('INVALID_SCHEMA')
      }
    })

    it('should handle multiple saves correctly', async () => {
      const exporter = createShinyAdapter()

      await exporter.save(validSchema)
      await exporter.save(validSchema)

      expect(mockShiny.setInputValue).toHaveBeenCalledTimes(2)
    })
  })

  describe('export()', () => {
    it('should send export_request via setInputValue', async () => {
      const exporter = createShinyAdapter()

      // Setup handler to simulate R response
      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type.startsWith('export_')) {
          setTimeout(() => handler({ success: true, code: '# R code' }), 10)
        }
      })

      const result = await exporter.export(validSchema, 'openmx')

      expect(mockShiny.setInputValue).toHaveBeenCalledWith(
        'export_request',
        expect.objectContaining({
          schema: validSchema,
          format: 'openmx',
        })
      )
      expect(result).toBe('# R code')
    })

    it('should support all three export formats', async () => {
      const exporter = createShinyAdapter()

      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type.startsWith('export_')) {
          setTimeout(() => handler({ success: true, code: '# code' }), 10)
        }
      })

      await exporter.export(validSchema, 'openmx')
      await exporter.export(validSchema, 'lavaan')
      await exporter.export(validSchema, 'blavaan')

      expect(mockShiny.setInputValue).toHaveBeenCalledTimes(3)
    })

    it('should throw ShinyExporterError on invalid format', async () => {
      const exporter = createShinyAdapter()

      await expect(exporter.export(validSchema, 'invalid' as any)).rejects.toThrow(ShinyExporterError)
    })

    it('should throw ShinyExporterError with INVALID_FORMAT code', async () => {
      const exporter = createShinyAdapter()

      try {
        await exporter.export(validSchema, 'invalid' as any)
      } catch (error) {
        expect((error as ShinyExporterError).code).toBe('INVALID_FORMAT')
      }
    })

    it('should throw ShinyExporterError on invalid schema', async () => {
      const exporter = createShinyAdapter()
      const invalidSchema = { foo: 'bar' } as any

      await expect(exporter.export(invalidSchema, 'openmx')).rejects.toThrow(ShinyExporterError)
    })

    it('should throw ShinyExporterError when R returns error', async () => {
      const exporter = createShinyAdapter()

      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type.startsWith('export_')) {
          setTimeout(() => handler({ error: 'Model not found' }), 10)
        }
      })

      await expect(exporter.export(validSchema, 'openmx')).rejects.toThrow(ShinyExporterError)
    })

    it('should throw ShinyExporterError with EXPORT_SERVER_ERROR code on R error', async () => {
      const exporter = createShinyAdapter()

      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type.startsWith('export_')) {
          setTimeout(() => handler({ error: 'Invalid model' }), 10)
        }
      })

      try {
        await exporter.export(validSchema, 'openmx')
      } catch (error) {
        expect((error as ShinyExporterError).code).toBe('EXPORT_SERVER_ERROR')
      }
    })

    it('should throw ShinyExporterError on empty response code', async () => {
      const exporter = createShinyAdapter()

      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type.startsWith('export_')) {
          setTimeout(() => handler({ success: true }), 10)
        }
      })

      await expect(exporter.export(validSchema, 'openmx')).rejects.toThrow(ShinyExporterError)
    })

    it('should throw ShinyExporterError on message timeout', async () => {
      const exporter = createShinyAdapter(50)

      await expect(exporter.export(validSchema, 'openmx')).rejects.toThrow(ShinyExporterError)
    })

    it('should include export options in request', async () => {
      const exporter = createShinyAdapter()

      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type.startsWith('export_')) {
          setTimeout(() => handler({ success: true, code: '# code' }), 10)
        }
      })

      await exporter.export(validSchema, 'openmx', { modelId: 'model1', includeComments: true })

      const callArgs = mockShiny.setInputValue.mock.calls[0]
      expect(callArgs[1].options.modelId).toBe('model1')
      expect(callArgs[1].options.includeComments).toBe(true)
    })
  })

  describe('createConditionalShinyAdapter()', () => {
    it('should create exporter when in Shiny context', () => {
      const exporter = createConditionalShinyAdapter()
      expect(exporter).toBeDefined()
    })

    it('should throw ShinyExporterError when not in Shiny context', () => {
      delete (window as any).Shiny
      expect(() => createConditionalShinyAdapter()).toThrow(ShinyExporterError)
    })

    it('should throw ShinyExporterError with NOT_SHINY_CONTEXT code', () => {
      delete (window as any).Shiny
      try {
        createConditionalShinyAdapter()
      } catch (error) {
        expect((error as ShinyExporterError).code).toBe('NOT_SHINY_CONTEXT')
      }
    })
  })

  describe('error handling', () => {
    it('ShinyExporterError should have code and details properties', () => {
      delete (window as any).Shiny
      try {
        createShinyAdapter()
      } catch (error) {
        expect(error).toBeInstanceOf(ShinyExporterError)
        expect((error as ShinyExporterError).code).toBeDefined()
      }
    })

    it('should provide error details for debugging', async () => {
      const exporter = createShinyAdapter(100)

      try {
        await exporter.load('')
      } catch (error) {
        expect((error as ShinyExporterError).details).toBeDefined()
      }
    })
  })
})
