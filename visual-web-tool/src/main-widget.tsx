import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AdapterContext } from './context/AdapterContext'
import { createWidgetAdapter } from './adapters/widget/widgetAdapter'
import { createLocalAdapter } from './adapters/standalone/localAdapter'
import './index.css'

/**
 * Graph Tool Widget
 * 
 * htmlwidgets integration for embedding the graph tool in:
 * - Shiny applications (via <div id="htmlwidget-...">)
 * - Quarto documents
 * - RMarkdown documents
 * - RStudio Viewer
 * - Standalone development
 * 
 * Exported as UMD module 'graphTool' for use in HTMLWidgets binding.
 */
export function initializeWidget(el: HTMLElement): void {
  // Choose adapter based on context
  // Priority: Shiny > Standalone/Local
  console.log('[widget.js] initializeWidget() called')
  console.log('[widget.js] Context detection: window.Shiny =', typeof window.Shiny)
  
  let adapter
  if (typeof window !== 'undefined' && window.Shiny) {
    console.log('[widget.js] Detected Shiny environment, using widget adapter for R communication')
    try {
      adapter = createWidgetAdapter()
    } catch (err) {
      console.warn('[widget.js] Failed to create Shiny adapter, falling back to local adapter:', err)
      adapter = createLocalAdapter()
    }
  } else {
    console.log('[widget.js] No Shiny detected, using standalone/local adapter')
    adapter = createLocalAdapter()
  }
  
  try {
    createRoot(el).render(
      <React.StrictMode>
        <AdapterContext.Provider value={adapter}>
          <App />
        </AdapterContext.Provider>
      </React.StrictMode>
    )
    console.log('[widget.js] React rendered successfully to element')
  } catch (err) {
    console.error('[widget.js] Error during React rendering:', err)
    throw err
  }
}

// Expose for direct calling from htmlwidgets binding
if (typeof window !== 'undefined') {
  (window as any).graphToolInitialize = initializeWidget
  console.log('[widget.js] Exposed window.graphToolInitialize function')
}
