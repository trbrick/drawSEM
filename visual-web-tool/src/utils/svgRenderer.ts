/**
 * SVG Renderer for Graph Models
 * Exports positioned graph models to self-contained SVG strings
 * Reuses rendering logic from CanvasTool for visual consistency
 */

import { GraphSchema, Node, Path, Model, getModel, getNodesByLabel } from '../core/types'
import {
  LATENT_RADIUS,
  MANIFEST_DEFAULT_W,
  MANIFEST_DEFAULT_H,
  DATASET_DEFAULT_W,
  DATASET_DEFAULT_H,
} from './constants'
import { escapeXml, getVariableRenderType, renderNodeSvg, DISPLAY_COLORS } from './nodeRender'

/**
 * Position map interface matching autoLayout output
 */
export interface PositionMap {
  [nodeLabel: string]: {
    x: number
    y: number
    rank?: number
  }
}

/**
 * SVG export options
 */
export interface SvgExportOptions {
  /** Padding around content (default: 40) */
  padding?: number
  /** Show dataset nodes (default: true) */
  showDatasetNodes?: boolean
  /** Show constant nodes (default: true) */
  showConstantNodes?: boolean
  /** Path label format: 'labels', 'values', 'both', 'neither', or null */
  pathLabelFormat?: 'labels' | 'values' | 'both' | 'neither' | null
  /** Background color (default: 'white') */
  backgroundColor?: string
}

/**
 * Path-specific stroke width (thicker than nodes)
 */
const PATH_STROKE_WIDTH = 1.6

/**
 * Bounding box type
 */
interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Normalize export options with defaults
 */
function normalizeOptions(options?: SvgExportOptions): Required<SvgExportOptions> {
  return {
    padding: options?.padding ?? 40,
    showDatasetNodes: options?.showDatasetNodes ?? true,
    showConstantNodes: options?.showConstantNodes ?? true,
    pathLabelFormat: options?.pathLabelFormat ?? 'neither',
    backgroundColor: options?.backgroundColor ?? 'white',
  }
}

// escapeXml is now imported from nodeRender.ts (shared utility)

/**
 * Get bounding box of a node based on its type and position
 */
function getNodeBounds(node: Node, pos: { x: number; y: number }): BoundingBox {
  if (node.type === 'variable') {
    const renderType = getVariableRenderType(node)
    if (renderType === 'latent') {
      return {
        x: pos.x - LATENT_RADIUS,
        y: pos.y - LATENT_RADIUS,
        width: LATENT_RADIUS * 2,
        height: LATENT_RADIUS * 2,
      }
    }
    // manifest variable - rounded rectangle
    const width = node.visual?.width ?? MANIFEST_DEFAULT_W
    const height = node.visual?.height ?? MANIFEST_DEFAULT_H
    return {
      x: pos.x - width / 2,
      y: pos.y - height / 2,
      width,
      height,
    }
  }

  if (node.type === 'dataset') {
    const width = node.visual?.width ?? DATASET_DEFAULT_W
    const height = node.visual?.height ?? DATASET_DEFAULT_H
    return {
      x: pos.x - width / 2,
      y: pos.y - height / 2,
      width,
      height,
    }
  }

  // constant node - triangle (approximate as 44x44 bounding box)
  const triangleSize = 44
  return {
    x: pos.x - triangleSize / 2,
    y: pos.y - triangleSize / 2,
    width: triangleSize,
    height: triangleSize,
  }
}
/**
 * Get center of a node
 */
function centerOf(pos: { x: number; y: number }): { x: number; y: number } {
  return { x: pos.x, y: pos.y }
}

/**
 * Get boundary point of a node for path routing
 * Adapts logic from CanvasTool.getBoundaryPoint()
 */
function getBoundaryPoint(
  node: Node,
  nodePos: { x: number; y: number },
  towards: { x: number; y: number }
): { x: number; y: number } {
  const cx = nodePos.x
  const cy = nodePos.y
  const dx = towards.x - cx
  const dy = towards.y - cy
  const dist = Math.hypot(dx, dy) || 1

  if (node.type === 'variable') {
    const renderType = getVariableRenderType(node)
    if (renderType === 'latent') {
      const r = LATENT_RADIUS
      return { x: cx + (dx * (r / dist)), y: cy + (dy * (r / dist)) }
    }
    // manifest variable - rounded rectangle
    const halfW = (node.visual?.width ?? MANIFEST_DEFAULT_W) / 2
    const halfH = (node.visual?.height ?? MANIFEST_DEFAULT_H) / 2
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    let sX = absDx > 0 ? halfW / absDx : Infinity
    let sY = absDy > 0 ? halfH / absDy : Infinity
    const s = Math.min(sX, sY)
    return { x: cx + dx * s, y: cy + dy * s }
  }

  if (node.type === 'dataset') {
    const halfW = (node.visual?.width ?? DATASET_DEFAULT_W) / 2
    const halfH = (node.visual?.height ?? DATASET_DEFAULT_H) / 2
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    let sX = absDx > 0 ? halfW / absDx : Infinity
    let sY = absDy > 0 ? halfH / absDy : Infinity
    const s = Math.min(sX, sY)
    return { x: cx + dx * s, y: cy + dy * s }
  }

  // constant node - triangle with vertices at A(0,-22), B(19,11), C(-19,11)
  const verts = [
    { x: cx + 0, y: cy - 22 },
    { x: cx + 19, y: cy + 11 },
    { x: cx - 19, y: cy + 11 },
  ]

  const p = { x: cx, y: cy }
  const rDir = { x: towards.x - cx, y: towards.y - cy }

  function cross(a: { x: number; y: number }, b: { x: number; y: number }) {
    return a.x * b.y - a.y * b.x
  }

  let best: { x: number; y: number; t: number } | null = null
  for (let i = 0; i < 3; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % 3]
    const s = { x: b.x - a.x, y: b.y - a.y }
    const qp = { x: a.x - p.x, y: a.y - p.y }
    const rxs = cross(rDir, s)
    if (Math.abs(rxs) < 1e-6) continue
    const t = cross(qp, s) / rxs
    const u = cross(qp, rDir) / rxs
    if (t >= 0 && u >= 0 && u <= 1) {
      const ix = p.x + rDir.x * t
      const iy = p.y + rDir.y * t
      if (!best || t < best.t) best = { x: ix, y: iy, t }
    }
  }

  if (best) return { x: best.x, y: best.y }
  const fallbackR = 22
  return { x: cx + (dx * (fallbackR / dist)), y: cy + (dy * (fallbackR / dist)) }
}

/**
 * Build self-loop points for a node
 * Adapts logic from CanvasTool.buildSelfLoopPoints()
 */
function buildSelfLoopPoints(
  node: Node,
  nodePos: { x: number; y: number },
  side: 'top' | 'right' | 'bottom' | 'left' = 'bottom'
): Array<{ x: number; y: number }> {
  const a = centerOf(nodePos)
  const loopRadius = 20
  const gap = 6

  const degToRad = (d: number) => (d * Math.PI) / 180
  const startAngle = degToRad(40)
  const endAngle = degToRad(-40)

  const sideAngles: Record<string, number> = {
    bottom: 0,
    right: -Math.PI / 2,
    top: Math.PI,
    left: Math.PI / 2,
  }
  const dirMap: Record<string, { x: number; y: number }> = {
    bottom: { x: 0, y: 1 },
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    left: { x: -1, y: 0 },
  }
  const rot = sideAngles[side]

  let nodeRadAlongSide = LATENT_RADIUS
  if (node.type === 'variable') {
    const renderType = getVariableRenderType(node)
    if (renderType === 'manifest') {
      const w = node.visual?.width ?? MANIFEST_DEFAULT_W
      const h = node.visual?.height ?? MANIFEST_DEFAULT_H
      nodeRadAlongSide = side === 'left' || side === 'right' ? w / 2 : h / 2
    }
  } else if (node.type === 'dataset') {
    const w = node.visual?.width ?? DATASET_DEFAULT_W
    const h = node.visual?.height ?? DATASET_DEFAULT_H
    nodeRadAlongSide = side === 'left' || side === 'right' ? w / 2 : h / 2
  } else if (node.type === 'constant') {
    nodeRadAlongSide = 22
  }

  const targetDist = nodeRadAlongSide + loopRadius + gap

  const origCx = a.x
  const origCy = a.y + targetDist

  const x1 = origCx + loopRadius * Math.sin(startAngle)
  const y1 = origCy - loopRadius * Math.cos(startAngle)
  const x2 = origCx + loopRadius * Math.sin(endAngle)
  const y2 = origCy - loopRadius * Math.cos(endAngle)

  const outerRadius = loopRadius * 2.5
  const cp1 = {
    x: origCx + outerRadius * Math.sin(startAngle + Math.PI / 3),
    y: origCy - 6 * outerRadius * Math.cos(startAngle + Math.PI / 3),
  }
  const cp2 = {
    x: origCx + outerRadius * Math.sin(endAngle - Math.PI / 3),
    y: origCy - 6 * outerRadius * Math.cos(endAngle - Math.PI / 3),
  }

  function rotatePoint(
    px: number,
    py: number,
    ox: number,
    oy: number,
    theta: number
  ): { x: number; y: number } {
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const dx = px - ox
    const dy = py - oy
    return { x: ox + c * dx - s * dy, y: oy + s * dx + c * dy }
  }

  const pts = [{ x: x1, y: y1 }, cp1, cp2, { x: x2, y: y2 }]
  const rotated = pts.map((pt) => rotatePoint(pt.x, pt.y, origCx, origCy, rot))

  const targetCenter = {
    x: a.x + dirMap[side].x * targetDist,
    y: a.y + dirMap[side].y * targetDist,
  }
  const trans = { x: targetCenter.x - origCx, y: targetCenter.y - origCy }
  const globalPts = rotated.map((pt) => ({ x: pt.x + trans.x, y: pt.y + trans.y }))

  const ep1 = globalPts[0]
  const ep2 = globalPts[3]
  const b1 = getBoundaryPoint(node, nodePos, ep1)
  const b2 = getBoundaryPoint(node, nodePos, ep2)

  const d1 = { x: b1.x - ep1.x, y: b1.y - ep1.y }
  const d2 = { x: b2.x - ep2.x, y: b2.y - ep2.y }
  const globalDelta = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 }

  const finalPts = globalPts.map((pt) => ({ x: pt.x + globalDelta.x, y: pt.y + globalDelta.y }))
  return finalPts
}

/**
 * Generate path data string (SVG d attribute)
 * Adapts logic from CanvasTool.pathD()
 */
function pathD(
  path: Path,
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  fromNode: Node,
  toNode: Node
): string {
  if (path.fromLabel === path.toLabel) {
    // self-loop
    const side = (path.visual?.loopSide as any) || 'bottom'
    const finalPts = buildSelfLoopPoints(fromNode, fromPos, side)
    const [P0, P1, P2, P3] = finalPts
    return `M ${P0.x} ${P0.y} C ${P1.x} ${P1.y}, ${P2.x} ${P2.y}, ${P3.x} ${P3.y}`
  }

  // different nodes: straight for one-headed, curve for two-headed
  const start = getBoundaryPoint(fromNode, fromPos, toPos)
  const end = getBoundaryPoint(toNode, toPos, fromPos)

  const dx = end.x - start.x
  const dy = end.y - start.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const markerOffset = 2
  const startOut = { x: start.x - ux * markerOffset, y: start.y - uy * markerOffset }
  const endOut = { x: end.x + ux * markerOffset, y: end.y + uy * markerOffset }

  if (path.numberOfArrows === 2) {
    // two-sided: use quadratic curve
    const mx = (start.x + end.x) / 2
    const my = (start.y + end.y) / 2
    const ddx = end.x - start.x
    const ddy = end.y - start.y
    const distMid = Math.hypot(ddx, ddy) || 1
    const normX = -(ddy / distMid)
    const normY = ddx / distMid
    const curve = 40
    const cx = mx + normX * curve
    const cy = my + normY * curve

    const P0 = { x: start.x, y: start.y }
    const CP = { x: cx, y: cy }
    const P1 = { x: end.x, y: end.y }

    let tan0 = { x: 2 * (CP.x - P0.x), y: 2 * (CP.y - P0.y) }
    let tan1 = { x: 2 * (P1.x - CP.x), y: 2 * (P1.y - CP.y) }

    const len0 = Math.hypot(tan0.x, tan0.y) || 1
    const len1 = Math.hypot(tan1.x, tan1.y) || 1
    tan0 = { x: tan0.x / len0, y: tan0.y / len0 }
    tan1 = { x: tan1.x / len1, y: tan1.y / len1 }

    const startOutT = { x: P0.x - tan0.x * markerOffset, y: P0.y - tan0.y * markerOffset }
    const endOutT = { x: P1.x + tan1.x * markerOffset, y: P1.y + tan1.y * markerOffset }

    return `M ${startOutT.x} ${startOutT.y} Q ${CP.x} ${CP.y} ${endOutT.x} ${endOutT.y}`
  }

  // single-headed: straight line
  return `M ${startOut.x} ${startOut.y} L ${endOut.x} ${endOut.y}`
}

/**
 * Calculate position of path label (midpoint or curve midpoint)
 */
function getPathLabelPos(
  path: Path,
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  fromNode: Node,
  toNode: Node
): { x: number; y: number } | null {
  if (path.fromLabel === path.toLabel) {
    // self-loop: use cubic bezier midpoint
    const side = (path.visual?.loopSide as any) || 'bottom'
    const finalPts = buildSelfLoopPoints(fromNode, fromPos, side)
    const [P0, P1, P2, P3] = finalPts
    const t = 0.5
    const mt = 1 - t
    const x =
      mt * mt * mt * P0.x +
      3 * mt * mt * t * P1.x +
      3 * mt * t * t * P2.x +
      t * t * t * P3.x
    const y =
      mt * mt * mt * P0.y +
      3 * mt * mt * t * P1.y +
      3 * mt * t * t * P2.y +
      t * t * t * P3.y
    return { x, y }
  }

  const start = getBoundaryPoint(fromNode, fromPos, toPos)
  const end = getBoundaryPoint(toNode, toPos, fromPos)

  const dx = end.x - start.x
  const dy = end.y - start.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const markerOffset = 2

  const startOut = { x: start.x - ux * markerOffset, y: start.y - uy * markerOffset }
  const endOut = { x: end.x + ux * markerOffset, y: end.y + uy * markerOffset }

  if (path.numberOfArrows === 2) {
    // two-sided: use quadratic curve midpoint
    const mx = (start.x + end.x) / 2
    const my = (start.y + end.y) / 2
    const ddx = end.x - start.x
    const ddy = end.y - start.y
    const distMid = Math.hypot(ddx, ddy) || 1
    const normX = -(ddy / distMid)
    const normY = ddx / distMid
    const curve = 40
    const cx = mx + normX * curve
    const cy = my + normY * curve

    return { x: cx, y: cy - 10 }
  }

  // straight line: use midpoint
  return {
    x: (startOut.x + endOut.x) / 2,
    y: (startOut.y + endOut.y) / 2,
  }
}

/**
 * Render a single node as SVG
 * Uses shared node rendering logic from nodeRender.ts for consistency with CanvasTool
 */
function renderNode(node: Node, pos: { x: number; y: number }): string {
  return renderNodeSvg(node, pos)
}

/**
 * Render node label as SVG text
 */
function renderNodeLabel(node: Node, pos: { x: number; y: number }): string {
  const label = node.label
  const yOffset = 5 // slight vertical offset for baseline adjustment
  return `<text x="${pos.x}" y="${pos.y + yOffset}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-family="monospace" fill="${DISPLAY_COLORS.stroke}">${escapeXml(label)}</text>`
}

/**
 * Render a path as SVG
 */
function renderPath(
  path: Path,
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  fromNode: Node,
  toNode: Node
): string {
  const d = pathD(path, fromPos, toPos, fromNode, toNode)
  if (!d) return ''

  const markerEnd = 'url(#arrow-end)'
  const markerStart = path.numberOfArrows === 2 ? 'url(#arrow-start)' : 'none'

  return `<path d="${d}" stroke="${DISPLAY_COLORS.stroke}" stroke-width="${PATH_STROKE_WIDTH}" fill="none" marker-end="${markerEnd}" marker-start="${markerStart}" />`
}

/**
 * Render path label (if applicable)
 */
function renderPathLabel(
  path: Path,
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  fromNode: Node,
  toNode: Node,
  format: SvgExportOptions['pathLabelFormat']
): string | null {
  if (!format || format === 'neither' || format === null) return null

  let labelText = ''
  if (format === 'labels' || format === 'both') {
    if (path.label) {
      labelText = path.label
    } else {
      return null // no label to display
    }
  }

  if (format === 'values' || format === 'both') {
    if (path.value !== null && path.value !== undefined) {
      const valueStr = typeof path.value === 'number' ? path.value.toFixed(2) : String(path.value)
      if (labelText) {
        labelText += ` (${valueStr})`
      } else {
        labelText = valueStr
      }
    }
  }

  if (!labelText) return null

  const labelPos = getPathLabelPos(path, fromPos, toPos, fromNode, toNode)
  if (!labelPos) return null

  const yOffset = 5
  return `<text x="${labelPos.x}" y="${labelPos.y + yOffset}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-family="monospace" fill="${DISPLAY_COLORS.stroke}">${escapeXml(labelText)}</text>`
}

/**
 * Generate SVG marker definitions for arrowheads
 */
function markerDefinitions(): string {
  return `
    <marker id="arrow-start" markerWidth="10" markerHeight="8" refX="0" refY="4" orient="auto">
      <polygon points="10,0 0,4 10,8" fill="${DISPLAY_COLORS.stroke}" />
    </marker>
    <marker id="arrow-end" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto">
      <polygon points="0,0 10,4 0,8" fill="${DISPLAY_COLORS.stroke}" />
    </marker>
  `
}

/**
 * Main export function: Convert a positioned graph model to SVG string
 */
export function modelToSVG(
  schema: GraphSchema,
  positions: PositionMap,
  modelId?: string,
  options?: SvgExportOptions
): string {
  const opts = normalizeOptions(options)

  // Get the model
  const model = getModel(schema, modelId)
  const nodesByLabel = getNodesByLabel(model)

  // Filter visible nodes
  const visibleNodes = model.nodes.filter((n) => {
    if (n.type === 'dataset') return opts.showDatasetNodes
    if (n.type === 'constant') return opts.showConstantNodes
    return true
  })

  // Filter visible paths (exclude paths with hidden endpoints)
  const visibleNodeLabels = new Set(visibleNodes.map((n) => n.label))
  const visiblePaths = model.paths.filter(
    (p) => visibleNodeLabels.has(p.fromLabel) && visibleNodeLabels.has(p.toLabel)
  )

  // Calculate bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity

  visibleNodes.forEach((n) => {
    const pos = positions[n.label]
    if (!pos) return
    const bounds = getNodeBounds(n, pos)
    minX = Math.min(minX, bounds.x)
    minY = Math.min(minY, bounds.y)
    maxX = Math.max(maxX, bounds.x + bounds.width)
    maxY = Math.max(maxY, bounds.y + bounds.height)
  })

  // Default bounds if no nodes
  if (!isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 100
    maxY = 100
  }

  // Apply padding
  const viewBox = {
    x: minX - opts.padding,
    y: minY - opts.padding,
    width: maxX - minX + 2 * opts.padding,
    height: maxY - minY + 2 * opts.padding,
  }

  // SVG dimensions (maintain aspect ratio, cap at 1200px max width)
  const aspectRatio = viewBox.width / viewBox.height
  const svgWidth = Math.min(viewBox.width, 1200)
  const svgHeight = svgWidth / aspectRatio

  // Render paths (background layer)
  const pathsElements = visiblePaths
    .map((p) => {
      const fromNode = nodesByLabel[p.fromLabel]
      const toNode = nodesByLabel[p.toLabel]
      const fromPos = positions[p.fromLabel]
      const toPos = positions[p.toLabel]
      if (!fromNode || !toNode || !fromPos || !toPos) return ''
      return renderPath(p, fromPos, toPos, fromNode, toNode)
    })
    .filter((s) => s)
    .join('\n')

  // Render path labels
  const pathLabelsElements = visiblePaths
    .map((p) => {
      const fromNode = nodesByLabel[p.fromLabel]
      const toNode = nodesByLabel[p.toLabel]
      const fromPos = positions[p.fromLabel]
      const toPos = positions[p.toLabel]
      if (!fromNode || !toNode || !fromPos || !toPos) return ''
      return renderPathLabel(p, fromPos, toPos, fromNode, toNode, opts.pathLabelFormat)
    })
    .filter((s) => s && s.length > 0)
    .join('\n')

  // Render nodes (foreground layer)
  const nodesElements = visibleNodes
    .map((n) => {
      const pos = positions[n.label]
      if (!pos) return ''
      return renderNode(n, pos)
    })
    .filter((s) => s)
    .join('\n')

  // Render node labels
  const nodeLabelsElements = visibleNodes
    .map((n) => {
      const pos = positions[n.label]
      if (!pos) return ''
      return renderNodeLabel(n, pos)
    })
    .filter((s) => s)
    .join('\n')

  // Assemble SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="${svgWidth}" height="${svgHeight}" style="font-family: monospace; background-color: ${opts.backgroundColor};">
  <defs>
${markerDefinitions()}
  </defs>
  <g id="paths">
${pathsElements}
  </g>
  <g id="path-labels">
${pathLabelsElements}
  </g>
  <g id="nodes">
${nodesElements}
  </g>
  <g id="node-labels">
${nodeLabelsElements}
  </g>
</svg>`

  return svg
}
