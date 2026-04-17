/**
 * coordinateExpansion.ts
 *
 * Core logic for the coordinate-expansion prototype.
 * Handles:
 *   - Computing the bounding box of a group's template nodes
 *   - Generating the position of each expanded instance
 *   - Expanding schema paths into per-instance runtime path copies
 *
 * See Noise files/COORDINATE-EXPANSION-UI-SPEC.md for the full spec.
 *
 * TODO (cross-group lag paths): Paths between two different repeat groups
 * where a lag is desired require both groups to share the same coordinate
 * index. This is out of scope for the current prototype.
 */

import { CoordinateRule } from '../core/types'
import { Node, Path, RuntimeRepeatGroup } from './helpers'

// ---------------------------------------------------------------------------
// Bounding box helpers
// ---------------------------------------------------------------------------

const LATENT_RADIUS = 36
const MANIFEST_DEFAULT_W = 60
const MANIFEST_DEFAULT_H = 60
const GROUP_PADDING = 24   // canvas units of padding inside the group box border

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

/**
 * Compute the axis-aligned bounding box for a list of nodes.
 * Returns a bbox padded by GROUP_PADDING on all sides.
 */
export function computeGroupBBox(nodes: Node[]): BBox {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const n of nodes) {
    let halfW: number
    let halfH: number
    if (n.type === 'variable') {
      // Use stored width/height; fall back to latent radius if not set
      halfW = n.width != null ? n.width / 2 : LATENT_RADIUS
      halfH = n.height != null ? n.height / 2 : LATENT_RADIUS
    } else if (n.type === 'dataset') {
      halfW = (n.width ?? MANIFEST_DEFAULT_W) / 2
      halfH = (n.height ?? MANIFEST_DEFAULT_H) / 2
    } else {
      // constant — triangle approximation
      halfW = 20
      halfH = 22
    }
    minX = Math.min(minX, n.x - halfW)
    minY = Math.min(minY, n.y - halfH)
    maxX = Math.max(maxX, n.x + halfW)
    maxY = Math.max(maxY, n.y + halfH)
  }

  const padded = {
    minX: minX - GROUP_PADDING,
    minY: minY - GROUP_PADDING,
    maxX: maxX + GROUP_PADDING,
    maxY: maxY + GROUP_PADDING,
  }
  return {
    ...padded,
    width: padded.maxX - padded.minX,
    height: padded.maxY - padded.minY,
  }
}

// ---------------------------------------------------------------------------
// Instance position helpers
// ---------------------------------------------------------------------------

/**
 * Compute the top-left origin (x, y) of instance k given the group's visual config.
 * Instance 0 is the template; instances 1..N-1 are offset copies.
 */
export function instanceOrigin(
  group: RuntimeRepeatGroup,
  instanceIndex: number
): { x: number; y: number } {
  const { templateX, templateY, instanceWidth, instanceHeight, instanceSpacing, axis } =
    group.visual

  if (axis === 'horizontal') {
    return {
      x: templateX + instanceIndex * (instanceWidth + instanceSpacing),
      y: templateY,
    }
  } else {
    // vertical — deferred but fully computed for completeness
    return {
      x: templateX,
      y: templateY + instanceIndex * (instanceHeight + instanceSpacing),
    }
  }
}

/**
 * For a given template node and instance index, compute the canvas position
 * of that node in that instance.
 *
 * The template node's position is relative to the group bbox origin (templateX, templateY).
 * Each instance is offset by instanceIndex * (instanceWidth + instanceSpacing).
 */
export function instanceNodePosition(
  templateNode: Node,
  group: RuntimeRepeatGroup,
  instanceIndex: number
): { x: number; y: number } {
  const origin = instanceOrigin(group, instanceIndex)
  // Offset of this node within the template
  const offsetX = templateNode.x - group.visual.templateX
  const offsetY = templateNode.y - group.visual.templateY
  return {
    x: origin.x + offsetX,
    y: origin.y + offsetY,
  }
}

// ---------------------------------------------------------------------------
// Path expansion
// ---------------------------------------------------------------------------

/**
 * Resolve coordinateRule to a list of instance indices to connect.
 * For lag paths, this is always all valid pairs; coordinateRule is ignored.
 */
function resolveCoordinateRule(
  rule: CoordinateRule | undefined,
  instanceCount: number
): number[] {
  if (rule === undefined || rule === 'all') {
    return Array.from({ length: instanceCount }, (_, i) => i)
  }
  if (rule === 'first') return instanceCount > 0 ? [0] : []
  if (rule === 'last') return instanceCount > 0 ? [instanceCount - 1] : []
  if (typeof rule === 'object' && 'index' in rule) {
    const idx = rule.index
    return idx >= 0 && idx < instanceCount ? [idx] : []
  }
  return Array.from({ length: instanceCount }, (_, i) => i)
}

/**
 * Describes a single expanded path copy that the renderer should draw.
 * These are ephemeral (derived from schema + group state); never persisted.
 */
export interface ExpandedPath {
  /** Synthetic id for React key purposes: original path id + instance info */
  id: string
  /** Runtime node id of the source */
  fromNodeId: string
  /** Runtime node id of the target */
  toNodeId: string
  /** The original schema path (for visual properties, labels, etc.) */
  templatePath: Path
  /** Source instance index (for display: badge, label subscript, etc.) */
  fromInstance: number
  /** Target instance index */
  toInstance: number
}

/**
 * Expand a single template path into all its runtime copies for a group.
 *
 * Cases:
 *   A. Both endpoints are template nodes in the same group
 *      → duplicated per coordinateRule + lag
 *   B. One endpoint is in the group, the other is external
 *      → external node is fixed; coordinateRule selects which instances
 *   C. Neither endpoint is in the group
 *      → not a group path; return as-is (single copy)
 *
 * Cross-group lags (case where from and to belong to DIFFERENT groups) are
 * out of scope. They are returned unchanged with a single copy. TODO when
 * cross-group support is added: check both endpoints' group membership and
 * require matching coordinate index.
 */
export function expandPath(
  path: Path,
  group: RuntimeRepeatGroup,
  /** Map from template node id → [instance0Id, instance1Id, ...] */
  instanceNodeIds: Map<string, string[]>
): ExpandedPath[] {
  const fromInstances = instanceNodeIds.get(path.from)
  const toInstances = instanceNodeIds.get(path.to)

  const fromInGroup = fromInstances !== undefined
  const toInGroup = toInstances !== undefined

  const N = group.instanceCount
  const lag = path.lag ?? 0
  const rule = path.coordinateRule

  // Case C: path not involving this group at all
  if (!fromInGroup && !toInGroup) {
    return [{
      id: path.id,
      fromNodeId: path.from,
      toNodeId: path.to,
      templatePath: path,
      fromInstance: -1,
      toInstance: -1,
    }]
  }

  // Case A: both endpoints in the same group
  if (fromInGroup && toInGroup) {
    if (lag === 0) {
      // Same-instance — coordinateRule applies
      const indices = resolveCoordinateRule(rule, N)
      return indices.map((k) => ({
        id: `${path.id}__k${k}`,
        fromNodeId: fromInstances![k],
        toNodeId: toInstances![k],
        templatePath: path,
        fromInstance: k,
        toInstance: k,
      }))
    } else {
      // Cross-instance lag — coordinateRule ignored, all valid pairs generated
      const results: ExpandedPath[] = []
      for (let k = 0; k < N; k++) {
        const target = k + lag
        if (target < 0 || target >= N) continue  // silently drop out-of-bounds
        results.push({
          id: `${path.id}__k${k}_t${target}`,
          fromNodeId: fromInstances![k],
          toNodeId: toInstances![target],
          templatePath: path,
          fromInstance: k,
          toInstance: target,
        })
      }
      return results
    }
  }

  // Case B: one endpoint is external
  // coordinateRule selects which instance(s) the external endpoint connects to
  const indices = resolveCoordinateRule(rule, N)
  if (fromInGroup && !toInGroup) {
    return indices.map((k) => ({
      id: `${path.id}__k${k}`,
      fromNodeId: fromInstances![k],
      toNodeId: path.to,
      templatePath: path,
      fromInstance: k,
      toInstance: -1,
    }))
  } else {
    // !fromInGroup && toInGroup
    return indices.map((k) => ({
      id: `${path.id}__k${k}`,
      fromNodeId: path.from,
      toNodeId: toInstances![k],
      templatePath: path,
      fromInstance: -1,
      toInstance: k,
    }))
  }
}

// ---------------------------------------------------------------------------
// Instance node id map builder
// ---------------------------------------------------------------------------

/**
 * Given a group and its template nodes, build a map from
 * templateNodeId → [instance0Id, instance1Id, ..., instance(N-1)Id].
 *
 * Instance 0 reuses the original template node id.
 * Instances 1..N-1 get synthetic ids: `${templateId}__inst${k}`.
 */
export function buildInstanceNodeIdMap(
  group: RuntimeRepeatGroup
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const templateId of group.nodeIds) {
    const ids: string[] = [templateId]  // instance 0 = original node
    for (let k = 1; k < group.instanceCount; k++) {
      ids.push(`${templateId}__inst${k}`)
    }
    map.set(templateId, ids)
  }
  return map
}

/**
 * Generate the full list of runtime nodes for all instances of a group.
 * Instance 0 nodes are the original template nodes (positions unchanged).
 * Instances 1..N-1 are new node objects with derived ids and positions.
 */
export function expandGroupNodes(
  templateNodes: Node[],
  group: RuntimeRepeatGroup,
  instanceNodeIds: Map<string, string[]>
): Node[] {
  const result: Node[] = []

  for (const template of templateNodes) {
    const ids = instanceNodeIds.get(template.id)
    if (!ids) continue

    // Instance 0: original node, position unchanged
    result.push(template)

    // Instances 1..N-1
    for (let k = 1; k < group.instanceCount; k++) {
      const pos = instanceNodePosition(template, group, k)
      result.push({
        ...template,
        id: ids[k],
        x: pos.x,
        y: pos.y,
        // Per-instance display label (e.g. "I₁", "I₂")
        displayName: `${template.displayName ?? template.label}${subscript(k)}`,
      })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Subscript helper for instance badges
// ---------------------------------------------------------------------------

const SUB_DIGITS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
}

export function subscript(n: number): string {
  return String(n).split('').map(c => SUB_DIGITS[c] ?? c).join('')
}

// ---------------------------------------------------------------------------
// Drag-handle snap helper
// ---------------------------------------------------------------------------

const HANDLE_WIDTH = 16  // px (canvas units) width of the drag handle hit area

/**
 * Given a drag delta (in canvas units) and the current group visual config,
 * compute the new instance count by snapping to grid.
 *
 * The threshold for adding one instance is (instanceWidth + instanceSpacing).
 * Dragging leftward past the threshold removes the last instance (minimum 1).
 */
export function computeInstanceCountFromDrag(
  group: RuntimeRepeatGroup,
  dragDeltaX: number
): number {
  const step = group.visual.instanceWidth + group.visual.instanceSpacing
  if (step <= 0) return group.instanceCount
  // How many additional instances does the drag represent?
  const delta = Math.round(dragDeltaX / step)
  return Math.max(1, group.instanceCount + delta)
}

/**
 * Returns the canvas-space x coordinate of the right-edge drag handle
 * for a group in its current state (expanded or collapsed).
 */
export function groupHandleX(group: RuntimeRepeatGroup): number {
  const { templateX, instanceWidth, instanceSpacing, axis } = group.visual
  if (axis === 'horizontal') {
    return (
      templateX +
      group.instanceCount * (instanceWidth + instanceSpacing) -
      instanceSpacing +
      HANDLE_WIDTH / 2
    )
  }
  // vertical axis — handle is on right edge of template
  return templateX + instanceWidth + HANDLE_WIDTH / 2
}
