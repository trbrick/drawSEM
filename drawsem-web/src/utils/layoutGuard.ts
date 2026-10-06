/**
 * Layout-only edit guard.
 *
 * In `editMode = "layout"` the canvas may change only how a model looks, never
 * what it is. Rather than trusting that every structural UI control is hidden,
 * CanvasTool routes its model state setter through `restrictModelsToLayoutChanges`,
 * which takes the previous and proposed runtime state and returns a version in
 * which only whitelisted (visual or runtime-only) fields can differ from the
 * previous state. Everything else (adding/removing nodes, paths or models,
 * labels, types, direction, values, free/fixed, parameter types, optimization,
 * variable characteristics, model label, parameterTypes, ...) is reverted to
 * the previous value. Because this is a whitelist, a newly added field or a
 * forgotten call site cannot slip a structural change through.
 */

/** Node fields a layout-only edit may change. */
export const LAYOUT_NODE_FIELDS: readonly string[] = [
  'x',
  'y',
  'width',
  'height',
  // runtime-only, never serialized
  'displayName',
  'dataset',
]

/** Path fields a layout-only edit may change. */
export const LAYOUT_PATH_FIELDS: readonly string[] = [
  'side', // serialized as visual.loopSide
  'visual', // midpointOffset
  // runtime-only, never serialized
  'displayName',
]

interface WithId {
  id: string
}

interface RuntimeModelLike {
  id: string
  nodes: WithId[]
  paths: WithId[]
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    // treat NaN as equal to NaN
    return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a as object).filter((k) => (a as any)[k] !== undefined)
  const kb = Object.keys(b as object).filter((k) => (b as any)[k] !== undefined)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as any)[k], (b as any)[k]))
}

/**
 * Restrict a single object so only `allowed` fields may differ from `prev`.
 * Returns `prev` itself when nothing permitted changed (keeps React identity stable).
 */
function restrictObject<T extends object>(
  prev: T,
  next: T,
  allowed: readonly string[],
  what: string,
  rejections?: string[]
): T {
  if (prev === next) return prev
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  let out: T | null = null
  for (const k of keys) {
    const pv = (prev as any)[k]
    const nv = (next as any)[k]
    if (deepEqual(pv, nv)) continue
    if (allowed.includes(k)) {
      if (!out) out = { ...prev }
      if (nv === undefined) delete (out as any)[k]
      else (out as any)[k] = nv
    } else {
      rejections?.push(`${what}: change to '${k}' rejected`)
    }
  }
  return out ?? prev
}

/**
 * Restrict an id-keyed array (nodes or paths). The result has exactly the
 * elements of `prev` (same ids, same order); additions and removals are rejected.
 */
function restrictArray<T extends WithId>(
  prev: T[],
  next: T[],
  allowed: readonly string[],
  kind: 'node' | 'path',
  rejections?: string[]
): T[] {
  if (prev === next) return prev
  const nextById = new Map<string, T>()
  for (const item of next) nextById.set(item.id, item)
  const prevIds = new Set(prev.map((p) => p.id))
  for (const item of next) {
    if (!prevIds.has(item.id)) rejections?.push(`${kind} '${item.id}': addition rejected`)
  }
  let changed = false
  const out = prev.map((p) => {
    const n = nextById.get(p.id)
    if (!n) {
      rejections?.push(`${kind} '${p.id}': removal rejected`)
      return p
    }
    const r = restrictObject(p, n, allowed, `${kind} '${p.id}'`, rejections)
    if (r !== p) changed = true
    return r
  })
  return changed ? out : prev
}

/** Restrict a proposed node array to layout-only changes relative to `prev`. */
export function restrictNodesToLayoutChanges<T extends WithId>(prev: T[], next: T[], rejections?: string[]): T[] {
  return restrictArray(prev, next, LAYOUT_NODE_FIELDS, 'node', rejections)
}

/** Restrict a proposed path array to layout-only changes relative to `prev`. */
export function restrictPathsToLayoutChanges<T extends WithId>(prev: T[], next: T[], rejections?: string[]): T[] {
  return restrictArray(prev, next, LAYOUT_PATH_FIELDS, 'path', rejections)
}

/**
 * Restrict a proposed list of runtime models to layout-only changes relative to
 * `prev`. Models are matched by id; added/removed models are rejected; every
 * model-level field other than `nodes`/`paths` (label, parameterTypes, ...) is
 * kept from `prev`; nodes/paths are restricted field-by-field.
 *
 * Pass a `rejections` array to collect a human-readable reason for every
 * dropped change. Returns `prev` itself when nothing permitted changed.
 */
export function restrictModelsToLayoutChanges<M extends RuntimeModelLike>(
  prev: M[],
  next: M[],
  rejections?: string[]
): M[] {
  if (prev === next) return prev
  const nextById = new Map<string, M>()
  for (const m of next) nextById.set(m.id, m)
  const prevIds = new Set(prev.map((m) => m.id))
  for (const m of next) {
    if (!prevIds.has(m.id)) rejections?.push(`model '${m.id}': addition rejected`)
  }
  let changed = false
  const out = prev.map((pm) => {
    const nm = nextById.get(pm.id)
    if (!nm) {
      rejections?.push(`model '${pm.id}': removal rejected`)
      return pm
    }
    if (nm === pm) return pm
    for (const k of new Set([...Object.keys(pm), ...Object.keys(nm)])) {
      if (k === 'nodes' || k === 'paths') continue
      if (!deepEqual((pm as any)[k], (nm as any)[k])) {
        rejections?.push(`model '${pm.id}': change to '${k}' rejected`)
      }
    }
    const nodes = restrictNodesToLayoutChanges(pm.nodes, nm.nodes, rejections)
    const paths = restrictPathsToLayoutChanges(pm.paths, nm.paths, rejections)
    if (nodes === pm.nodes && paths === pm.paths) return pm
    changed = true
    return { ...pm, nodes, paths }
  })
  return changed ? out : prev
}
