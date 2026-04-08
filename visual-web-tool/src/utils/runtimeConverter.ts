import { convertToUnicode } from './converters'
import { MANIFEST_DEFAULT_W, MANIFEST_DEFAULT_H, DATASET_DEFAULT_W, DATASET_DEFAULT_H } from './constants'
import { Node, Path } from './helpers'

/**
 * Convert a single model object (from schema.models[n]) to runtime format
 */
export function convertModelToRuntime(model: any): { nodes: Node[]; paths: Path[] } {
  const usedIds = new Set<string>()
  const labelToId: Record<string, string> = {}

  function slugifyLabel(label: string) {
    return (
      'n_' +
      label
        .toString()
        .normalize('NFKD')
        .replace(/[^\w\s\-\.]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_\-\.]/g, '')
    )
  }

  function uniqueId(base: string) {
    let id = base
    let i = 1
    while (usedIds.has(id)) id = `${base}_${i++}`
    usedIds.add(id)
    return id
  }

  const nodesOut: Node[] = (model.nodes || []).map((n: any) => {
    const label = n.label || 'node'
    // Keep label in canonical format; use displayName for UI rendering with unicode
    let base = n.id || slugifyLabel(label)
    base = base.replace(/^p_/, 'n_')
    const id = uniqueId(base)
    labelToId[label] = id
    const visual = n.visual || {}
    const out: any = {
      id,
      x: typeof visual.x === 'number' ? visual.x : 0,
      y: typeof visual.y === 'number' ? visual.y : 0,
      label: label,
      displayName: convertToUnicode(label),
      type: n.type || 'variable'
    }
    if (process.env.NODE_ENV === 'development') {
      console.log('[RuntimeConverter] Node conversion:', {
        label,
        inputVisual: n.visual,
        outputX: out.x,
        outputY: out.y,
        hasVisual: !!n.visual,
        visualX: visual.x,
        visualY: visual.y,
      })
    }
    if (out.type === 'variable') {
      out.width = typeof visual.width === 'number' ? visual.width : MANIFEST_DEFAULT_W
      out.height = typeof visual.height === 'number' ? visual.height : MANIFEST_DEFAULT_H
    } else if (out.type === 'dataset') {
      out.width = typeof visual.width === 'number' ? visual.width : DATASET_DEFAULT_W
      out.height = typeof visual.height === 'number' ? visual.height : DATASET_DEFAULT_H
    }
    // Copy optional fields
    if (n.levelOfMeasurement) out.levelOfMeasurement = n.levelOfMeasurement
    if (n.mappings) out.mappings = n.mappings
    if (n.datasetSource) out.datasetSource = n.datasetSource
    if (n.variableCharacteristics) out.variableCharacteristics = n.variableCharacteristics
    return out
  })

  function mkPathId(base: string) {
    return uniqueId(base.replace(/^p_/, 'p_'))
  }

  const pathsOut: Path[] = (model.paths || []).map((p: any) => {
        const fromLabel = p.from
    const toLabel = p.to
    const from = labelToId[fromLabel] || slugifyLabel(fromLabel)
    const to = labelToId[toLabel] || slugifyLabel(toLabel)
    if (!labelToId[fromLabel]) labelToId[fromLabel] = uniqueId(from)
    if (!labelToId[toLabel]) labelToId[toLabel] = uniqueId(to)
    const numberOfArrows = typeof p.numberOfArrows === 'number' ? p.numberOfArrows : 1
    const twoSided = numberOfArrows >= 2
    const side = p.visual && p.visual.loopSide ? p.visual.loopSide : undefined
    const idBase = p.id || ('p_' + (p.label || `${fromLabel}_to_${toLabel}`).replace(/\s+/g, '_'))
    const id = mkPathId(idBase)
    const out: any = { id, from: labelToId[fromLabel], to: labelToId[toLabel], twoSided }
    
    console.log('[RuntimeConverter] Path:', {
      fromLabel,
      toLabel,
      fromId: labelToId[fromLabel],
      toId: labelToId[toLabel],
      pathLabel: p.label,
      numberOfArrows,
    })
    
    if (side) out.side = side
    // Keep label in canonical format for matching; use displayName for UI rendering
    out.label = p.label || undefined
    if (p.label) {
      out.displayName = convertToUnicode(p.label)
    } else {
      // No label: generate a readable unicode display name from the endpoint node labels
      const arrow = twoSided ? ' ↔ ' : ' → '
      out.displayName = convertToUnicode(fromLabel) + arrow + convertToUnicode(toLabel)
    }
    // Add value (defaults to 1.0, but preserve null for dataset paths)
    out.value = p.value !== undefined ? p.value : 1.0
    // freeParameter: true = free anonymous; non-empty string = free named; absent = fixed (never set false)
    if (p.freeParameter !== undefined && p.freeParameter !== false) out.freeParameter = p.freeParameter
    // Add optimization metadata: parameterType and optional overrides
    if (p.parameterType) out.parameterType = p.parameterType
    if (p.optimization) out.optimization = p.optimization
    if (p.visual && p.visual.midpointOffset) out.visual = { midpointOffset: p.visual.midpointOffset }
    return out
  })

  return { nodes: nodesOut, paths: pathsOut }
}

/**
 * Convert entire multi-model document to runtime format
 * Returns array of models with id, label, nodes, paths, and parameterTypes
 * Models are provided as a named dictionary in the schema
 */
export function convertDocToRuntime(doc: any): Array<{ id: string; label: string; nodes: Node[]; paths: Path[]; parameterTypes: Record<string, any> }> {
  const modelDict = doc.models || {}
  console.log('[RuntimeConverter] convertDocToRuntime called. Models:', Object.keys(modelDict))
  return Object.entries(modelDict).map(([modelId, model]: [string, any]) => {
    const label = model.label || modelId
    console.log('[RuntimeConverter] Processing model:', modelId, 'has', (model.nodes || []).length, 'nodes')
    const { nodes, paths } = convertModelToRuntime(model)
    console.log('[RuntimeConverter] Model conversion complete. Output nodes:', nodes.length, 'Sample node:', nodes.length > 0 ? { id: nodes[0].id, label: nodes[0].label, x: nodes[0].x, y: nodes[0].y } : 'none')
    // Extract parameterTypes from optimization section
    const parameterTypes = model.optimization?.parameterTypes || {}
    return { id: modelId, label, nodes, paths, parameterTypes }
  })
}
