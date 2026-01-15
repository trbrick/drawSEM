/**
 * useLocalState Hook
 * Persists CanvasTool state to localStorage with debounced auto-save
 * Enables recovery on page reload in standalone mode
 */

import { useEffect, useRef, useState } from 'react'
import { GraphSchema } from '../../core/types'

/**
 * Return type for useLocalState hook
 */
export interface LocalStateStatus {
  /** Dictionary of saved models by ID */
  savedModels: Record<string, GraphSchema>
  /** Whether current state is saved (not dirty) */
  isSaved: boolean
  /** Timestamp of last successful save */
  lastSavedTime: Date | null
  /** Explicitly save current model to localStorage */
  save: (key: string, schema: GraphSchema) => Promise<void>
  /** Load all saved models from localStorage */
  load: () => Record<string, GraphSchema>
  /** Clear all saved models from localStorage */
  clear: () => void
}

const STORAGE_KEY = 'graph-tool-models'
const DEBOUNCE_MS = 500

/**
 * Custom hook for standalone mode persistence
 * Auto-saves models to localStorage with debounced updates
 * Allows recovery of unsaved work on page reload
 *
 * @param autoSave Enable automatic debounced saving (default: true)
 * @param storageKey Custom localStorage key (default: 'graph-tool-models')
 * @returns LocalStateStatus with models, save functions, and status
 */
export function useLocalState(autoSave = true, storageKey = STORAGE_KEY): LocalStateStatus {
  const [savedModels, setSavedModels] = useState<Record<string, GraphSchema>>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : {}
    } catch (error) {
      console.warn(`Failed to load state from localStorage (${storageKey}):`, error)
      return {}
    }
  })

  const [isSaved, setIsSaved] = useState(true)
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null)

  // Track pending saves to manage debounce
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ key: string; schema: GraphSchema } | null>(null)

  /**
   * Internal function to persist state to localStorage
   */
  const persistToStorage = (models: Record<string, GraphSchema>) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(models))
      setIsSaved(true)
      setLastSavedTime(new Date())
    } catch (error) {
      console.error(`Failed to persist state to localStorage (${storageKey}):`, error)
      setIsSaved(false)
    }
  }

  /**
   * Explicit save function - saves immediately
   */
  const save = async (key: string, schema: GraphSchema): Promise<void> => {
    try {
      const updated = { ...savedModels, [key]: schema }
      setSavedModels(updated)
      persistToStorage(updated)
    } catch (error) {
      throw new Error(`Failed to save model "${key}": ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Load function - retrieves all saved models
   */
  const load = (): Record<string, GraphSchema> => {
    try {
      const stored = localStorage.getItem(storageKey)
      const loaded = stored ? JSON.parse(stored) : {}
      setSavedModels(loaded)
      return loaded
    } catch (error) {
      console.error(`Failed to load state from localStorage (${storageKey}):`, error)
      return {}
    }
  }

  /**
   * Clear function - removes all saved models
   */
  const clear = () => {
    try {
      localStorage.removeItem(storageKey)
      setSavedModels({})
      setLastSavedTime(null)
      setIsSaved(true)
    } catch (error) {
      console.error(`Failed to clear localStorage (${storageKey}):`, error)
    }
  }

  /**
   * Auto-save hook - debounces saving when savedModels changes
   */
  useEffect(() => {
    if (!autoSave) return

    // If no changes pending, nothing to do
    if (pendingSaveRef.current === null) {
      return
    }

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set dirty flag
    setIsSaved(false)

    // Schedule save after debounce period
    debounceTimerRef.current = setTimeout(() => {
      if (pendingSaveRef.current) {
        persistToStorage(savedModels)
        pendingSaveRef.current = null
      }
    }, DEBOUNCE_MS)

    // Cleanup on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [autoSave, savedModels])

  /**
   * Helper to queue a model change for debounced saving
   * This is called via the exporter's save method or similar
   */
  const updateModel = (key: string, schema: GraphSchema) => {
    pendingSaveRef.current = { key, schema }
    const updated = { ...savedModels, [key]: schema }
    setSavedModels(updated)
  }

  return {
    savedModels,
    isSaved,
    lastSavedTime,
    save,
    load,
    clear,
  }
}

/**
 * Helper hook to set up auto-save on model changes
 * Integrates with CanvasTool's onModelChange callback
 *
 * @param modelId ID of current model
 * @param storageKey localStorage key
 * @returns Auto-save callback for onModelChange
 */
export function useAutoSaveCallback(
  modelId: string,
  localState: LocalStateStatus,
  storageKey = STORAGE_KEY
): (schema: GraphSchema) => void {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (schema: GraphSchema) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Schedule save
    debounceTimerRef.current = setTimeout(() => {
      try {
        const updated = { ...localState.savedModels, [modelId]: schema }
        localStorage.setItem(storageKey, JSON.stringify(updated))
      } catch (error) {
        console.error('Auto-save failed:', error)
      }
    }, DEBOUNCE_MS)
  }
}
