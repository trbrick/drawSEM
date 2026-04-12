/**
 * Unit tests for Widget adapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createWidgetAdapter, createConditionalWidgetAdapter, isWidgetContext, WidgetAdapterError } from '../../src/adapters/widget/widgetAdapter'
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
      paths: [{ from: 'X', to: 'Y', numberOfArrows: 1 }],
    },
  },
}

// Mock Shiny object
const mockShiny = {
  addCustomMessageHandler: vi.fn(),
  setInputValue: vi.fn(),
}

describe('WidgetAdapter', () => {
  beforeEach(() => {
    // Setup Shiny in window
    window.Shiny = mockShiny as any
    // Clean up any lingering drawSEMConfig
    delete (window as any).drawSEMConfig
    // Reset mock implementations (not just call counts)
    mockShiny.addCustomMessageHandler.mockReset()
    mockShiny.setInputValue.mockReset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete (window as any).Shiny
    delete (window as any).drawSEMConfig
  })

  describe('isWidgetContext()', () => {
    it('should return true when Shiny is available', () => {
      expect(isWidgetContext()).toBe(true)
    })

    it('should return false when Shiny is not available', () => {
      delete (window as any).Shiny
      expect(isWidgetContext()).toBe(false)
    })

    it('should return false when Shiny methods are missing', () => {
      window.Shiny = {} as any
      expect(isWidgetContext()).toBe(false)
    })
  })

  describe('createWidgetAdapter()', () => {
    it('should throw WidgetAdapterError when Shiny is not available', () => {
      delete (window as any).Shiny
      expect(() => createWidgetAdapter()).toThrow(WidgetAdapterError)
    })

    it('should return exporter when Shiny is available', () => {
      const exporter = createWidgetAdapter()
      expect(exporter).toBeDefined()
      expect(exporter.load).toBeDefined()
      expect(exporter.save).toBeDefined()
      expect(exporter.export).toBeDefined()
    })
  })

  describe('load()', () => {
    beforeEach(() => {
      // Ensure drawSEMConfig is not set for load tests
      ;(window as any).drawSEMConfig = undefined
    })

    it('should return initialModel from window.drawSEMConfig if available', async () => {
      window.drawSEMConfig = { initialModel: validSchema }
      const exporter = createWidgetAdapter()

      const result = await exporter.load('')

      expect(result).toEqual(validSchema)
      // When initialModel is in drawSEMConfig, load() should not register a
      // graph_model listener — the SVG-export handler is registered at creation
      // and is unrelated to the load path.
      expect(mockShiny.addCustomMessageHandler).not.toHaveBeenCalledWith(
        'graph_model',
        expect.any(Function)
      )
    })

    it('should throw WidgetAdapterError if initialModel is invalid', async () => {
      window.drawSEMConfig = { initialModel: { foo: 'bar' } as any }
      const exporter = createWidgetAdapter()

      await expect(exporter.load()).rejects.toThrow(WidgetAdapterError)
    })

    it('should request model via message handler if no initialModel', async () => {
      const exporter = createWidgetAdapter()

      // Mock the handler to simulate R sending back data
      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type === 'graph_model') {
          setTimeout(() => handler(validSchema), 10)
        }
      })

      const result = await exporter.load('')
      expect(result).toEqual(validSchema)
    })

    it('should throw WidgetAdapterError on message timeout', async () => {
      const exporter = createWidgetAdapter(100) // 100ms timeout

      await expect(exporter.load()).rejects.toThrow(WidgetAdapterError)
    })

    it('should throw WidgetAdapterError with MESSAGE_TIMEOUT code on timeout', async () => {
      const exporter = createWidgetAdapter(50)

      try {
        await exporter.load('')
      } catch (error) {
        expect((error as WidgetAdapterError).code).toBe('MESSAGE_TIMEOUT')
      }
    })
  })

  describe('save()', () => {
    it('should call setInputValue with graph_model and schema', async () => {
      const exporter = createWidgetAdapter()

      await exporter.save(validSchema)

      expect(mockShiny.setInputValue).toHaveBeenCalledWith('graph_model', validSchema)
    })

    it('should throw WidgetAdapterError on invalid schema', async () => {
      const exporter = createWidgetAdapter()
      const invalidSchema = { foo: 'bar' } as any

      await expect(exporter.save(invalidSchema)).rejects.toThrow(WidgetAdapterError)
    })

    it('should throw WidgetAdapterError with INVALID_SCHEMA code', async () => {
      const exporter = createWidgetAdapter()
      const invalidSchema = { models: {} } as any

      try {
        await exporter.save(invalidSchema)
      } catch (error) {
        expect((error as WidgetAdapterError).code).toBe('INVALID_SCHEMA')
      }
    })

    it('should handle multiple saves correctly', async () => {
      const exporter = createWidgetAdapter()

      await exporter.save(validSchema)
      await exporter.save(validSchema)

      expect(mockShiny.setInputValue).toHaveBeenCalledTimes(2)
    })
  })

  describe('export()', () => {
    it('should send export_request via setInputValue', async () => {
      const exporter = createWidgetAdapter()

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
      const exporter = createWidgetAdapter()

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

    it('should throw WidgetAdapterError on invalid format', async () => {
      const exporter = createWidgetAdapter()

      await expect(exporter.export(validSchema, 'invalid' as any)).rejects.toThrow(WidgetAdapterError)
    })

    it('should throw WidgetAdapterError with INVALID_FORMAT code', async () => {
      const exporter = createWidgetAdapter()

      try {
        await exporter.export(validSchema, 'invalid' as any)
      } catch (error) {
        expect((error as WidgetAdapterError).code).toBe('INVALID_FORMAT')
      }
    })

    it('should throw WidgetAdapterError on invalid schema', async () => {
      const exporter = createWidgetAdapter()
      const invalidSchema = { foo: 'bar' } as any

      await expect(exporter.export(invalidSchema, 'openmx')).rejects.toThrow(WidgetAdapterError)
    })

    it('should throw WidgetAdapterError when R returns error', async () => {
      const exporter = createWidgetAdapter()

      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type.startsWith('export_')) {
          setTimeout(() => handler({ error: 'Model not found' }), 10)
        }
      })

      await expect(exporter.export(validSchema, 'openmx')).rejects.toThrow(WidgetAdapterError)
    })

    it('should throw WidgetAdapterError with EXPORT_SERVER_ERROR code on R error', async () => {
      const exporter = createWidgetAdapter()

      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type.startsWith('export_')) {
          setTimeout(() => handler({ error: 'Invalid model' }), 10)
        }
      })

      try {
        await exporter.export(validSchema, 'openmx')
      } catch (error) {
        expect((error as WidgetAdapterError).code).toBe('EXPORT_SERVER_ERROR')
      }
    })

    it('should throw WidgetAdapterError on empty response code', async () => {
      const exporter = createWidgetAdapter()

      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type.startsWith('export_')) {
          setTimeout(() => handler({ success: true }), 10)
        }
      })

      await expect(exporter.export(validSchema, 'openmx')).rejects.toThrow(WidgetAdapterError)
    })

    it('should throw WidgetAdapterError on message timeout', async () => {
      const exporter = createWidgetAdapter(50)

      await expect(exporter.export(validSchema, 'openmx')).rejects.toThrow(WidgetAdapterError)
    })

    it('should include export options in request', async () => {
      const exporter = createWidgetAdapter()

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

  describe('createConditionalWidgetAdapter()', () => {
    it('should create exporter when in Shiny context', () => {
      const exporter = createConditionalWidgetAdapter()
      expect(exporter).toBeDefined()
    })

    it('should throw WidgetAdapterError when not in Shiny context', () => {
      delete (window as any).Shiny
      expect(() => createConditionalWidgetAdapter()).toThrow(WidgetAdapterError)
    })

    it('should throw WidgetAdapterError with NOT_SHINY_CONTEXT code', () => {
      delete (window as any).Shiny
      try {
        createConditionalWidgetAdapter()
      } catch (error) {
        expect((error as WidgetAdapterError).code).toBe('NOT_SHINY_CONTEXT')
      }
    })
  })

  describe('error handling', () => {
    it('WidgetAdapterError should have code and details properties', () => {
      delete (window as any).Shiny
      try {
        createWidgetAdapter()
      } catch (error) {
        expect(error).toBeInstanceOf(WidgetAdapterError)
        expect((error as WidgetAdapterError).code).toBeDefined()
      }
    })

    it('should provide error details for debugging', async () => {
      const exporter = createWidgetAdapter(100)

      try {
        await exporter.load('')
      } catch (error) {
        expect((error as WidgetAdapterError).details).toBeDefined()
      }
    })
  })

  describe('signalReady()', () => {
    it('should call setInputValue with graph_tool_ready', () => {
      const exporter = createWidgetAdapter()

      exporter.signalReady?.()

      expect(mockShiny.setInputValue).toHaveBeenCalledWith(
        'graph_tool_ready',
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      )
    })

    it('should include timestamp in ready signal', () => {
      const exporter = createWidgetAdapter()
      const beforeTime = Date.now()

      exporter.signalReady?.()

      const callArgs = mockShiny.setInputValue.mock.calls[0]
      const timestamp = callArgs[1].timestamp

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(Date.now())
    })

    it('should be callable multiple times', () => {
      const exporter = createWidgetAdapter()

      exporter.signalReady?.()
      exporter.signalReady?.()
      exporter.signalReady?.()

      expect(mockShiny.setInputValue).toHaveBeenCalledTimes(3)
      expect(mockShiny.setInputValue).toHaveBeenCalledWith(
        'graph_tool_ready',
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      )
    })
  })

  describe('onModelReceived()', () => {
    it('should register custom message handler for update_model', () => {
      const exporter = createWidgetAdapter()
      const callback = vi.fn()

      exporter.onModelReceived?.(callback)

      expect(mockShiny.addCustomMessageHandler).toHaveBeenCalledWith('update_model', expect.any(Function))
    })

    it('should call callback when valid model is received', async () => {
      const exporter = createWidgetAdapter()
      const callback = vi.fn()

      let capturedHandler: Function | null = null
      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type === 'update_model') {
          capturedHandler = handler
        }
      })

      exporter.onModelReceived?.(callback)

      // Simulate R sending a model update
      await capturedHandler?.({ schema: validSchema })

      expect(callback).toHaveBeenCalledWith(validSchema)
    })

    it('should validate schema before calling callback', async () => {
      const exporter = createWidgetAdapter()
      const callback = vi.fn()

      let capturedHandler: Function | null = null
      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type === 'update_model') {
          capturedHandler = handler
        }
      })

      exporter.onModelReceived?.(callback)

      // Send invalid schema
      const invalidSchema = { foo: 'bar' }
      await capturedHandler?.({ schema: invalidSchema })

      // Callback should not be called for invalid schema
      expect(callback).not.toHaveBeenCalled()
    })

    it('should report errors to R via graph_tool_error input', async () => {
      const exporter = createWidgetAdapter()
      const callback = vi.fn()

      let capturedHandler: Function | null = null
      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type === 'update_model') {
          capturedHandler = handler
        }
      })

      exporter.onModelReceived?.(callback)

      // Send invalid schema
      const invalidSchema = { foo: 'bar' }
      await capturedHandler?.({ schema: invalidSchema })

      // Should have reported error to R
      expect(mockShiny.setInputValue).toHaveBeenCalledWith(
        'graph_tool_error',
        expect.objectContaining({
          message: expect.any(String),
          timestamp: expect.any(Number),
        })
      )
    })

    it('should handle errors from callback gracefully', async () => {
      const exporter = createWidgetAdapter()
      const callback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error')
      })

      let capturedHandler: Function | null = null
      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type === 'update_model') {
          capturedHandler = handler
        }
      })

      exporter.onModelReceived?.(callback)

      // Send valid schema but callback throws
      await capturedHandler?.({ schema: validSchema })

      // Should have reported error to R even though callback threw
      expect(mockShiny.setInputValue).toHaveBeenCalledWith(
        'graph_tool_error',
        expect.objectContaining({
          message: 'Callback error',
          timestamp: expect.any(Number),
        })
      )
    })

    it('should support multiple callbacks via separate registrations', () => {
      const exporter = createWidgetAdapter()
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      exporter.onModelReceived?.(callback1)
      exporter.onModelReceived?.(callback2)

      // Each onModelReceived call registers one 'update_model' handler.
      // createWidgetAdapter also registers one 'trigger_svg_export' handler at creation.
      expect(mockShiny.addCustomMessageHandler).toHaveBeenCalledWith('update_model', expect.any(Function))
      expect(mockShiny.addCustomMessageHandler).toHaveBeenCalledWith('trigger_svg_export', expect.any(Function))
      expect(mockShiny.addCustomMessageHandler).toHaveBeenCalledTimes(3)
    })

    it('should work with real schema conversion', async () => {
      const exporter = createWidgetAdapter()
      const callback = vi.fn()

      let capturedHandler: Function | null = null
      mockShiny.addCustomMessageHandler.mockImplementation((type: string, handler: Function) => {
        if (type === 'update_model') {
          capturedHandler = handler
        }
      })

      exporter.onModelReceived?.(callback)

      // Send a more complex valid schema
      const complexSchema: GraphSchema = {
        schemaVersion: 1,
        models: {
          model1: {
            label: 'Complex Model',
            nodes: [
              { label: 'X', type: 'constant' },
              { label: 'Y', type: 'variable' },
              { label: 'Z', type: 'variable' },
            ],
            paths: [
              { from: 'X', to: 'Y', numberOfArrows: 1 },
              { from: 'Y', to: 'Z', numberOfArrows: 2 },
            ],
          },
        },
      }

      await capturedHandler?.({ schema: complexSchema })

      expect(callback).toHaveBeenCalledWith(complexSchema)
    })
  })
})
