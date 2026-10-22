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
 * What a selection rectangle selects. `nodes` and `paths` are the candidates
 * (the caller passes only elements in the active layer):
 *   - a node is selected when its whole drawn box lies inside `rect`;
 *   - a path is selected when one of its endpoints is a selected node (from
 *     this drag, or in `base`) and the box covers enough of its visible line
 *     in one unbroken stretch: MARQUEE_PATH_REACH units of it, or half of it
 *     when the visible line is shorter than twice that. The visible line is
 *     `points` (see `svgPathPoints`) outside the `ends` boxes (its endpoint
 *     nodes', which a line drawn into a node hides). So a tight box around a
 *     node leaves out its paths (only their ends are inside) and a broad box
 *     takes them all. Paths with no selected endpoint are never selected.
 * With `base` (an additive drag) the result is `base` plus those elements;
 * without it, just those elements.
 */
export function marqueeSelection(
  rect: Bounds,
  nodes: readonly { id: string; bounds: Bounds }[],
  paths: readonly { id: string; from: string; to: string; points: readonly Point[]; ends?: readonly Bounds[] }[],
  base: Selection | null
): Selection {
  const nodeIds = nodes.filter((n) => boundsContain(rect, n.bounds)).map((n) => n.id)
  const endpoints = new Set([...nodeIds, ...(base?.nodeIds ?? [])])
  const pathIds = paths
    .filter((p) => {
      if (!endpoints.has(p.from) && !endpoints.has(p.to)) return false
      const ends = p.ends ?? []
      const inside = longestRunInside(rect, p.points, ends)
      return inside > 0 && inside >= Math.min(MARQUEE_PATH_REACH, visibleLength(p.points, ends) / 2)
    })
    .map((p) => p.id)
  const hit: Selection = { nodeIds, pathIds }
  return base ? unionSelections(base, hit) : hit
}

/** How much of a path's line (canvas units) a selection rectangle must cover to select it. */
export const MARQUEE_PATH_REACH = 24

export interface Point {
  x: number
  y: number
}

/**
 * Liang-Barsky: the parameter range [t0, t1] of the segment a -> b inside
 * `rect`, or null when it misses.
 */
function clipSegment(a: Point, b: Point, rect: Bounds): [number, number] | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [[-dx, a.x - rect.minX], [dx, rect.maxX - a.x], [-dy, a.y - rect.minY], [dy, rect.maxY - a.y]]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null
    } else {
      const t = q / p
      if (p < 0) t0 = Math.max(t0, t)
      else t1 = Math.min(t1, t)
    }
  }
  return t1 > t0 ? [t0, t1] : null
}

/** The parts of [t0, t1] outside every interval in `cuts`. */
function subtractIntervals(range: [number, number], cuts: readonly [number, number][]): [number, number][] {
  let parts: [number, number][] = [range]
  for (const [c0, c1] of cuts) {
    parts = parts.flatMap(([s, e]): [number, number][] => {
      if (c1 <= s || c0 >= e) return [[s, e]]
      const out: [number, number][] = []
      if (c0 > s) out.push([s, c0])
      if (c1 < e) out.push([c1, e])
      return out
    })
  }
  return parts
}

/**
 * The unbroken stretches of the polyline `pts` inside `rect` (or anywhere, for
 * null) and outside every `exclude` box, as lengths.
 */
function runLengths(pts: readonly Point[], rect: Bounds | null, exclude: readonly Bounds[]): number[] {
  const runs: number[] = []
  let run = 0
  let open = false // the last part reached the end of its segment
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const range = rect ? clipSegment(a, b, rect) : [0, 1] as [number, number]
    const cuts = exclude.map((box) => clipSegment(a, b, box)).filter((c): c is [number, number] => c !== null)
    const parts = range ? subtractIntervals(range, cuts) : []
    if (parts.length === 0) {
      if (open) runs.push(run)
      run = 0
      open = false
      continue
    }
    for (const [s, e] of parts) {
      if (!(open && s === 0)) {
        if (open) runs.push(run)
        run = 0
      }
      run += (e - s) * len
      open = e === 1
      if (!open) {
        runs.push(run)
        run = 0
      }
    }
  }
  if (open) runs.push(run)
  return runs
}

/**
 * The longest unbroken stretch of the polyline `pts` inside `rect` and outside
 * the `exclude` boxes. Unbroken, so the two ends of a self-loop just inside a
 * box around its node don't add up.
 */
export function longestRunInside(rect: Bounds, pts: readonly Point[], exclude: readonly Bounds[] = []): number {
  return Math.max(0, ...runLengths(pts, rect, exclude))
}

/** The length of the polyline `pts` outside the `exclude` boxes. */
export function visibleLength(pts: readonly Point[], exclude: readonly Bounds[] = []): number {
  return runLengths(pts, null, exclude).reduce((s, r) => s + r, 0)
}

/** Points sampled along each curve segment by `svgPathPoints`. */
const CURVE_SAMPLES = 32

/** The box around the line an SVG path draws (see `svgPathPoints`), or null. */
export function svgPathBounds(d: string): Bounds | null {
  const pts = svgPathPoints(d)
  return pts ? unionBounds(pts.map((p) => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }))) : null
}

/**
 * The line an SVG path draws, as a polyline, from its path data: absolute
 * M, L, H, V, Q and C commands (what the canvas generates; others give null),
 * curves sampled along their length (jsdom has no getBBox). Null for empty or
 * unsupported path data.
 */
export function svgPathPoints(d: string): Point[] | null {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return null
  const pts: { x: number; y: number }[] = []
  let cur = { x: 0, y: 0 }
  let cmd = ''
  let i = 0
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++]
    else if (!cmd) return null
    switch (cmd) {
      case 'M':
      case 'L':
        cur = { x: num(), y: num() }
        pts.push(cur)
        if (cmd === 'M') cmd = 'L' // further pairs are line segments
        break
      case 'H':
        cur = { x: num(), y: cur.y }
        pts.push(cur)
        break
      case 'V':
        cur = { x: cur.x, y: num() }
        pts.push(cur)
        break
      case 'Q': {
        const c = { x: num(), y: num() }
        const e = { x: num(), y: num() }
        const s0 = cur
        for (let k = 1; k <= CURVE_SAMPLES; k++) {
          const t = k / CURVE_SAMPLES
          const mt = 1 - t
          pts.push({ x: mt * mt * s0.x + 2 * mt * t * c.x + t * t * e.x, y: mt * mt * s0.y + 2 * mt * t * c.y + t * t * e.y })
        }
        cur = e
        break
      }
      case 'C': {
        const c1 = { x: num(), y: num() }
        const c2 = { x: num(), y: num() }
        const e = { x: num(), y: num() }
        const s0 = cur
        for (let k = 1; k <= CURVE_SAMPLES; k++) {
          const t = k / CURVE_SAMPLES
          const mt = 1 - t
          const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, f = t * t * t
          pts.push({ x: a * s0.x + b * c1.x + c * c2.x + f * e.x, y: a * s0.y + b * c1.y + c * c2.y + f * e.y })
        }
        cur = e
        break
      }
      default:
        return null
    }
  }
  if (pts.length === 0 || pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  return pts
}
