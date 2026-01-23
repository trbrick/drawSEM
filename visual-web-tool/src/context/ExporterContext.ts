import { createContext, useContext } from 'react'
import type { GraphExporter } from '../core/types'

export const ExporterContext = createContext<GraphExporter | null>(null)

/**
 * Hook to access the current exporter instance.
 * Throws an error if used outside ExporterContext.Provider.
 * Use this in components that require the exporter.
 */
export function useExporter(): GraphExporter {
  const exporter = useContext(ExporterContext)
  if (!exporter) {
    throw new Error('useExporter must be used within ExporterContext.Provider')
  }
  return exporter
}

/**
 * Hook to optionally access the exporter instance.
 * Returns null if exporter is not available.
 * Use this in components that should degrade gracefully without an exporter.
 */
export function useExporterOptional(): GraphExporter | null {
  return useContext(ExporterContext)
}
