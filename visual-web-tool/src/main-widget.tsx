import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AdapterContext } from './context/AdapterContext'
import { createWidgetAdapter } from './adapters/widget/widgetAdapter'
import './index.css'

/**
 * Graph Tool Widget
 * 
 * htmlwidgets integration for embedding the graph tool in:
 * - Shiny applications (via <div id="htmlwidget-...">)
 * - Quarto documents
 * - RMarkdown documents
 * - RStudio Viewer
 * 
 * Exported as UMD module 'graphTool' for use in HTMLWidgets binding.
 */
export function initializeWidget(el: HTMLElement): void {
  // Create the adapter instance for htmlwidgets context (Shiny messaging)
  const adapter = createWidgetAdapter()

  createRoot(el).render(
    <React.StrictMode>
      <AdapterContext.Provider value={adapter}>
        <App />
      </AdapterContext.Provider>
    </React.StrictMode>
  )
}

// Auto-initialize if loaded in htmlwidgets context
if (typeof window !== 'undefined') {
  const el = document.getElementById('root')
  if (el) {
    initializeWidget(el)
  }
}
