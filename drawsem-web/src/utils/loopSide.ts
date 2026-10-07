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
  return rankLoopSides(center, otherEndpoints)[0]
}

/**
 * All four sides in order of preference by the rule above: the first is
 * autoLoopSide()'s choice, the next is that rule applied to the remaining
 * sides, and so on.
 */
export function rankLoopSides(center: Point, otherEndpoints: readonly Point[]): LoopSide[] {
  const angles: number[] = []
  for (const p of otherEndpoints) {
    const dx = p.x - center.x
    const dy = p.y - center.y
    if (Math.hypot(dx, dy) < 1e-9) continue
    angles.push(Math.atan2(dy, dx))
  }
  if (angles.length === 0) return [...LOOP_SIDES]

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

  const remaining = [...LOOP_SIDES]
  const ranked: LoopSide[] = []
  while (remaining.length > 0) {
    const scores = remaining.map((side) => clearance(side))
    const best = Math.max(...scores)
    const idx = scores.findIndex((sc) => sc >= best - LOOP_SIDE_TIE_TOLERANCE_DEG)
    ranked.push(remaining.splice(idx, 1)[0])
  }
  return ranked
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
  return rankLoopSidesFor(nodeKey, paths, positionOf, isDataset)[0]
}

function rankLoopSidesFor(
  nodeKey: string,
  paths: readonly EndpointPath[],
  positionOf: (key: string) => Point | undefined,
  isDataset: (key: string) => boolean
): LoopSide[] {
  const center = positionOf(nodeKey)
  if (!center) return [...LOOP_SIDES]
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
  return rankLoopSides(center, others)
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

// ---- choosing all loops together -------------------------------------------------

/** Loop size, as drawn (CanvasTool/svgRenderer buildSelfLoopPoints). */
export const LOOP_RADIUS = 20
export const LOOP_GAP = 6

/** A node's centre and half extents (a circle is described by its bounding box). */
export interface NodeShape {
  x: number
  y: number
  halfW: number
  halfH: number
}

// Where a loop on `side` of `shape` sits, approximated as a circle of LOOP_RADIUS.
function loopCenter(shape: NodeShape, side: LoopSide): Point {
  const d = LOOP_SIDE_DIRECTIONS[side]
  const reach = (side === 'left' || side === 'right' ? shape.halfW : shape.halfH) + LOOP_GAP + LOOP_RADIUS
  return { x: shape.x + d.x * reach, y: shape.y + d.y * reach }
}

function loopHitsShape(c: Point, shape: NodeShape): boolean {
  const dx = Math.max(Math.abs(c.x - shape.x) - shape.halfW, 0)
  const dy = Math.max(Math.abs(c.y - shape.y) - shape.halfH, 0)
  return Math.hypot(dx, dy) < LOOP_RADIUS
}

/**
 * Sides for all self-loops of a model, chosen together so loops avoid each
 * other and other nodes. Pinned loops keep their side and count as obstacles.
 *
 * Each automatic loop ranks its sides with rankLoopSides() (data paths do not
 * count, as in autoLoopSideFor). Loops whose first-ranked sides would overlap
 * each other are contested, and both give way: uncontested loops are placed
 * first; then each contested loop tries its other sides in rank order, using
 * its first choice only if no other side is free. A loop takes the first
 * candidate side that would not overlap another node or a loop already
 * placed, else its first-ranked side.
 *
 * `shapes` holds every node keyed by the same keys as path endpoints (runtime
 * ids or schema labels). Returns each loop's side, keyed by its `id`.
 */
export function resolveLoopSides(
  loops: readonly { id: string; node: string; pinned?: LoopSide }[],
  shapes: ReadonlyMap<string, NodeShape>,
  paths: readonly EndpointPath[],
  isDataset: (key: string) => boolean
): Map<string, LoopSide> {
  const sides = new Map<string, LoopSide>()
  const placed: Point[] = []
  const overlapsLoop = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 2 * LOOP_RADIUS

  for (const loop of loops) {
    const shape = shapes.get(loop.node)
    if (loop.pinned) {
      sides.set(loop.id, loop.pinned)
      if (shape) placed.push(loopCenter(shape, loop.pinned))
    }
  }

  const auto = loops
    .filter((l) => !l.pinned)
    .map((l) => ({
      ...l,
      shape: shapes.get(l.node),
      ranked: rankLoopSidesFor(l.node, paths, (key) => shapes.get(key), isDataset),
    }))

  // Contested: first choices that would overlap another automatic loop's first choice.
  const firstCenter = (a: (typeof auto)[number]) => (a.shape ? loopCenter(a.shape, a.ranked[0]) : null)
  const contested = new Set<string>()
  for (let i = 0; i < auto.length; i++) {
    for (let j = i + 1; j < auto.length; j++) {
      const ci = firstCenter(auto[i])
      const cj = firstCenter(auto[j])
      if (ci && cj && overlapsLoop(ci, cj)) {
        contested.add(auto[i].id)
        contested.add(auto[j].id)
      }
    }
  }

  const place = (a: (typeof auto)[number], candidates: LoopSide[]) => {
    if (!a.shape) {
      sides.set(a.id, a.ranked[0])
      return
    }
    const shape = a.shape
    const clear = (side: LoopSide) => {
      const c = loopCenter(shape, side)
      for (const [key, other] of shapes) {
        if (key !== a.node && loopHitsShape(c, other)) return false
      }
      return placed.every((q) => !overlapsLoop(q, c))
    }
    const side = candidates.find(clear) ?? a.ranked[0]
    sides.set(a.id, side)
    placed.push(loopCenter(shape, side))
  }

  for (const a of auto) if (!contested.has(a.id)) place(a, a.ranked)
  for (const a of auto) if (contested.has(a.id)) place(a, [...a.ranked.slice(1), a.ranked[0]])
  return sides
}
