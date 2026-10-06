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
  // Input keys the editor does not own (see OWNED_NODE_KEYS), re-emitted verbatim.
  // Opaque: never read or edited by UI code.
  passthrough?: Record<string, any>
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
  // Input keys the editor does not own (see OWNED_PATH_KEYS), re-emitted verbatim.
  // Opaque: never read or edited by UI code.
  passthrough?: Record<string, any>
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

// ---------------------------------------------------------------------------
// Owned keys vs pass-through
//
// The editor "owns" the schema keys below: they live on the runtime node/path/
// model and are written back from runtime state. Every other key of the input
// object is kept verbatim in `passthrough` at load and re-emitted on
// serialization, so a load -> sync round trip is lossless. An owned key is never
// read back from `passthrough` (it is removed from it at load), so an edit to it
// can never be overwritten by a stale original value.
//
// A key listed under `nested` is an object of which only the listed sub-keys
// are owned (e.g. node `visual.x`); the remaining sub-keys (e.g. `visual.angle`)
// pass through, and the object itself is kept as a presence marker.
// ---------------------------------------------------------------------------

export interface OwnedKeySpec {
  keys: readonly string[]
  nested: Readonly<Record<string, readonly string[]>>
}

/** Node keys written from runtime state. */
export const OWNED_NODE_KEYS: OwnedKeySpec = {
  keys: ['label', 'type', 'description', 'tags', 'variableCharacteristics', 'bindingMappings', 'datasetSource'],
  nested: { visual: ['x', 'y', 'width', 'height'] },
}

/** Path keys written from runtime state. */
export const OWNED_PATH_KEYS: OwnedKeySpec = {
  keys: ['from', 'to', 'numberOfArrows', 'type', 'label', 'value', 'freeParameter', 'parameterType', 'optimization'],
  nested: { visual: ['loopSide', 'midpointOffset'] },
}

/** Model keys written from runtime state. */
export const OWNED_MODEL_KEYS: OwnedKeySpec = {
  keys: ['label', 'nodes', 'paths'],
  nested: { optimization: ['parameterTypes'] },
}

/** Document keys written from runtime state. */
export const OWNED_DOC_KEYS: OwnedKeySpec = {
  keys: ['models'],
  nested: {},
}

function cloneJson<T>(x: T): T {
  return x === undefined ? x : JSON.parse(JSON.stringify(x))
}

const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Deep copy of `obj` without the keys owned according to `spec`. */
export function passthroughOf(obj: any, spec: OwnedKeySpec): Record<string, any> {
  const out: Record<string, any> = {}
  if (!isPlainObject(obj)) return out
  for (const [k, v] of Object.entries(obj)) {
    const nestedOwned = spec.nested[k]
    if (nestedOwned && isPlainObject(v)) {
      const sub: Record<string, any> = {}
      for (const [sk, sv] of Object.entries(v)) {
        if (!nestedOwned.includes(sk)) sub[sk] = cloneJson(sv)
      }
      out[k] = sub // kept even when empty: records that the object was present
    } else if (!spec.keys.includes(k) && !nestedOwned) {
      out[k] = cloneJson(v)
    }
  }
  return out
}

/**
 * Inverse of `passthroughOf`: `{...passthrough, ...owned}`, where owned values
 * that are `undefined` are omitted. A nested object is emitted when it was
 * present in the input or when any of its owned sub-keys is defined.
 */
export function mergeOwned(
  passthrough: Record<string, any> | undefined,
  owned: Record<string, any>,
  ownedNested: Record<string, Record<string, any>> = {}
): Record<string, any> {
  const out: Record<string, any> = {}
  const pt = passthrough ?? {}
  for (const [k, v] of Object.entries(pt)) {
    if (!(k in ownedNested)) out[k] = v
  }
  for (const [k, v] of Object.entries(owned)) {
    if (v !== undefined) out[k] = v
  }
  for (const [k, sub] of Object.entries(ownedNested)) {
    const merged: Record<string, any> = { ...(isPlainObject(pt[k]) ? pt[k] : {}) }
    let anyOwned = false
    for (const [sk, sv] of Object.entries(sub)) {
      if (sv !== undefined) {
        merged[sk] = sv
        anyOwned = true
      }
    }
    if (pt[k] !== undefined || anyOwned) out[k] = merged
  }
  return out
}

/** Prefix for the runtime id of a path endpoint that names no node in the model. */
export const DANGLING_ENDPOINT_PREFIX = '?'
