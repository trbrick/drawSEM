// Helper utilities for node and path operations
export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export interface Node {
  id: string
  x: number
  y: number
  label: string
  type: 'variable' | 'constant' | 'dataset'
  description?: string
  tags?: string[]
  variableCharacteristics?: {
    manifestLatent?: 'manifest' | 'latent'
    exogeneity?: 'exogenous' | 'endogenous'
  }
  levelOfMeasurement?: string
  width?: number
  height?: number
  dataset?: {
    fileName: string
    headers: string[]
    columns: any[]
  }
  bindingMappings?: Record<string, string>
  datasetSource?: {
    type: 'file' | 'embedded'
    location?: string          // For type='file': path to CSV file
    format?: string            // 'csv', 'tsv', 'xlsx', 'json'
    encoding?: string          // e.g., 'UTF-8'
    columnTypes?: Record<string, string>  // column name → data type
    md5?: string              // For integrity verification
    rowCount?: number         // Number of data rows (excluding header)
    object?: any[]            // For type='embedded': array of row objects
  }
}

export interface Path {
  id: string
  from: string
  to: string
  twoSided: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  label?: string | null
  displayName?: string | null
  value?: number | null
  // true = free anonymous; non-empty string = free named (equality-constrained); absent = fixed
  freeParameter?: boolean | string
  reversed?: boolean
  type?: 'data' | 'constant'          // 'data' = dataset mapping; 'constant' = mean/intercept
  parameterType?: string
  optimization?: {
    prior?: Record<string, any> | null
    bounds?: [number | null, number | null] | null
    start?: number | string | null
  }
  visual?: {
    midpointOffset?: { x: number; y: number }
  }
  /** Coordinate expansion: which instance(s) an external path connects to. Default 'all'. */
  coordinateRule?: import('../core/types').CoordinateRule
  /**
   * Coordinate expansion: cross-instance lag. 0 = same instance.
   * Positive = forward (source k → target k+L). Negative = backward.
   * Out-of-bounds copies are silently dropped.
   */
  lag?: number
}

// ---------------------------------------------------------------------------
// Coordinate expansion runtime types
// ---------------------------------------------------------------------------

/**
 * Runtime representation of a repeat group.
 * Mirrors schema RepeatGroup but uses runtime node ids instead of labels,
 * and carries derived state (computed bounds, instance positions).
 */
export interface RuntimeRepeatGroup {
  /** Matches schema RepeatGroup.id */
  id: string
  coordinateDimension: string
  instanceCount: number
  dataSource?: { datasetNodeLabel: string; column: string } | null
  viewState: 'expanded' | 'collapsed'
  /** Runtime node ids (not labels) belonging to this group */
  nodeIds: string[]
  visual: {
    templateX: number
    templateY: number
    instanceWidth: number
    instanceHeight: number
    instanceSpacing: number
    axis: 'horizontal' | 'vertical'
  }
}

// Helper: Check if a path is a dataset-to-variable mapping path
export function isDatasetPath(path: Path, nodes: Node[]): boolean {
  if (path.type === 'data') return true
  const srcNode = nodes.find((n) => n.id === path.from)
  return srcNode?.type === 'dataset'
}

// Geometry helpers
export function nodeCircleBBox(node: Node, radius: number) {
  return {
    minX: node.x - radius,
    maxX: node.x + radius,
    minY: node.y - radius,
    maxY: node.y + radius,
  }
}

export function nodeRectBBox(node: Node, defaultW: number, defaultH: number) {
  const w = node.width ?? defaultW
  const h = node.height ?? defaultH
  return {
    minX: node.x - w / 2,
    maxX: node.x + w / 2,
    minY: node.y - h / 2,
    maxY: node.y + h / 2,
  }
}
