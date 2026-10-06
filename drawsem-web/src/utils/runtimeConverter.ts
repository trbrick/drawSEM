import { convertToUnicode } from './converters'
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
      label: label,
      displayName: convertToUnicode(label),
      type: n.type || 'variable'
    }
    // Position and size are set only when present: an absent x/y means the node
    // is unplaced, an absent width/height means the renderer decides. Defaults
    // are applied where they are used, never stored.
    if (typeof visual.x === 'number' && !isNaN(visual.x)) out.x = visual.x
    if (typeof visual.y === 'number' && !isNaN(visual.y)) out.y = visual.y
    if (typeof visual.width === 'number') out.width = visual.width
    if (typeof visual.height === 'number') out.height = visual.height
    // Copy optional fields
    if (n.description) out.description = n.description
    if (n.tags) out.tags = n.tags
    if (n.bindingMappings) out.bindingMappings = n.bindingMappings
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
    const numberOfArrows = typeof p.numberOfArrows === 'number' ? p.numberOfArrows : (p.type === 'data' ? undefined : 1)
    const twoSided = numberOfArrows !== undefined ? numberOfArrows >= 2 : false
    const side = p.visual && p.visual.loopSide ? p.visual.loopSide : undefined
    const idBase = p.id || ('p_' + (p.label || `${fromLabel}_to_${toLabel}`).replace(/\s+/g, '_'))
    const id = mkPathId(idBase)
    const out: any = { id, from: labelToId[fromLabel], to: labelToId[toLabel], twoSided }

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
    // value: absent stays absent (the schema default 1.0 is applied at use); null is kept
    if (p.value !== undefined) out.value = p.value
    // freeParameter: true = free anonymous; non-empty string = free named; absent = fixed (never set false)
    if (p.freeParameter !== undefined && p.freeParameter !== false) out.freeParameter = p.freeParameter
    // Add path type if present
    if (p.type) out.type = p.type
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
  return Object.entries(modelDict).map(([modelId, model]: [string, any]) => {
    const label = model.label || modelId
    const { nodes, paths } = convertModelToRuntime(model)
    // Extract parameterTypes from optimization section
    const parameterTypes = model.optimization?.parameterTypes || {}
    return { id: modelId, label, nodes, paths, parameterTypes }
  })
}

/**
 * Document-level keys the editor does not own (everything except `models`),
 * deep-copied so they can be re-emitted verbatim by `modelsToSchema`.
 */
export function docPassthroughOf(doc: any): Record<string, any> {
  const { models: _models, ...rest } = doc || {}
  return JSON.parse(JSON.stringify(rest))
}
