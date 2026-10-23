import { convertToUnicode } from './converters'
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
  // UI-only memory for cyclePathDirection: set when its "reverse" step swapped
  // from/to, so the next step returns to two-headed. Never serialized. (The
  // direction itself always lives in from/to; there is no render-only flag.)
  reversedByCycle?: boolean
  // UI-only, data paths: the column mapping (`label`) is kept the same as the
  // variable's label ("Same as variable name"; see utils/dataMapping.ts).
  // Absent = not linked. Never serialized.
  mappingLinked?: boolean
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
  nested: {
    optimization: ['parameterTypes'],
    // the saved editor view; visualization.anchor / displayContext pass through
    visualization: ['viewport', 'activeLayer', 'offLayerVisibility'],
  },
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

// ---------------------------------------------------------------------------
// Element creation. New nodes/paths carry only what the user created: no
// size (absent = renderer decides), no path value (absent = schema default 1.0),
// no label unless the user (or a data column) named it, never a runtime id
// outside `id`, and no passthrough.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Node labels. Paths refer to nodes by label in the schema, so labels must be
// unique within a model (R's validateSchema rejects duplicates).
// ---------------------------------------------------------------------------

/**
 * A label for a new node that no node in `nodes` already uses.
 * - `'variable'`: the lowest free V1, V2, ...
 * - `'constant'`: "1", then "1b", "1c", ... (the convention for additional
 *   constant nodes), then "1_27", ...
 * - `'name'`: `base` itself, then base_2, base_3, ... (dataset and column names)
 */
export function uniqueNodeLabel(nodes: { label: string }[], style: 'variable' | 'constant' | 'name', base = ''): string {
  const taken = new Set(nodes.map((n) => n.label))
  const first = style === 'variable' ? 'V1' : style === 'constant' ? '1' : base
  if (!taken.has(first)) return first
  for (let i = 2; ; i++) {
    const candidate =
      style === 'variable' ? `V${i}`
      : style === 'constant' ? (i <= 26 ? `1${String.fromCharCode(96 + i)}` : `1_${i}`)
      : `${base}_${i}`
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * Why `label` cannot be given to the node `nodeId`, or null if it can: labels
 * must be non-empty and not used by any other node.
 */
export function nodeLabelError(nodes: { id: string; label: string }[], nodeId: string, label: string): string | null {
  if (label === '') return 'A node needs a label.'
  if (nodes.some((n) => n.id !== nodeId && n.label === label)) return `A node named "${label}" already exists.`
  return null
}

/** A new node at a user-chosen position. */
export function makeNode(fields: { label: string; type: Node['type']; x: number; y: number; displayName?: string }): Node {
  const node: Node = { id: uid(fields.type === 'dataset' ? 'd_' : 'n_'), label: fields.label, type: fields.type, x: fields.x, y: fields.y }
  if (fields.displayName !== undefined) node.displayName = fields.displayName
  return node
}

/** A new path; fields left undefined are omitted. */
export function makePath(fields: Omit<Path, 'id'>): Path {
  const path: any = { id: uid('p_') }
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) path[k] = v
  }
  return path as Path
}

/** The free error-variance self-loop added with a new variable. */
/** Default label for a new variable's error variance: V_{<variable label>}. */
export function defaultVarianceLabel(nodeLabel: string): string {
  return `V_{${nodeLabel}}`
}

/** Default label for a generated mean path from a constant: M_{<variable label>}. */
export function defaultMeanLabel(nodeLabel: string): string {
  return `M_{${nodeLabel}}`
}

/** Default label for a new one-headed path between variables: <from label>-><to label>. */
export function defaultDirectedLabel(fromLabel: string, toLabel: string): string {
  return `${fromLabel}->${toLabel}`
}

/** Default label for a generated covariance: C_{<label a>,<label b>}. */
export function defaultCovarianceLabel(aLabel: string, bLabel: string): string {
  return `C_{${aLabel},${bLabel}}`
}

/**
 * `base`, else base_2, base_3, ... : the first not used as a label or a
 * parameter name (`freeParameter` string) by any of `paths`. OpenMx names a
 * parameter by its name, else its label, so generated labels avoid both.
 */
export function uniquePathLabel(paths: readonly { label?: string | null; freeParameter?: boolean | string }[], base: string): string {
  const taken = new Set<string>()
  for (const p of paths) {
    if (p.label) taken.add(p.label)
    if (typeof p.freeParameter === 'string' && p.freeParameter) taken.add(p.freeParameter)
  }
  return uniqueNodeLabel([...taken].map((label) => ({ label })), 'name', base)
}

/**
 * The label the editor generates for `path` (V_{x}, M_{x}, x->y or C_{x,y}),
 * given a node id -> label lookup, or null when it generates none: a
 * self-loop gets V_{x}, a one-headed path from a constant M_{x}, another
 * one-headed path x->y, a two-headed path between two nodes C_{x,y}.
 */
export function generatedPathLabel(path: Path, labelOf: (id: string) => string | undefined, isConstant: (id: string) => boolean): string | null {
  if (path.type === 'data') return null
  const from = labelOf(path.from)
  const to = labelOf(path.to)
  if (from === undefined || to === undefined) return null
  if (path.from === path.to && path.twoSided) return defaultVarianceLabel(to)
  if (!path.twoSided && isConstant(path.from)) return defaultMeanLabel(to)
  if (path.twoSided) return defaultCovarianceLabel(from, to)
  return defaultDirectedLabel(from, to)
}

/**
 * `after`, a direction change of `before` (see setPathDirection), with its
 * label following: a label that was the generated one for `before` (x->y,
 * C_{x,y}) becomes the generated one for `after`, made unique against the
 * other `paths`. Other labels are the user's and are kept.
 */
export function followDirectionLabel(before: Path, after: Path, nodes: readonly { id: string; label: string; type: string }[], paths: readonly Path[]): Path {
  if (!before.label) return after
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label
  const isConstant = (id: string) => nodes.find((n) => n.id === id)?.type === 'constant'
  if (before.label !== generatedPathLabel(before, labelOf, isConstant)) return after
  const next = generatedPathLabel(after, labelOf, isConstant)
  if (!next || next === before.label) return after
  const label = uniquePathLabel(paths.filter((p) => p.id !== before.id), next)
  return { ...after, label, displayName: convertToUnicode(label) }
}

/**
 * Paths after the node `nodeId` is renamed to `newLabel`: a path at it whose
 * label is still the generated V_{x}, M_{x} or C_{x,y} for the old labels
 * gets the one for the new labels (made unique against the other paths), its
 * displayName following. Other labels are the user's and are kept.
 */
export function followGeneratedLabels(paths: readonly Path[], nodes: readonly { id: string; label: string; type: string }[], nodeId: string, newLabel: string): Path[] {
  const oldLabel = (id: string) => nodes.find((n) => n.id === id)?.label
  const newLabelOf = (id: string) => (id === nodeId ? newLabel : oldLabel(id))
  const isConstant = (id: string) => nodes.find((n) => n.id === id)?.type === 'constant'
  const out = [...paths]
  out.forEach((p, i) => {
    if (!p.label || (p.from !== nodeId && p.to !== nodeId)) return
    if (p.label !== generatedPathLabel(p, oldLabel, isConstant)) return
    const next = generatedPathLabel(p, newLabelOf, isConstant)
    if (!next || next === p.label) return
    const label = uniquePathLabel(out.filter((_, j) => j !== i), next)
    out[i] = { ...p, label, displayName: convertToUnicode(label) }
  })
  return out
}

/**
 * A free error-variance self-loop, labelled V_{<variable label>} (see
 * defaultVarianceLabel), made unique against `paths` (uniquePathLabel). Its
 * display name is the unicode form of that label, as when a labelled path is
 * loaded. Used for a new variable's error variance and a drawn self-loop.
 */
export function makeVariancePath(nodeId: string, nodeLabel: string, paths: readonly Path[] = []): Path {
  const label = uniquePathLabel(paths, defaultVarianceLabel(nodeLabel))
  return makePath({
    from: nodeId,
    to: nodeId,
    twoSided: true,
    label,
    freeParameter: true,
    parameterType: 'errorVariance',
    displayName: convertToUnicode(label),
  })
}

/** A dataset -> variable mapping path; `column` is the data column name (its label). */
export function makeDataPath(datasetId: string, targetId: string, column: string | undefined, displayName?: string): Path {
  return makePath({
    from: datasetId,
    to: targetId,
    twoSided: false,
    type: 'data',
    label: column,
    displayName: displayName ?? column,
  })
}

// ---------------------------------------------------------------------------
// Path direction. The direction of a one-headed path is its from -> to order;
// reversing swaps them, so the change is serialized like any other edit.
// ---------------------------------------------------------------------------

/** The path with from/to swapped. */
export function reversePath(p: Path): Path {
  const { reversedByCycle: _r, ...rest } = p
  return { ...rest, from: p.to, to: p.from }
}

/**
 * Set a path's direction: 'twoSided' (two-headed), 'forward' (one-headed,
 * keep from -> to) or 'reversed' (one-headed, swap from/to).
 */
export function setPathDirection(p: Path, direction: 'twoSided' | 'forward' | 'reversed'): Path {
  const { reversedByCycle: _r, ...rest } = p
  if (direction === 'twoSided') return { ...rest, twoSided: true }
  if (direction === 'forward') return { ...rest, twoSided: false }
  return reversePath({ ...rest, twoSided: false })
}

/** Double-click cycle: two-headed -> one-headed (from -> to) -> one-headed (to -> from) -> two-headed. */
export function cyclePathDirection(p: Path): Path {
  if (p.twoSided) return setPathDirection(p, 'forward')
  if (!p.reversedByCycle) return { ...reversePath(p), reversedByCycle: true }
  return setPathDirection(p, 'twoSided')
}

/**
 * Set or clear a variable's manifestLatent lock. Clearing removes the key, and
 * removes `variableCharacteristics` entirely when nothing else is left in it,
 * so a set-then-clear leaves the node as it was.
 */
export function withManifestLatent(n: Node, value: 'manifest' | 'latent' | undefined): Node {
  const vc = { ...(n.variableCharacteristics ?? {}) }
  if (value === undefined) delete vc.manifestLatent
  else vc.manifestLatent = value
  const out: Node = { ...n, variableCharacteristics: vc }
  if (Object.keys(vc).length === 0) delete out.variableCharacteristics
  return out
}

/**
 * Set a path's free/fixed state. `undefined` (fixed) removes `freeParameter`;
 * `true` or `''` makes it free and anonymous; a non-empty string makes it free
 * and named (paths sharing a name are constrained equal). `false` and `''` are
 * never written.
 */
export function withFreeParameter(p: Path, value: true | string | undefined): Path {
  const { freeParameter: _old, ...rest } = p
  if (value === undefined) return rest
  return { ...rest, freeParameter: value === '' ? true : value }
}

export type PathLabelMode = 'labels' | 'values' | 'both' | 'neither' | 'default'

/**
 * The name shown for a path: its parameter name (`freeParameter` string), else
 * its label (as displayed), else null. The same order OpenMx uses to name the
 * parameter (see R's .mxParamLabels()). An unlabeled path's generated
 * displayName (from its endpoints) is not a name.
 */
export function pathShownName(path: Path): string | null {
  if (typeof path.freeParameter === 'string' && path.freeParameter) return convertToUnicode(path.freeParameter)
  return path.label ? (path.displayName || path.label) : null
}

/** A structural path's own name: its parameter name, else its label, else null. */
function pathRawName(path: Path): string | null {
  if (path.type === 'data') return null
  if (typeof path.freeParameter === 'string' && path.freeParameter) return path.freeParameter
  return path.label || null
}

const hasParameterName = (p: Path) => typeof p.freeParameter === 'string' && p.freeParameter !== ''

/**
 * The other structural paths shown under the same name as `path` (parameter
 * name, else label) without both of them carrying it as a parameter name.
 * Only a shared parameter name makes an equality constraint; R gives a
 * repeated label a suffix (_2, ...) for OpenMx, so such paths look
 * constrained on the canvas but are not.
 */
export function pathNameClashes(path: Path, paths: readonly Path[]): Path[] {
  const name = pathRawName(path)
  if (!name) return []
  return paths.filter((q) => q.id !== path.id && pathRawName(q) === name && !(hasParameterName(path) && hasParameterName(q)))
}

/** Ids of every path with a name clash (pathNameClashes), for the canvas. */
export function pathIdsWithNameClash(paths: readonly Path[]): Set<string> {
  const byName = new Map<string, Path[]>()
  for (const p of paths) {
    const name = pathRawName(p)
    if (name) byName.set(name, [...(byName.get(name) ?? []), p])
  }
  const out = new Set<string>()
  for (const group of byName.values()) {
    if (group.length < 2 || group.every(hasParameterName)) continue
    for (const p of group) if (pathNameClashes(p, group).length > 0) out.add(p.id)
  }
  return out
}

/** Why a name clash (pathNameClashes) matters. */
export function nameClashMessage(name: string, count: number): string {
  const others = count === 1 ? 'Another path is' : `${count} other paths are`
  return `${others} also named "${name}" but not constrained equal to this one: only a shared parameter name makes an equality constraint. Give them the same parameter name to constrain them, or different labels.`
}

/**
 * A free structural path with neither a parameter name (`freeParameter`
 * string) nor a label: with nothing written on it, it is hard to tell apart
 * from a fixed path at a glance. The canvas draws it dashed, marks its value
 * with "≈", and the inspector notes it.
 */
export function isUnnamedFreePath(path: Path): boolean {
  if (path.type === 'data') return false
  if (path.freeParameter === undefined || path.freeParameter === false) return false
  if (typeof path.freeParameter === 'string' && path.freeParameter.length > 0) return false
  return !path.label
}

/**
 * The text drawn on a path in the canvas for a label mode (null = nothing).
 * "Name" is pathShownName(): the parameter name, else the stored label (an
 * unlabeled path's displayName may be generated from its endpoints, and is
 * not shown as a name here). An absent `freeParameter` means fixed. Values read "=value", or "≈value" for an
 * unnamed free path (isUnnamedFreePath).
 * - 'labels': the name, else the displayName; 'values': the value; 'both':
 *   "name=value" (just the value when unnamed).
 * - 'default': a named path (and a data path, whose label is its column)
 *   shows its name, as "label (parameter name)" when it has both and they
 *   differ; an unnamed free path its value; an unnamed fixed path nothing at
 *   unity (1, 1.0, ...), else its value.
 */
export function pathDisplayText(path: Path, mode: PathLabelMode): string | null {
  const value = path.value ?? 1.0
  const shownValue = `${isUnnamedFreePath(path) ? '≈' : '='}${value.toFixed(2)}`
  const label = pathShownName(path)
  const isFree = path.freeParameter !== undefined && path.freeParameter !== false

  switch (mode) {
    case 'labels':
      return label ?? (path.displayName || null)
    case 'values':
      return shownValue
    case 'both':
      return label ? `${label}${shownValue}` : shownValue
    case 'neither':
      return null
    case 'default':
      if (label && path.label && hasParameterName(path) && path.freeParameter !== path.label) {
        return `${path.displayName || path.label} (${label})`
      }
      if (label) return label
      if (path.type === 'data') return null
      if (isFree) return shownValue
      return value === 1 ? null : shownValue
    default:
      return null
  }
}

/** A path value as shown in the inspector's Value field ('' when absent). */
export function formatPathValue(value: number | null | undefined): string {
  return value !== null && value !== undefined ? value.toFixed(6).replace(/\.?0+$/, '') : ''
}
