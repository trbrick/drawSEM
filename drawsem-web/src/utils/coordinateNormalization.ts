/**
 * Coordinate Normalization Utilities
 * 
 * Handles conversion between canonical coordinates (RAMPath algorithm space)
 * and display coordinates (rendered space with margins and centering).
 * 
 * Canonical space: Origin at top rank center, coordinates from auto-layout
 * Display space: Origin at top-left with margins, centered based on bounds
 * 
 * Both interactive (CanvasTool) and static (SVG export) rendering pipelines use
 * these utilities to ensure consistent coordinate transformation.
 */

import { Node } from '../core/types'

/**
 * Bounds of a model in canonical coordinate space
 */
export interface ModelBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
}

/**
 * Display anchor: offset to apply to all canonical coordinates
 */
export interface DisplayAnchor {
  x: number
  y: number
}

/**
 * Configuration for anchor computation
 */
export interface AnchorConfig {
  marginLeft?: number
  marginTop?: number
  modelWidthFactor?: number
}

/**
 * Compute bounding box of all nodes with positions
 * Returns infinite bounds if no positioned nodes exist
 */
export function computeModelBounds(nodes: Node[]): ModelBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  nodes.forEach(node => {
    // Skip nodes without positions (visual property)
    if (node.visual?.x === undefined || node.visual?.y === undefined) {
      return
    }

    const x = node.visual.x
    const y = node.visual.y
    const width = node.visual.width ?? 100  // Default node width
    const height = node.visual.height ?? 100  // Default node height

    // Calculate node bounds (center-based positioning)
    const left = x - width / 2
    const right = x + width / 2
    const top = y - height / 2
    const bottom = y + height / 2

    minX = Math.min(minX, left)
    maxX = Math.max(maxX, right)
    minY = Math.min(minY, top)
    maxY = Math.max(maxY, bottom)
  })

  // Handle case with no positioned nodes
  if (!isFinite(minX)) {
    return {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 100,
      width: 100,
      height: 100,
    }
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Compute display anchor from model bounds
 * 
 * Anchor is the offset to apply to all canonical coordinates to position
 * the model in display space with proper margins and centering.
 * 
 * Strategy:
 * - Shift minX to marginLeft: anchor.x = marginLeft - bounds.minX
 * - Shift minY to marginTop: anchor.y = marginTop - bounds.minY
 * 
 * @param bounds - Model bounds in canonical space
 * @param config - Anchor configuration (margins used for future context-specific positioning)
 * @returns Display anchor offset
 */
export function computeAnchor(bounds: ModelBounds, config?: AnchorConfig): DisplayAnchor {
  const marginLeft = config?.marginLeft ?? 50
  const marginTop = config?.marginTop ?? 50
  // modelWidthFactor is for future use (cascade/submodel horizontal centering)

  return {
    x: marginLeft - bounds.minX,
    y: marginTop - bounds.minY,
  }
}

/**
 * Apply anchor offset to all positioned nodes
 * Creates new nodes with adjusted display coordinates
 * Original node.visual.x/y remain unchanged (canonical space)
 * 
 * @param nodes - Nodes with positions in canonical space
 * @param anchor - Display offset to apply
 * @returns New nodes with display positions (deep copy with offset)
 */
export function applyAnchorToNodes(nodes: Node[], anchor: DisplayAnchor): Node[] {
  return nodes.map(node => {
    // Skip nodes without positions
    if (node.visual?.x === undefined || node.visual?.y === undefined) {
      return node
    }

    // Return new node with adjusted display coordinates
    // Original canonical coordinates preserved in node.visual
    return {
      ...node,
      visual: {
        ...node.visual,
        // Display coordinates: canonical + anchor
        // Note: In-place use would modify these directly on rendering;
        // this function returns what would be the display coordinates
        x: node.visual.x + anchor.x,
        y: node.visual.y + anchor.y,
      },
    }
  })
}

/**
 * Complete transformation pipeline: bounds → anchor → display coordinates
 * 
 * @param nodes - Nodes with canonical positions
 * @param config - Anchor configuration
 * @returns Object with bounds, computed anchor, and transformed nodes
 */
export function normalizeNodeCoordinates(nodes: Node[], config?: AnchorConfig) {
  const bounds = computeModelBounds(nodes)
  const anchor = computeAnchor(bounds, config)
  const normalizedNodes = applyAnchorToNodes(nodes, anchor)

  return {
    bounds,
    anchor,
    normalizedNodes,
  }
}

/**
 * Get display coordinates for a single node
 * Convenience function for interactive rendering
 * 
 * @param node - Node with canonical position
 * @param anchor - Display anchor
 * @returns Display coordinates or null if node has no position
 */
export function getDisplayCoordinates(node: Node, anchor: DisplayAnchor): { x: number; y: number } | null {
  if (node.visual?.x === undefined || node.visual?.y === undefined) {
    return null
  }

  return {
    x: node.visual.x + anchor.x,
    y: node.visual.y + anchor.y,
  }
}
