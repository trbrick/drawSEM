import { convertToUnicode } from './converters'
import {
  Node,
  Path,
  DANGLING_ENDPOINT_PREFIX,
  OWNED_DOC_KEYS,
  OWNED_MODEL_KEYS,
  OWNED_NODE_KEYS,
  OWNED_PATH_KEYS,
  passthroughOf,
} from './helpers'
import type { RuntimeModel } from './runtimeToSchema'

/**
 * Convert a single model object (from schema.models[n]) to runtime format.
 *
 * Only values present in the input are set on the runtime objects: nothing is
 * defaulted here (an absent position means "unplaced", an absent size means
 * "renderer decides", an absent path value means the schema default). Keys the
 * editor does not own are kept in `passthrough` for a lossless round trip.
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
    const label = n.label
    // Keep label in canonical format; use displayName for UI rendering with unicode
    let base = n.id || slugifyLabel(label ?? 'node')
    base = base.replace(/^p_/, 'n_')
    const id = uniqueId(base)
    labelToId[label] = id
    const visual = n.visual || {}
    const out: any = {
      id,
      label: label,
      displayName: convertToUnicode(label ?? ''),
      type: n.type || 'variable',
    }
    // Position and size are set only when present: an absent x/y means the node
    // is unplaced, an absent width/height means the renderer decides. Defaults
    // are applied where they are used, never stored.
    if (typeof visual.x === 'number' && !isNaN(visual.x)) out.x = visual.x
    if (typeof visual.y === 'number' && !isNaN(visual.y)) out.y = visual.y
    if (typeof visual.width === 'number') out.width = visual.width
    if (typeof visual.height === 'number') out.height = visual.height
    // Owned optional fields: copied exactly when present (an empty string stays "").
    if (n.description !== undefined) out.description = n.description
    if (n.tags !== undefined) out.tags = n.tags
    if (n.bindingMappings !== undefined) out.bindingMappings = n.bindingMappings
    if (n.datasetSource !== undefined) out.datasetSource = n.datasetSource
    if (n.variableCharacteristics !== undefined) out.variableCharacteristics = n.variableCharacteristics
    const passthrough = passthroughOf(n, OWNED_NODE_KEYS)
    if (Object.keys(passthrough).length > 0) out.passthrough = passthrough
    return out
  })

  // A path endpoint that names no node keeps its label, behind a prefix no node
  // id can have, so the serializer can write it back unchanged.
  const endpointId = (label: string) => labelToId[label] ?? DANGLING_ENDPOINT_PREFIX + label

  const pathsOut: Path[] = (model.paths || []).map((p: any) => {
    const fromLabel = p.from
    const toLabel = p.to
    const numberOfArrows = typeof p.numberOfArrows === 'number' ? p.numberOfArrows : (p.type === 'data' ? undefined : 1)
    const twoSided = numberOfArrows !== undefined ? numberOfArrows >= 2 : false
    const idBase = p.id || ('p_' + (p.label || `${fromLabel}_to_${toLabel}`).replace(/\s+/g, '_'))
    const id = uniqueId(idBase)
    const out: any = { id, from: endpointId(fromLabel), to: endpointId(toLabel), twoSided }

    if (p.visual?.loopSide !== undefined) out.side = p.visual.loopSide
    // label: kept exactly, including null and "" (canonical form, used for matching)
    if ('label' in p) out.label = p.label
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
    if (p.type !== undefined) out.type = p.type
    if (p.parameterType !== undefined) out.parameterType = p.parameterType
    if (p.optimization !== undefined) out.optimization = p.optimization
    if (p.visual?.midpointOffset !== undefined) out.visual = { midpointOffset: p.visual.midpointOffset }
    const passthrough = passthroughOf(p, OWNED_PATH_KEYS)
    if (Object.keys(passthrough).length > 0) out.passthrough = passthrough
    return out
  })

  return { nodes: nodesOut, paths: pathsOut }
}

/**
 * Convert entire multi-model document to runtime format.
 * Returns one RuntimeModel per entry of the schema's `models` dictionary (the
 * dictionary key becomes the runtime model id). Document-level keys are not
 * part of the result; capture them with `docPassthroughOf`.
 */
export function convertDocToRuntime(doc: any): RuntimeModel[] {
  const modelDict = doc.models || {}
  return Object.entries(modelDict).map(([modelId, model]: [string, any]) => {
    const { nodes, paths } = convertModelToRuntime(model)
    const out: RuntimeModel = { id: modelId, label: model.label, nodes, paths }
    // parameterTypes: owned, kept exactly (absent stays absent)
    if (model.optimization?.parameterTypes !== undefined) out.parameterTypes = model.optimization.parameterTypes
    // the saved view (visualization.viewport / activeLayer / offLayerVisibility): owned, kept exactly
    const vis = model.visualization
    if (vis && typeof vis === 'object') {
      const view: Record<string, any> = {}
      for (const k of OWNED_MODEL_KEYS.nested.visualization) if (vis[k] !== undefined) view[k] = JSON.parse(JSON.stringify(vis[k]))
      if (Object.keys(view).length > 0) out.visualization = view
    }
    const passthrough = passthroughOf(model, OWNED_MODEL_KEYS)
    if (Object.keys(passthrough).length > 0) out.passthrough = passthrough
    return out
  })
}

/**
 * Document-level keys the editor does not own (everything except `models`,
 * e.g. `schemaVersion` and `meta`), deep-copied so they can be re-emitted
 * verbatim by `modelsToSchema`.
 */
export function docPassthroughOf(doc: any): Record<string, any> {
  return passthroughOf(doc, OWNED_DOC_KEYS)
}
