import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AdapterContext } from './context/AdapterContext'
import { createWidgetAdapter } from './adapters/widget/widgetAdapter'
import { createLocalAdapter } from './adapters/standalone/localAdapter'
import { modelToSVG, SvgExportOptions } from './utils/svgRenderer'
import { autoLayout } from './utils/autoLayout'
import { GraphSchema } from './core/types'
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

/**
 * Headless SVG export hook.
 *
 * Renders a schema to a complete, standalone SVG string using the same
 * `modelToSVG` generator as the in-app "Export Image" button, so headless
 * output matches the app exactly. Node positions are read from
 * `schema.nodes[].visual`; any layout-eligible node that is missing coordinates
 * is positioned with `autoLayout` first — but only when positions are missing,
 * so an explicit layout already in the schema is respected.
 *
 * Exposed as `window.drawSEMExportSVG` for the R `exportImage()` helper. It is a
 * pure function of the schema: it does not require the React app to be mounted.
 */
export function exportModelToSVG(
  schema: GraphSchema,
  modelId?: string,
  options?: SvgExportOptions
): string {
  // Deep-clone so we never mutate the caller's schema.
  const clone: GraphSchema = JSON.parse(JSON.stringify(schema))
  const modelKey = modelId ?? Object.keys(clone.models)[0]
  const model = modelKey ? clone.models[modelKey] : undefined

  if (model) {
    const needsLayout = model.nodes.some(
      (n) =>
        n.type !== 'dataset' &&
        n.type !== 'constant' &&
        (n.visual?.x === undefined || n.visual?.y === undefined)
    )
    if (needsLayout) {
      // autoLayout positions the first model of whatever schema it is given, so
      // hand it a single-model schema to support a non-default modelId.
      const positions = autoLayout({ ...clone, models: { [modelKey]: model } })
      model.nodes.forEach((n) => {
        if (n.type === 'dataset' || n.type === 'constant') return
        if (n.visual?.x !== undefined && n.visual?.y !== undefined) return
        const pos = positions[n.label]
        if (pos) {
          n.visual = { ...(n.visual ?? {}), x: pos.x, y: pos.y }
        }
      })
    }
  }

  return modelToSVG(clone, modelId, options)
}

// Expose for direct calling from htmlwidgets binding
if (typeof window !== 'undefined') {
  (window as any).drawSEMInitialize = initializeWidget
  ;(window as any).drawSEMExportSVG = exportModelToSVG
  console.log('[widget.js] Exposed window.drawSEMInitialize and window.drawSEMExportSVG')
}
