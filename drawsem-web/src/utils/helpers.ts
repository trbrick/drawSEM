// Helper utilities for node and path operations
export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export interface Node {
  id: string
  // Canvas position. Absent = unplaced (the schema node had no visual.x/y and
  // nothing has positioned it yet); renderers treat it as 0 via nodeX/nodeY.
  // Only a real placement (drag, auto-layout) sets these, so an unplaced node is
  // serialized without a position.
  x?: number
  y?: number
  label: string
  type: 'variable' | 'constant' | 'dataset'
  // optional display name (UI only) - separate from label used for matching/export
  displayName?: string
  description?: string
  tags?: string[]
  variableCharacteristics?: {
    manifestLatent?: 'manifest' | 'latent'
    exogeneity?: 'exogenous' | 'endogenous'
  }
  // Pinned size. Absent = the renderer decides (MANIFEST_DEFAULT_* etc.).
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
}

// Helper: Check if a path is a dataset-to-variable mapping path
export function isDatasetPath(path: Path, nodes: Node[]): boolean {
  if (path.type === 'data') return true
  const srcNode = nodes.find((n) => n.id === path.from)
  return srcNode?.type === 'dataset'
}

export function modelFilename(label: string | undefined, ext: string): string {
  const slug = label?.trim()
    ? label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : null
  const timestamp = new Date().toISOString().split('T')[0]
  return slug ? `${slug}.${ext}` : `graph-${timestamp}.${ext}`
}

// Position of a node for rendering: an unplaced node (x/y absent) is drawn at 0.
export function nodeX(node: { x?: number }): number {
  return node.x ?? 0
}

export function nodeY(node: { y?: number }): number {
  return node.y ?? 0
}

// Geometry helpers
export function nodeCircleBBox(node: Node, radius: number) {
  const x = nodeX(node)
  const y = nodeY(node)
  return {
    minX: x - radius,
    maxX: x + radius,
    minY: y - radius,
    maxY: y + radius,
  }
}

export function nodeRectBBox(node: Node, defaultW: number, defaultH: number) {
  const w = node.width ?? defaultW
  const h = node.height ?? defaultH
  const x = nodeX(node)
  const y = nodeY(node)
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: y - h / 2,
    maxY: y + h / 2,
  }
}
