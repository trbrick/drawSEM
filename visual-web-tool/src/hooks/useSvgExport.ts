/**
 * React hook for SVG export functionality
 * Integrates svgRenderer with CanvasTool state
 */

import { useCallback } from 'react'
import { GraphSchema } from '../core/types'
import { modelToSVG, SvgExportOptions } from '../utils/svgRenderer'

/**
 * Hook for exporting graph models to SVG
 * Positions are read from schema.nodes[].visual (canonical/RAMPath space)
 * Usage in CanvasTool:
 *   const { exportToSvg } = useSvgExport()
 *   const svgString = exportToSvg(schema, modelId, options)
 */
export function useSvgExport() {
  /**
   * Export a graph model to SVG string
   */
  const exportToSvg = useCallback(
    (
      schema: GraphSchema,
      modelId?: string,
      options?: SvgExportOptions
    ): string => {
      try {
        return modelToSVG(schema, modelId, options)
      } catch (error) {
        console.error('Error exporting to SVG:', error)
        throw error
      }
    },
    []
  )

  /**
   * Download SVG as file
   */
  const downloadSvg = useCallback(
    (
      svgString: string,
      filename: string = 'graph.svg'
    ): void => {
      const blob = new Blob([svgString], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    },
    []
  )

  /**
   * Copy SVG to clipboard
   */
  const copySvgToClipboard = useCallback(
    async (svgString: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(svgString)
        return true
      } catch (error) {
        console.error('Error copying SVG to clipboard:', error)
        return false
      }
    },
    []
  )

  return {
    exportToSvg,
    downloadSvg,
    copySvgToClipboard,
  }
}
