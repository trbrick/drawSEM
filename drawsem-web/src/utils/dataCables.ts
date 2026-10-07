// Data cables: how data paths are drawn, shared by the canvas (CanvasTool)
// and image export (svgRenderer). All data paths leaving the same dataset
// share one short trunk, then fan out with rounded, axis-aligned branches to
// their variables, attaching slightly off-centre so they don't sit on top of
// the variable's other paths; no arrowheads. Display only; never touches the
// schema. Ported from the coordinate-expansion branch (0aec616).
//
// Geometry is independent of how a renderer represents nodes: callers pass
// node centres and a `boundary(towards)` function giving the point where a ray
// from the node's centre towards `towards` leaves the node's shape.

export type Pt = { x: number; y: number }
export type Boundary = (towards: Pt) => Pt

export const CABLE_COLOR = '#a7adb8'
export const CABLE_WIDTH = 1.75
const CABLE_TRUNK_LEN = 28
const CABLE_CORNER_R = 12
const CABLE_ATTACH_ANGLE = 0.375 // ~21 degrees off the target's centre-facing point

export interface CableTrunk {
  exit: Pt
  manifold: Pt
  axis: 'x' | 'y'
}

/** The trunk leaving a dataset: from its boundary towards the centroid of its targets, along the dominant axis. */
export function cableTrunk(sourceCenter: Pt, sourceBoundary: Boundary, targetCenters: readonly Pt[]): CableTrunk {
  const towards = {
    x: targetCenters.reduce((s, p) => s + p.x, 0) / targetCenters.length,
    y: targetCenters.reduce((s, p) => s + p.y, 0) / targetCenters.length,
  }
  const dx = towards.x - sourceCenter.x
  const dy = towards.y - sourceCenter.y
  const axis: 'x' | 'y' = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
  const sign = axis === 'x' ? (dx >= 0 ? 1 : -1) : (dy >= 0 ? 1 : -1)
  const far = axis === 'x' ? { x: sourceCenter.x + sign * 1e4, y: sourceCenter.y } : { x: sourceCenter.x, y: sourceCenter.y + sign * 1e4 }
  const exit = sourceBoundary(far)
  const manifold: Pt =
    axis === 'x' ? { x: exit.x + sign * CABLE_TRUNK_LEN, y: exit.y } : { x: exit.x, y: exit.y + sign * CABLE_TRUNK_LEN }
  return { exit, manifold, axis }
}

/** SVG path data for a trunk. */
export function cableTrunkD(trunk: CableTrunk): string {
  return `M ${trunk.exit.x} ${trunk.exit.y} L ${trunk.manifold.x} ${trunk.manifold.y}`
}

/** One branch: from the trunk's manifold point to the target's boundary, with its label position. */
export function cableBranch(trunk: CableTrunk, targetCenter: Pt, targetBoundary: Boundary): { d: string; labelPos: Pt } {
  const { manifold, axis } = trunk
  const tc = targetCenter
  const aligned = axis === 'x' ? Math.abs(tc.y - manifold.y) < 0.5 : Math.abs(tc.x - manifold.x) < 0.5
  if (aligned) {
    const end = targetBoundary(rotateAround(tc, manifold, CABLE_ATTACH_ANGLE))
    return {
      d: `M ${manifold.x} ${manifold.y} L ${end.x} ${end.y}`,
      labelPos: { x: (manifold.x + end.x) / 2, y: (manifold.y + end.y) / 2 },
    }
  }
  const corner: Pt = axis === 'x' ? { x: tc.x, y: manifold.y } : { x: manifold.x, y: tc.y }
  const end = targetBoundary(rotateAround(tc, corner, CABLE_ATTACH_ANGLE))
  // Keep the final leg axis-aligned: slide the corner to match the offset end point.
  const adjustedCorner: Pt = axis === 'x' ? { x: end.x, y: corner.y } : { x: corner.x, y: end.y }
  return {
    d: roundedElbowPath(manifold, adjustedCorner, end, CABLE_CORNER_R),
    labelPos: { x: (adjustedCorner.x + end.x) / 2, y: (adjustedCorner.y + end.y) / 2 },
  }
}

// Polyline p0 -> corner -> p1 with the corner rounded off (radius clamped to leg length).
function roundedElbowPath(p0: Pt, corner: Pt, p1: Pt, radius: number): string {
  const d1 = Math.hypot(corner.x - p0.x, corner.y - p0.y)
  const d2 = Math.hypot(p1.x - corner.x, p1.y - corner.y)
  const r = Math.min(radius, d1 / 2, d2 / 2)
  if (r < 1 || d1 < 1e-6 || d2 < 1e-6) {
    return `M ${p0.x} ${p0.y} L ${corner.x} ${corner.y} L ${p1.x} ${p1.y}`
  }
  const u1 = { x: (corner.x - p0.x) / d1, y: (corner.y - p0.y) / d1 }
  const u2 = { x: (p1.x - corner.x) / d2, y: (p1.y - corner.y) / d2 }
  const a = { x: corner.x - u1.x * r, y: corner.y - u1.y * r }
  const b = { x: corner.x + u2.x * r, y: corner.y + u2.y * r }
  return `M ${p0.x} ${p0.y} L ${a.x} ${a.y} Q ${corner.x} ${corner.y} ${b.x} ${b.y} L ${p1.x} ${p1.y}`
}

// Rotate `point` around `center`: an off-centre point on the target's boundary,
// away from where its regular SEM paths attach.
function rotateAround(center: Pt, point: Pt, angleRad: number): Pt {
  const dx = point.x - center.x
  const dy = point.y - center.y
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}
