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
  variableCharacteristic?: 'manifest' | 'latent'
  levelOfMeasurement?: string
  width?: number
  height?: number
  dataset?: {
    fileName: string
    headers: string[]
    columns: any[]
  }
  mappings?: Record<string, string>
  datasetFile?: {
    fileName: string
    md5: string
    rowCount: number
    columnCount: number
    columns: string[]
  }
}

export interface Path {
  id: string
  from: string
  to: string
  twoSided: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  label?: string | null
  value?: number | null
  free?: 'free' | 'fixed'
  parameterType?: string
  optimization?: {
    prior?: Record<string, any> | null
    bounds?: [number | null, number | null] | null
    start?: number | string | null
  }
}

// Helper: Check if a path originates from a dataset node
export function isDatasetPath(path: Path, nodes: Node[]): boolean {
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
