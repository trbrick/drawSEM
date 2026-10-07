import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AdapterContext } from './context/AdapterContext'
import { createWidgetAdapter } from './adapters/widget/widgetAdapter'
import { createLocalAdapter } from './adapters/standalone/localAdapter'
import { modelToSVG, SvgExportOptions } from './utils/svgRenderer'
import { layoutModel } from './utils/layoutModel'
import { convertModelToRuntime } from './utils/runtimeConverter'
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
  
  // editMode: 'layout' restricts editing to visual changes (set by R's
  // semWidget(editMode = "layout") via window.drawSEMConfig); anything else = 'full'.
  const editMode: 'full' | 'layout' =
    (window as any).drawSEMConfig?.editMode === 'layout' ? 'layout' : 'full'

  try {
    createRoot(el).render(
      <React.StrictMode>
        <AdapterContext.Provider value={adapter}>
          <App viewMode={viewMode} editMode={editMode} />
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
    // Same layout as the editor (layoutModel): a model with no positions is
    // laid out in full, as on load (datasets to the side); a partly positioned
    // model only has its unplaced variables filled in, from that same layout.
    const isLayoutEligible = (n: any) => n.type !== 'dataset' && n.type !== 'constant'
    const isPlaced = (n: any) => n.visual?.x !== undefined && n.visual?.y !== undefined
    const needsLayout = model.nodes.some((n) => isLayoutEligible(n) && !isPlaced(n))
    if (needsLayout) {
      const anyPositioned = model.nodes.some((n) => n.visual?.x !== undefined || n.visual?.y !== undefined)
      const runtime = convertModelToRuntime(model)
      const laidOut = layoutModel(
        { id: modelKey, label: model.label, nodes: runtime.nodes, paths: runtime.paths },
        { excludeDatasets: true }
      )
      const byLabel = new Map((laidOut ?? []).map((n) => [n.label, n]))
      model.nodes.forEach((n) => {
        if (anyPositioned && (!isLayoutEligible(n) || isPlaced(n))) return
        const placed = byLabel.get(n.label)
        if (placed && placed.x !== undefined && placed.y !== undefined) {
          n.visual = { ...(n.visual ?? {}), x: placed.x, y: placed.y }
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
