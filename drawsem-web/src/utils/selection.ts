/**
 * The editor's selection: any number of nodes and paths at once, held as one
 * immutable value (runtime ids, never serialized). Pure helpers, no React.
 *
 * Every function that "changes" a selection returns a new object, or the same
 * object when nothing changed (so a React state update can bail out).
 */

export interface Selection {
  readonly nodeIds: readonly string[]
  readonly pathIds: readonly string[]
}

export type SelectionKind = 'node' | 'path'

export const EMPTY_SELECTION: Selection = Object.freeze({ nodeIds: [], pathIds: [] }) as Selection

/** A selection holding just one element. */
export function selectionOf(kind: SelectionKind, id: string): Selection {
  return kind === 'node' ? { nodeIds: [id], pathIds: [] } : { nodeIds: [], pathIds: [id] }
}

export function selectionSize(s: Selection): number {
  return s.nodeIds.length + s.pathIds.length
}

export function isInSelection(s: Selection, kind: SelectionKind, id: string): boolean {
  return (kind === 'node' ? s.nodeIds : s.pathIds).includes(id)
}

/** Add the element if it is not selected, remove it if it is. */
export function toggleInSelection(s: Selection, kind: SelectionKind, id: string): Selection {
  const ids = kind === 'node' ? s.nodeIds : s.pathIds
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  return kind === 'node' ? { nodeIds: next, pathIds: s.pathIds } : { nodeIds: s.nodeIds, pathIds: next }
}

/** Everything in `a` plus whatever of `b` is not already in it (order kept). */
export function unionSelections(a: Selection, b: Selection): Selection {
  const add = (xs: readonly string[], ys: readonly string[]) => {
    const seen = new Set(xs)
    return [...xs, ...ys.filter((y) => !seen.has(y))]
  }
  return { nodeIds: add(a.nodeIds, b.nodeIds), pathIds: add(a.pathIds, b.pathIds) }
}

/** Drop ids that are not in the given sets (e.g. after an undo removed them). */
export function pruneSelection(s: Selection, nodeIds: ReadonlySet<string>, pathIds: ReadonlySet<string>): Selection {
  const keptNodes = s.nodeIds.filter((id) => nodeIds.has(id))
  const keptPaths = s.pathIds.filter((id) => pathIds.has(id))
  if (keptNodes.length === s.nodeIds.length && keptPaths.length === s.pathIds.length) return s
  if (keptNodes.length === 0 && keptPaths.length === 0) return EMPTY_SELECTION
  return { nodeIds: keptNodes, pathIds: keptPaths }
}

/** Order-independent equality. */
export function sameSelection(a: Selection, b: Selection): boolean {
  if (a === b) return true
  if (a.nodeIds.length !== b.nodeIds.length || a.pathIds.length !== b.pathIds.length) return false
  const bn = new Set(b.nodeIds)
  const bp = new Set(b.pathIds)
  return a.nodeIds.every((id) => bn.has(id)) && a.pathIds.every((id) => bp.has(id))
}

/** Axis-aligned box in canvas (SVG) coordinates. */
export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** The box spanned by two corner points, in either order. */
export function boundsFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Bounds {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }
}

export function boundsContain(outer: Bounds, inner: Bounds): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY
}

/** The smallest box around all of `boxes`, or null when there are none. */
export function unionBounds(boxes: readonly Bounds[]): Bounds | null {
  if (boxes.length === 0) return null
  return boxes.reduce((u, b) => ({
    minX: Math.min(u.minX, b.minX),
    minY: Math.min(u.minY, b.minY),
    maxX: Math.max(u.maxX, b.maxX),
    maxY: Math.max(u.maxY, b.maxY),
  }))
}

/**
 * What a selection rectangle selects. `nodes` and `paths` are the candidates:
 * the caller passes only elements in the active layer.
 *   - a node is selected when its whole bounding box lies inside `rect`;
 *   - a path is selected when both its endpoints are selected (counting the
 *     nodes already in `base`, so an additive drag picks up paths between old
 *     and new nodes).
 * With `base` (an additive drag) the result is `base` plus those elements;
 * without it, just those elements.
 */
export function marqueeSelection(
  rect: Bounds,
  nodes: readonly { id: string; bounds: Bounds }[],
  paths: readonly { id: string; from: string; to: string }[],
  base: Selection | null
): Selection {
  const hit: Selection = {
    nodeIds: nodes.filter((n) => boundsContain(rect, n.bounds)).map((n) => n.id),
    pathIds: [],
  }
  const withNodes = base ? unionSelections(base, hit) : hit
  const endpoints = new Set(withNodes.nodeIds)
  const pathIds = paths.filter((p) => endpoints.has(p.from) && endpoints.has(p.to)).map((p) => p.id)
  return unionSelections(withNodes, { nodeIds: [], pathIds })
}
