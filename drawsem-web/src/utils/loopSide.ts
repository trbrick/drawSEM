/**
 * Self-loop (variance) side selection.
 *
 * Rule (same as node width/height): an absent loop side is automatic, chosen by
 * the renderer from current positions; a stored side (runtime `Path.side`,
 * schema `visual.loopSide`) is pinned by the user. The automatic side is
 * computed at render time only and is never written to state or the schema.
 *
 * CanvasTool (runtime nodes/paths, id-based) and svgRenderer (schema nodes/paths,
 * label-based) both resolve the side through this module so the canvas and an
 * exported image always agree.
 */

export type LoopSide = 'top' | 'right' | 'bottom' | 'left'

export interface Point {
  x: number
  y: number
}

/** Sides in tie-break preference order. */
export const LOOP_SIDES: readonly LoopSide[] = ['bottom', 'top', 'right', 'left']

/** Unit direction of each side in screen coordinates (y grows downward). */
export const LOOP_SIDE_DIRECTIONS: Record<LoopSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

/** Sides whose clearance is within this many degrees of the best count as tied. */
export const LOOP_SIDE_TIE_TOLERANCE_DEG = 10

/**
 * Pick the side of a node on which to draw its self-loop.
 *
 * Each side is scored by its clearance: the smallest angle (degrees) between the
 * side's direction and the direction from `center` to any of `otherEndpoints`.
 * The side with the largest clearance wins; sides within
 * LOOP_SIDE_TIE_TOLERANCE_DEG of the best are tied and resolved in the order
 * bottom, top, right, left (the tolerance also damps flicker while dragging).
 * No incident directions (or only endpoints coinciding with the center): bottom.
 */
export function autoLoopSide(center: Point, otherEndpoints: readonly Point[]): LoopSide {
  const angles: number[] = []
  for (const p of otherEndpoints) {
    const dx = p.x - center.x
    const dy = p.y - center.y
    if (Math.hypot(dx, dy) < 1e-9) continue
    angles.push(Math.atan2(dy, dx))
  }
  if (angles.length === 0) return 'bottom'

  const clearance = (side: LoopSide): number => {
    const d = LOOP_SIDE_DIRECTIONS[side]
    const sa = Math.atan2(d.y, d.x)
    let min = Infinity
    for (const a of angles) {
      let diff = Math.abs(a - sa) % (2 * Math.PI)
      if (diff > Math.PI) diff = 2 * Math.PI - diff
      if (diff < min) min = diff
    }
    return (min * 180) / Math.PI
  }

  const scores = LOOP_SIDES.map((s) => clearance(s))
  const best = Math.max(...scores)
  const idx = scores.findIndex((sc) => sc >= best - LOOP_SIDE_TIE_TOLERANCE_DEG)
  return LOOP_SIDES[idx]
}

/** Nearest of the four sides to `point` as seen from `center` (for drag-to-pin). */
export function nearestLoopSide(center: Point, point: Point): LoopSide {
  const dx = point.x - center.x
  const dy = point.y - center.y
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy < 0 ? 'top' : 'bottom'
}

const finiteOr0 = (v: number | undefined) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)

interface EndpointPath {
  from: string
  to: string
  type?: string
}

/**
 * The automatic side for the node `nodeKey`, computed from the positions of
 * the other endpoints of every non-self-loop path incident to the loop's node.
 * `positionOf` returns undefined for an endpoint that names no node (such paths
 * are ignored). Data paths are ignored too (`type: "data"`, or any path from a
 * node `isDataset` reports): they are drawn as cables that do not run straight
 * to the dataset, so their direction says little about where a loop fits.
 */
function autoLoopSideFor(
  nodeKey: string,
  paths: readonly EndpointPath[],
  positionOf: (key: string) => Point | undefined,
  isDataset: (key: string) => boolean
): LoopSide {
  const center = positionOf(nodeKey)
  if (!center) return 'bottom'
  const others: Point[] = []
  for (const p of paths) {
    if (p.from === p.to) continue
    if (p.type === 'data' || isDataset(p.from)) continue
    let other: string | null = null
    if (p.from === nodeKey) other = p.to
    else if (p.to === nodeKey) other = p.from
    if (other === null) continue
    const pos = positionOf(other)
    if (pos) others.push(pos)
  }
  return autoLoopSide(center, others)
}

/**
 * Effective side for a runtime self-loop path (CanvasTool): `path.side` if
 * pinned, else automatic. Runtime endpoints are node ids; an unplaced node
 * (absent x/y) counts as 0,0, the same place the canvas draws it.
 */
export function effectiveLoopSide(
  path: { from: string; side?: LoopSide },
  nodes: readonly { id: string; x?: number; y?: number; type?: string }[],
  paths: readonly EndpointPath[]
): LoopSide {
  if (path.side) return path.side
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return autoLoopSideFor(
    path.from,
    paths,
    (id) => {
      const n = byId.get(id)
      return n ? { x: n.x ?? 0, y: n.y ?? 0 } : undefined
    },
    (id) => byId.get(id)?.type === 'dataset'
  )
}

/**
 * Effective side for a schema self-loop path (svgRenderer): `visual.loopSide` if
 * pinned, else automatic. Schema endpoints are node labels; an unplaced node
 * (absent visual.x/y) counts as 0,0, consistent with the canvas.
 */
export function effectiveSchemaLoopSide(
  path: { from: string; visual?: { loopSide?: LoopSide } },
  nodes: readonly { label: string; type?: string; visual?: { x?: number; y?: number } }[],
  paths: readonly EndpointPath[]
): LoopSide {
  const pinned = path.visual?.loopSide
  if (pinned) return pinned
  const byLabel = new Map(nodes.map((n) => [n.label, n]))
  return autoLoopSideFor(
    path.from,
    paths,
    (label) => {
      const n = byLabel.get(label)
      return n ? { x: finiteOr0(n.visual?.x), y: finiteOr0(n.visual?.y) } : undefined
    },
    (label) => byLabel.get(label)?.type === 'dataset'
  )
}
