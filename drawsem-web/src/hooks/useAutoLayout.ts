import { useCallback } from 'react'
import { GraphSchema } from '../core/types'
import { autoLayout, PositionMap, LayoutOptions } from '../utils/autoLayout'

/**
 * React hook for applying auto-layout to a model
 *
 * Usage:
 *   const layout = useAutoLayout()
 *   const positions = layout.compute(schema)
 *   // or
 *   const positions = layout.compute(schema, { nodeWidth: 120, rankHeight: 200 })
 */
export function useAutoLayout() {
  const compute = useCallback((schema: GraphSchema, options?: LayoutOptions): PositionMap => {
    try {
      return autoLayout(schema, options)
    } catch (error) {
      console.error('Error computing layout:', error)
      // Return empty map on error; calling code can handle gracefully
      return {}
    }
  }, [])

  return { compute }
}

/**
 * Alternative: Direct export for use outside React components
 */
export { autoLayout }
export type { PositionMap, LayoutOptions }
