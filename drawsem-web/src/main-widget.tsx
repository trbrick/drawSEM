import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AdapterContext } from './context/AdapterContext'
import { createWidgetAdapter } from './adapters/widget/widgetAdapter'
import { createLocalAdapter } from './adapters/standalone/localAdapter'
import './index.css'

/**
 * drawSEM Widget
 * 
 * htmlwidgets integration for embedding drawSEM in:
 * - Shiny applications (via <div id="htmlwidget-...">)
 * - Quarto documents
 * - RMarkdown documents
 * - RStudio Viewer
 * - Standalone development
 * 
 * Exported as UMD module 'drawSEM' for use in HTMLWidgets binding.
 */
export function initializeWidget(el: HTMLElement): void {
  // Determine viewMode and adapter based on execution context
  // viewMode: 'widget' (htmlwidgets), 'shiny' (Shiny app), 'full' (standalone development)
  // adapter: handles R communication (Shiny) or local state (standalone/widget)
  console.log('[widget.js] initializeWidget() called')
  console.log('[widget.js] Context detection: window.Shiny =', typeof window.Shiny)
  
  let adapter
  let viewMode: 'widget' | 'shiny' | 'full'
  
  if (typeof window !== 'undefined' && window.Shiny) {
    // Shiny app context: full UI with R communication
    console.log('[widget.js] Detected Shiny environment')
    viewMode = 'shiny'
    try {
      adapter = createWidgetAdapter()
      console.log('[widget.js] Using widget adapter for Shiny R communication')
    } catch (err) {
      console.warn('[widget.js] Failed to create Shiny adapter, falling back to local adapter:', err)
      viewMode = 'widget' // Fallback to minimal mode
      adapter = createLocalAdapter()
    }
  } else {
    // Non-Shiny context: widget mode (RStudio htmlwidgets) or standalone
    // Both use local adapter, but widget mode hides chrome
    console.log('[widget.js] No Shiny detected, using local/standalone adapter')
    viewMode = 'widget' // Default to widget mode (minimal UI) for htmlwidgets context
    adapter = createLocalAdapter()
  }
  
  try {
    createRoot(el).render(
      <React.StrictMode>
        <AdapterContext.Provider value={adapter}>
          <App viewMode={viewMode} />
        </AdapterContext.Provider>
      </React.StrictMode>
    )
    console.log('[widget.js] React rendered successfully to element with viewMode:', viewMode)
  } catch (err) {
    console.error('[widget.js] Error during React rendering:', err)
    throw err
  }
}

// Expose for direct calling from htmlwidgets binding
if (typeof window !== 'undefined') {
  (window as any).drawSEMInitialize = initializeWidget
  console.log('[widget.js] Exposed window.drawSEMInitialize function')
}
