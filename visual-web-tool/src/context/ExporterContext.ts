import { createContext, useContext } from 'react'
import type { GraphAdapter } from '../core/types'

export const AdapterContext = createContext<GraphAdapter | null>(null)

/**
 * Hook to access the current adapter instance.
 * Throws an error if used outside AdapterContext.Provider.
 * Use this in components that require the adapter.
 */
export function useAdapter(): GraphAdapter {
  const adapter = useContext(AdapterContext)
  if (!adapter) {
    throw new Error('useAdapter must be used within AdapterContext.Provider')
  }
  return adapter
}

/**
 * Hook to optionally access the adapter instance.
 * Returns null if adapter is not available.
 * Use this in components that should degrade gracefully without an adapter.
 */
export function useAdapterOptional(): GraphAdapter | null {
  return useContext(AdapterContext)
}
