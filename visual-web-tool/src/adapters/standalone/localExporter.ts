/**
 * Standalone File Exporter Adapter
 * Implements GraphExporter for browser-based file I/O and local development
 * Supports: JSON file loading/saving, POST-based export to /api/export endpoint
 */

import { GraphSchema, GraphExporter, ExportOptions, isGraphSchema } from '../../core/types'
import { validateGraph } from '../../validateGraph'

/**
 * Error class for exporter-specific errors
 */
export class ExporterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'ExporterError'
  }
}

/**
 * Create a local file exporter for standalone mode
 * Handles JSON file loading, saving via download, and export to /api/export endpoint
 *
 * @returns GraphExporter instance configured for standalone/development use
 */
export function createLocalExporter(): GraphExporter {
  return {
    /**
     * Load a GraphSchema from various sources
     * - URL starting with 'http': fetch from remote
     * - '/examples/...': fetch from local examples directory
     * - Otherwise: treat as JSON string and parse
     */
    async load(source: string): Promise<GraphSchema> {
      try {
        let jsonData: unknown

        // Handle different source types
        if (source.startsWith('http://') || source.startsWith('https://')) {
          // Remote URL
          const response = await fetch(source)
          if (!response.ok) {
            throw new ExporterError(
              `Failed to fetch from ${source}: ${response.statusText}`,
              'FETCH_FAILED',
              { status: response.status, statusText: response.statusText }
            )
          }
          jsonData = await response.json()
        } else if (source.startsWith('/examples/')) {
          // Local examples directory
          const response = await fetch(source)
          if (!response.ok) {
            throw new ExporterError(
              `Example file not found: ${source}`,
              'NOT_FOUND',
              { path: source }
            )
          }
          jsonData = await response.json()
        } else {
          // Assume it's a JSON string
          jsonData = JSON.parse(source)
        }

        // Validate against schema
        if (!isGraphSchema(jsonData)) {
          throw new ExporterError(
            'Loaded data is not a valid GraphSchema',
            'INVALID_SCHEMA',
            { receivedKeys: jsonData && typeof jsonData === 'object' ? Object.keys(jsonData) : typeof jsonData }
          )
        }

        // Run AJV validation for detailed error reporting
        const validation = validateGraph(jsonData)
        if (!validation.ok) {
          throw new ExporterError(
            'Schema validation failed',
            'VALIDATION_FAILED',
            { errors: validation.errors }
          )
        }

        return jsonData as GraphSchema
      } catch (error) {
        // Re-throw ExporterError as-is
        if (error instanceof ExporterError) {
          throw error
        }

        // Handle JSON parse errors
        if (error instanceof SyntaxError) {
          throw new ExporterError(
            `Invalid JSON: ${error.message}`,
            'PARSE_ERROR',
            { originalError: error.message }
          )
        }

        // Handle other errors
        throw new ExporterError(
          `Failed to load schema: ${error instanceof Error ? error.message : String(error)}`,
          'UNKNOWN_ERROR',
          { originalError: error }
        )
      }
    },

    /**
     * Save a GraphSchema by triggering a browser download
     * Validates schema before saving
     */
    async save(schema: GraphSchema): Promise<void> {
      try {
        // Validate before saving
        if (!isGraphSchema(schema)) {
          throw new ExporterError(
            'Invalid GraphSchema provided for saving',
            'INVALID_SCHEMA',
            { receivedKeys: Object.keys(schema) }
          )
        }

        const validation = validateGraph(schema)
        if (!validation.ok) {
          throw new ExporterError(
            'Schema validation failed before saving',
            'VALIDATION_FAILED',
            { errors: validation.errors }
          )
        }

        // Create blob and download
        const jsonString = JSON.stringify(schema, null, 2)
        const blob = new Blob([jsonString], { type: 'application/json' })

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0]
        const filename = `graph-${timestamp}.json`

        // Create download link
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename

        // Trigger download
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        // Clean up
        URL.revokeObjectURL(url)
      } catch (error) {
        if (error instanceof ExporterError) {
          throw error
        }

        throw new ExporterError(
          `Failed to save schema: ${error instanceof Error ? error.message : String(error)}`,
          'SAVE_FAILED',
          { originalError: error }
        )
      }
    },

    /**
     * Export schema to backend code by POSTing to /api/export
     * Validates schema and passes format + options to backend
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
          throw new ExporterError(
            'Invalid GraphSchema provided for export',
            'INVALID_SCHEMA',
            { receivedKeys: Object.keys(schema) }
          )
        }

        const validation = validateGraph(schema)
        if (!validation.ok) {
          throw new ExporterError(
            'Schema validation failed before export',
            'VALIDATION_FAILED',
            { errors: validation.errors }
          )
        }

        // Validate format
        if (!['openmx', 'lavaan', 'blavaan'].includes(format)) {
          throw new ExporterError(
            `Invalid export format: ${format}`,
            'INVALID_FORMAT',
            { format, validFormats: ['openmx', 'lavaan', 'blavaan'] }
          )
        }

        // POST to export endpoint
        const response = await fetch('/api/export', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            schema,
            format,
            options: options || {},
          }),
        })

        if (!response.ok) {
          const contentType = response.headers.get('content-type')
          let errorDetails: unknown

          try {
            if (contentType?.includes('application/json')) {
              errorDetails = await response.json()
            } else {
              errorDetails = await response.text()
            }
          } catch {
            errorDetails = `HTTP ${response.status}: ${response.statusText}`
          }

          throw new ExporterError(
            `Export server returned error: ${response.statusText}`,
            'EXPORT_SERVER_ERROR',
            { status: response.status, details: errorDetails }
          )
        }

        // Read response as text
        const code = await response.text()

        if (!code || typeof code !== 'string') {
          throw new ExporterError(
            'Export server returned empty or invalid response',
            'EMPTY_RESPONSE',
            { responseLength: code?.length }
          )
        }

        return code
      } catch (error) {
        // Re-throw ExporterError as-is
        if (error instanceof ExporterError) {
          throw error
        }

        // Handle network errors
        if (error instanceof TypeError) {
          throw new ExporterError(
            `Network error during export: ${error.message}`,
            'NETWORK_ERROR',
            { originalError: error.message }
          )
        }

        // Handle other errors
        throw new ExporterError(
          `Failed to export schema: ${error instanceof Error ? error.message : String(error)}`,
          'UNKNOWN_ERROR',
          { originalError: error }
        )
      }
    },
  }
}

/**
 * Convenience export for direct usage
 */
export const localExporter = createLocalExporter()
