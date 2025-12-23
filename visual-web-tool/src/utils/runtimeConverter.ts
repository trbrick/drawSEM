import { convertToUnicode } from './converters'
import { MANIFEST_DEFAULT_W, MANIFEST_DEFAULT_H, DATASET_DEFAULT_W, DATASET_DEFAULT_H } from './constants'
import { Node, Path } from './helpers'

// Convert a validated schema document to the CanvasTool runtime nodes/paths
export function convertDocToRuntime(doc: any): { nodes: Node[]; paths: Path[] } {
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

  const nodesOut: Node[] = (doc.nodes || []).map((n: any) => {
    const label = n.label || 'node'
    // Apply Unicode converter when loading (convert LaTeX to Unicode display)
    const displayLabel = convertToUnicode(label)
    let base = n.id || slugifyLabel(label)
    base = base.replace(/^p_/, 'n_')
    const id = uniqueId(base)
    labelToId[label] = id
    const visual = n.visual || {}
    const out: any = {
      id,
      x: typeof visual.x === 'number' ? visual.x : 0,
      y: typeof visual.y === 'number' ? visual.y : 0,
      label: displayLabel,
      type: n.type || 'manifest'
    }
    if (out.type === 'manifest') {
      out.width = typeof visual.width === 'number' ? visual.width : MANIFEST_DEFAULT_W
      out.height = typeof visual.height === 'number' ? visual.height : MANIFEST_DEFAULT_H
    } else if (out.type === 'dataset') {
      out.width = typeof visual.width === 'number' ? visual.width : DATASET_DEFAULT_W
      out.height = typeof visual.height === 'number' ? visual.height : DATASET_DEFAULT_H
    }
    // Copy optional fields
    if (n.levelOfMeasurement) out.levelOfMeasurement = n.levelOfMeasurement
    if (n.mappings) out.mappings = n.mappings
    if (n.datasetFile) out.datasetFile = n.datasetFile
    return out
  })

  function mkPathId(base: string) {
    return uniqueId(base.replace(/^p_/, 'p_'))
  }

  const pathsOut: Path[] = (doc.paths || []).map((p: any) => {
    const fromLabel = p.fromLabel
    const toLabel = p.toLabel
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
    if (side) out.side = side
    // Apply Unicode converter to path labels when loading (convert LaTeX to Unicode display)
    out.label = p.label ? convertToUnicode(p.label) : undefined
    // Add value (defaults to 1.0, but preserve null for dataset paths)
    out.value = p.value !== undefined ? p.value : 1.0
    out.free = (p.free === 'fixed' || p.free === 'free') ? p.free : 'free'
    // Add optimization metadata: parameterType and optional overrides
    if (p.parameterType) out.parameterType = p.parameterType
    if (p.optimization) out.optimization = p.optimization
    if (p.visual && p.visual.midpointOffset) out.visual = { midpointOffset: p.visual.midpointOffset }
    return out
  })

  return { nodes: nodesOut, paths: pathsOut }
}
