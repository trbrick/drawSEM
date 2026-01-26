/**
 * Shiny Exporter Adapter
 * Implements GraphExporter for R Shiny integration via message passing
 * Handles bidirectional communication between Shiny server and the visual tool widget
 */

import { GraphSchema, GraphAdapter, ExportOptions, isGraphSchema } from '../../core/types'

/**
 * Error class for Shiny-specific errors
 */
export class ShinyExporterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'ShinyExporterError'
  }
}

/**
 * Type for Shiny global object (from htmlwidgets)
 */
declare global {
  interface Window {
    Shiny?: {
      addCustomMessageHandler: (type: string, handler: (data: unknown) => void) => void
      setInputValue: (name: string, value: unknown) => void
    }
  }
}

/**
 * Configuration passed from R (set via window.graphToolConfig)
 */
interface GraphToolConfig {
  initialModel?: GraphSchema
  messageTimeout?: number  // milliseconds, default 30000
}

declare global {
  interface Window {
    graphToolConfig?: GraphToolConfig
  }
}

/**
 * Create a Shiny exporter for R integration
 * Handles bidirectional message passing with R via Shiny
 *
 * @param messageTimeout Maximum time to wait for async message responses (default: 30000ms)
 * @returns GraphExporter instance configured for Shiny mode
 * @throws ShinyExporterError if Shiny is not available
 */
export function createShinyAdapter(messageTimeout = 30000): GraphAdapter {
  // Verify Shiny is available
  if (!window.Shiny) {
    throw new ShinyExporterError(
      'Shiny is not available in window.Shiny. Are you running inside a Shiny app?',
      'SHINY_NOT_AVAILABLE',
      { hasWindow: typeof window !== 'undefined' }
    )
  }

  const shiny = window.Shiny

  // Store active response handlers to avoid memory leaks
  const pendingHandlers = new Map<string, (data: unknown) => void>()

  return {
    /**
     * Load a GraphSchema from the Shiny server
     * Requests initial model via Shiny message passing
     */
    async load(): Promise<GraphSchema> {
      try {
        // First check if initial model is already available from R
        if (window.graphToolConfig?.initialModel) {
          const initialModel = window.graphToolConfig.initialModel

          if (!isGraphSchema(initialModel)) {
            throw new ShinyExporterError(
              'Initial model from R is not a valid GraphSchema',
              'INVALID_SCHEMA',
              {
                receivedKeys: initialModel && typeof initialModel === 'object' ? Object.keys(initialModel) : typeof initialModel,
              }
            )
          }

          return initialModel
        }

        // Otherwise, request from server via custom message handler
        return await new Promise((resolve, reject) => {
          const handlerId = `graph_load_${Date.now()}`
          const timeoutId = setTimeout(() => {
            pendingHandlers.delete(handlerId)
            reject(
              new ShinyExporterError(
                `Timeout waiting for graph model from Shiny server (${messageTimeout}ms)`,
                'MESSAGE_TIMEOUT',
                { timeout: messageTimeout }
              )
            )
          }, messageTimeout)

          const handler = (data: unknown) => {
            clearTimeout(timeoutId)
            pendingHandlers.delete(handlerId)

            try {
              if (!isGraphSchema(data)) {
                throw new ShinyExporterError(
                  'Model received from Shiny server is not a valid GraphSchema',
                  'INVALID_SCHEMA',
                  { receivedKeys: data && typeof data === 'object' ? Object.keys(data) : typeof data }
                )
              }
              resolve(data as GraphSchema)
            } catch (error) {
              reject(error)
            }
          }

          pendingHandlers.set(handlerId, handler)
          shiny.addCustomMessageHandler('graph_model', handler)

          // Request model from R
          shiny.setInputValue('graph_load_request', { timestamp: Date.now() })
        })
      } catch (error) {
        if (error instanceof ShinyExporterError) {
          throw error
        }

        throw new ShinyExporterError(
          `Failed to load schema from Shiny: ${error instanceof Error ? error.message : String(error)}`,
          'LOAD_FAILED',
          { originalError: error }
        )
      }
    },

    /**
     * Save a GraphSchema to the Shiny server
     * Sends current model state via setInputValue as reactive input
     */
    async save(schema: GraphSchema): Promise<void> {
      try {
        if (!isGraphSchema(schema)) {
          throw new ShinyExporterError(
            'Invalid GraphSchema provided for saving',
            'INVALID_SCHEMA',
            { receivedKeys: Object.keys(schema) }
          )
        }

        // Send to R as reactive input
        // R can observe changes via reactive() or observeEvent()
        shiny.setInputValue('graph_model', schema)
      } catch (error) {
        if (error instanceof ShinyExporterError) {
          throw error
        }

        throw new ShinyExporterError(
          `Failed to save schema to Shiny: ${error instanceof Error ? error.message : String(error)}`,
          'SAVE_FAILED',
          { originalError: error }
        )
      }
    },

    /**
     * Export schema to backend code via Shiny server
     * Sends export request to R and waits for code response
     *
     * @param schema GraphSchema to export
     * @param format Export format: 'openmx', 'lavaan', or 'blavaan'
     * @param options Export options (modelId, includeComments, etc.)
     * @returns Promise resolving to R code string
     */
    async export(
      schema: GraphSchema,
      format: 'openmx' | 'lavaan' | 'blavaan',
      options?: ExportOptions
    ): Promise<string> {
      try {
        // Validate schema
        if (!isGraphSchema(schema)) {
          throw new ShinyExporterError(
            'Invalid GraphSchema provided for export',
            'INVALID_SCHEMA',
            { receivedKeys: Object.keys(schema) }
          )
        }

        // Validate format
        if (!['openmx', 'lavaan', 'blavaan'].includes(format)) {
          throw new ShinyExporterError(
            `Invalid export format: ${format}`,
            'INVALID_FORMAT',
            { format, validFormats: ['openmx', 'lavaan', 'blavaan'] }
          )
        }

        // Wait for export result from R
        return await new Promise((resolve, reject) => {
          const handlerId = `export_${format}_${Date.now()}`
          const timeoutId = setTimeout(() => {
            pendingHandlers.delete(handlerId)
            reject(
              new ShinyExporterError(
                `Timeout waiting for export result from Shiny server (${messageTimeout}ms)`,
                'MESSAGE_TIMEOUT',
                { timeout: messageTimeout, format }
              )
            )
          }, messageTimeout)

          const handler = (data: unknown) => {
            clearTimeout(timeoutId)
            pendingHandlers.delete(handlerId)

            try {
              // Response should be { success: boolean, code?: string, error?: string }
              const response = data as Record<string, unknown>

              if (!response || typeof response !== 'object') {
                throw new ShinyExporterError(
                  'Invalid response type from Shiny export handler',
                  'INVALID_RESPONSE',
                  { receivedType: typeof response }
                )
              }

              if (response.error) {
                throw new ShinyExporterError(
                  `Export failed on R server: ${response.error}`,
                  'EXPORT_SERVER_ERROR',
                  { serverError: response.error }
                )
              }

              if (!response.code || typeof response.code !== 'string') {
                throw new ShinyExporterError(
                  'Export server returned empty or invalid code',
                  'EMPTY_RESPONSE',
                  { hasCode: 'code' in response, codeType: typeof response.code }
                )
              }

              resolve(response.code as string)
            } catch (error) {
              reject(error)
            }
          }

          pendingHandlers.set(handlerId, handler)
          shiny.addCustomMessageHandler(`export_${format}_result`, handler)

          // Send export request to R
          shiny.setInputValue('export_request', {
            schema,
            format,
            options: options || {},
            timestamp: Date.now(),
          })
        })
      } catch (error) {
        if (error instanceof ShinyExporterError) {
          throw error
        }

        // Handle network/communication errors
        if (error instanceof TypeError) {
          throw new ShinyExporterError(
            `Communication error during export: ${error.message}`,
            'COMMUNICATION_ERROR',
            { originalError: error.message }
          )
        }

        throw new ShinyExporterError(
          `Failed to export schema via Shiny: ${error instanceof Error ? error.message : String(error)}`,
          'UNKNOWN_ERROR',
          { originalError: error }
        )
      }
    },
  }
}

/**
 * Helper function to detect if running in Shiny context
 * Useful for conditional initialization
 */
export function isShinyContext(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.Shiny !== 'undefined' &&
    typeof window.Shiny.addCustomMessageHandler === 'function' &&
    typeof window.Shiny.setInputValue === 'function'
  )
}

/**
 * Create exporter with automatic context detection
 * Returns Shiny exporter if in Shiny context, otherwise throws error
 *
 * @param messageTimeout Optional timeout for message responses
 * @returns GraphExporter configured for current context
 * @throws ShinyExporterError if not in Shiny context
 */
export function createConditionalShinyAdapter(messageTimeout?: number): GraphAdapter {
  if (!isShinyContext()) {
    throw new ShinyExporterError(
      'Not in a Shiny context. Create exporter only when window.Shiny is available.',
      'NOT_SHINY_CONTEXT'
    )
  }
  return createShinyAdapter(messageTimeout)
}
