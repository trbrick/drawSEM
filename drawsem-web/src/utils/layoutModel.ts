import { autoLayout } from './autoLayout'
import { modelToSchema } from './runtimeToSchema'
import type { RuntimeModel } from './runtimeToSchema'
import { isDatasetPath, nodeX, nodeY } from './helpers'
import type { Node, Path } from './helpers'
import { MANIFEST_DEFAULT_W } from './constants'

/**
 * Auto Layout for a runtime model: the one implementation behind both the
 * Auto Layout button and the layout applied when a positionless model is
 * loaded.
 *
 * With `excludeDatasets` (used outside the Data layer), dataset nodes are left
 * out of the layout, so a dataset does not split a row with constants such as
 * the mean node, and are then moved to the side (see repositionDatasetsToSide).
 *
 * Returns the model's nodes with new positions, or null when the layout gave
 * no variable node a usable, non-origin position. Throws if the layout
 * algorithm throws. The model is not modified.
 */
export function layoutModel(model: RuntimeModel, options: { excludeDatasets: boolean }): Node[] | null {
  const forLayout: RuntimeModel = options.excludeDatasets
    ? {
        ...model,
        nodes: model.nodes.filter((n) => n.type !== 'dataset'),
        paths: model.paths.filter((p) => !isDatasetPath(p, model.nodes)),
      }
    : model
  const positions = autoLayout(modelToSchema(forLayout, { forAutoLayout: true }))

  const usable = (pos: { x: number; y: number } | undefined): pos is { x: number; y: number } =>
    !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)
  const anyValid = model.nodes.some((n) => {
    const pos = positions[n.label]
    return n.type === 'variable' && usable(pos) && (pos.x !== 0 || pos.y !== 0)
  })
  if (!anyValid) return null

  let laidOut = model.nodes.map((n) => {
    const pos = positions[n.label]
    return usable(pos) ? { ...n, x: pos.x, y: pos.y } : n
  })
  if (options.excludeDatasets) laidOut = repositionDatasetsToSide(laidOut, model.paths)
  return laidOut
}

/**
 * Move dataset nodes to the right of the rest of the diagram, half a rank
 * above or below the row of variables they feed (keeping the side they were
 * on), so their data cables read as a side bus instead of sharing a row with
 * constants and tangling with mean paths. Multiple datasets stack in the order
 * of the rows they feed. (Ported from coordinate-expansion 0aec616.)
 */
export function repositionDatasetsToSide(allNodes: Node[], allPaths: Path[]): Node[] {
  const datasetNodes = allNodes.filter((n) => n.type === 'dataset')
  const others = allNodes.filter((n) => n.type !== 'dataset')
  if (datasetNodes.length === 0 || others.length === 0) return allNodes

  const SIDE_GAP = 90
  const STACK_GAP = 140
  const HALF_RANK = 75 // half of autoLayout's default rankHeight (150, see autoLayout.ts)
  let maxX = -Infinity
  others.forEach((n) => {
    maxX = Math.max(maxX, nodeX(n) + (n.width ?? MANIFEST_DEFAULT_W) / 2)
  })
  const sideX = maxX + SIDE_GAP

  const withTargetY = datasetNodes
    .map((ds) => {
      const targetYs = allPaths
        .filter((p) => p.from === ds.id && isDatasetPath(p, allNodes))
        .map((p) => others.find((n) => n.id === p.to))
        .filter((n): n is Node => n !== undefined)
        .map((n) => nodeY(n))
      const targetAvgY = targetYs.length > 0 ? targetYs.reduce((a, b) => a + b, 0) / targetYs.length : nodeY(ds)
      const wasAbove = nodeY(ds) < targetAvgY
      return { id: ds.id, y: targetAvgY + (wasAbove ? -HALF_RANK : HALF_RANK) }
    })
    .sort((a, b) => a.y - b.y)

  const yById = new Map(withTargetY.map((w, idx) => [w.id, w.y + (idx - (withTargetY.length - 1) / 2) * STACK_GAP]))
  return allNodes.map((n) => (n.type === 'dataset' ? { ...n, x: sideX, y: yById.get(n.id) ?? nodeY(n) } : n))
}

export type LoadLayoutResult = 'not-needed' | 'applied' | 'no-usable-positions'

/**
 * Auto Layout applied when a document is loaded into the editor: runs only
 * when the first model has variable nodes and NO node of it has a position
 * (a model that carries any layout is shown as written). Uses layoutModel(),
 * the same code as the Auto Layout button. When it runs, the runtime nodes of
 * `models[0]` get their new positions in place; nothing else changes. Throws
 * if the layout algorithm throws.
 */
export function layoutOnLoad(models: RuntimeModel[], options: { excludeDatasets: boolean }): LoadLayoutResult {
  const first = models[0]
  if (!first) return 'not-needed'
  const hasVariables = first.nodes.some((n) => n.type === 'variable')
  const anyPositioned = first.nodes.some((n) => n.x !== undefined || n.y !== undefined)
  if (!hasVariables || anyPositioned) return 'not-needed'

  const laidOut = layoutModel(first, options)
  if (!laidOut) return 'no-usable-positions'
  const byId = new Map(laidOut.map((n) => [n.id, n]))
  first.nodes.forEach((n) => {
    const placed = byId.get(n.id)
    if (placed && placed.x !== undefined && placed.y !== undefined) {
      n.x = placed.x
      n.y = placed.y
    }
  })
  return 'applied'
}
