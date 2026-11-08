/**
 * Which nodes and paths belong to a view layer: one set of rules for the
 * canvas and for image export.
 */

import type { ActiveLayer } from '../core/types'

/** Opacity of on-layer elements and of off-layer ones per offLayerVisibility. */
export const DISPLAY_OPACITY = {
  highlighted: 1,
  transparent: 0.25,
  invisible: 0,
}

interface LayerNode {
  type: string
}

interface LayerPath {
  type?: string
}

/**
 * The SEM layer holds everything but dataset nodes; the Data layer holds
 * dataset nodes and manifest variables. `isManifest` says whether a node is
 * drawn as a manifest variable.
 */
export function isNodeInLayer<N extends LayerNode>(node: N, layer: ActiveLayer, isManifest: (node: N) => boolean): boolean {
  if (layer === 'all') return true
  if (layer === 'sem') return node.type !== 'dataset'
  if (layer === 'data') return node.type === 'dataset' || isManifest(node)
  return false
}

/**
 * The SEM layer holds paths that don't start at a dataset node; the Data layer
 * holds data paths into manifest variables. `fromNode` and `toNode` are the
 * path's endpoints (undefined when missing).
 */
export function isPathInLayer<N extends LayerNode>(
  path: LayerPath,
  fromNode: N | undefined,
  toNode: N | undefined,
  layer: ActiveLayer,
  isManifest: (node: N) => boolean
): boolean {
  if (layer === 'all') return true
  if (layer === 'sem') return fromNode?.type !== 'dataset'
  if (layer === 'data') {
    const isDataPath = path.type === 'data' || fromNode?.type === 'dataset'
    return isDataPath && !!toNode && isManifest(toNode)
  }
  return false
}
