/**
 * Copy, cut, paste and duplicate of the editor's selection.
 *
 * The clipboard holds a drawSEM fragment in schema shapes (node labels and path
 * `from`/`to`, never runtime ids), wrapped with a marker so that any other text
 * on the clipboard is ignored:
 *
 *   {"drawSEMClipboard": 1, "nodes": [...schema nodes], "paths": [...schema paths],
 *    "external": [{"label", "type"}, ...]}
 *
 * Because it is plain JSON text on the system clipboard, a copy in one window
 * (e.g. the web app) can be pasted in another (e.g. the RStudio addin).
 *
 * What is copied (`copySelection`):
 *   - the selected variable and constant nodes (dataset nodes never are);
 *   - the selected paths with at least one endpoint among them, data paths
 *     included. A path is copied only when it is itself selected, also one
 *     between two copied nodes; with `withDataPaths` (the editor's SEM layer,
 *     where data paths cannot be selected) the data paths into the copied
 *     variables are copied too;
 *   - `external`: the label and type of each endpoint of a copied path that is
 *     not copied itself (e.g. the dataset of a data path, the constant of a
 *     mean path, a factor F of F -> x).
 * An explicit `variableCharacteristics.manifestLatent` lock is not copied
 * (manifest/latent is inferred, see DESIGN-DECISIONS).
 *
 * On paste (`planPaste`) a path endpoint outside the fragment re-attaches to
 * the target model's node of that label and type (a variable, a constant or a
 * dataset); the path is dropped when there is none, or when the endpoints'
 * types do not fit the path (a data path runs from a dataset to a variable,
 * other paths never touch a dataset, never end at a constant, and a path from
 * a constant is one-headed). Pasted data paths map the column named like their
 * (new) variable label, and are linked to it (see utils/dataMapping.ts).
 *
 * Planning a paste (`planPaste`) is pure apart from fresh runtime ids. The
 * clipboard I/O at the bottom (system clipboard with an in-memory fallback)
 * never throws.
 */
import { convertModelToRuntime } from './runtimeConverter'
import { modelToSchemaModel } from './runtimeToSchema'
import { DANGLING_ENDPOINT_PREFIX, defaultVarianceLabel, isDatasetPath, uid, uniqueNodeLabel, withManifestLatent } from './helpers'
import type { Node, Path } from './helpers'
import { MANIFEST_DEFAULT_W } from './constants'

export const CLIPBOARD_MARKER = 'drawSEMClipboard'
export const CLIPBOARD_VERSION = 1

/** Each paste or duplicate step moves right (never down) by this many widths of the copied nodes' bounding box. */
export const PASTE_STEP_WIDTHS = 1.5

/** A node outside a fragment that its paths refer to. */
export interface ExternalNodeRef {
  label: string
  type: Node['type']
}

export interface ClipboardFragment {
  drawSEMClipboard: 1
  /** Schema nodes (`label`, `type`, `visual`, ...). */
  nodes: Record<string, any>[]
  /** Schema paths (`from`/`to` are node labels). */
  paths: Record<string, any>[]
  /** Path endpoints that are not among `nodes` (absent when there are none). */
  external?: ExternalNodeRef[]
}

/** What is selected: node and path runtime ids. */
export interface CopySource {
  nodeIds: readonly string[]
  pathIds: readonly string[]
}

export interface CopyOptions {
  /** Also copy the data paths into the copied variables, selected or not (the SEM layer). */
  withDataPaths?: boolean
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** Whether a node is copied when selected: variables and constants (also what a cut removes). */
export const isCopyableNode = (n: Node) => n.type === 'variable' || n.type === 'constant'

/** Without the manifestLatent lock and any dataset-only fields. */
function copyableNode(n: Node): Node {
  const { datasetSource: _d, bindingMappings: _b, dataset: _m, ...rest } = withManifestLatent(n, undefined)
  return rest
}

/**
 * The fragment for copying `selection` (see the module comment), or null when
 * nothing is copyable (no selected variable or constant).
 */
export function copySelection(nodes: readonly Node[], paths: readonly Path[], selection: CopySource, options: CopyOptions = {}): ClipboardFragment | null {
  const ids = new Set(selection.nodeIds)
  const copied = nodes.filter((n) => ids.has(n.id) && isCopyableNode(n))
  if (copied.length === 0) return null
  const copiedIds = new Set(copied.map((n) => n.id))
  const selectedPaths = new Set(selection.pathIds)
  const ns = nodes as Node[]

  const copiedPaths = paths.filter((p) => {
    if (!copiedIds.has(p.from) && !copiedIds.has(p.to)) return false
    if (selectedPaths.has(p.id)) return true
    return !!options.withDataPaths && copiedIds.has(p.to) && isDatasetPath(p, ns)
  })

  // Serialize with the external endpoints present, so their ids become labels
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const external = new Map<string, Node>()
  for (const p of copiedPaths) {
    for (const end of [p.from, p.to]) {
      const n = copiedIds.has(end) ? undefined : byId.get(end)
      if (n) external.set(n.id, n)
    }
  }
  const model = modelToSchemaModel({ id: 'clipboard', nodes: [...copied.map(copyableNode), ...external.values()], paths: copiedPaths })
  const externalLabels = new Set([...external.values()].map((n) => n.label))
  const fragment: ClipboardFragment = {
    drawSEMClipboard: CLIPBOARD_VERSION,
    nodes: (model.nodes as any[]).filter((n) => !externalLabels.has(n.label)),
    paths: model.paths as any[],
  }
  if (external.size > 0) fragment.external = [...external.values()].map((n) => ({ label: n.label, type: n.type }))
  return fragment
}

export function serializeFragment(fragment: ClipboardFragment): string {
  return JSON.stringify(fragment)
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)
const NODE_TYPES: readonly string[] = ['variable', 'constant', 'dataset']

/**
 * The fragment in `text`, or null when it is not a drawSEM fragment (any other
 * text, malformed JSON, a wrong marker). Unusable entries are dropped: nodes
 * without a label, dataset nodes, paths without endpoints, malformed
 * `external` entries.
 */
export function parseFragment(text: string | null | undefined): ClipboardFragment | null {
  if (typeof text !== 'string' || !text.includes(CLIPBOARD_MARKER)) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(raw) || raw[CLIPBOARD_MARKER] !== CLIPBOARD_VERSION) return null
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.paths)) return null
  const seen = new Set<string>()
  const nodes = raw.nodes.filter((n: unknown): n is Record<string, any> => {
    if (!isObject(n) || typeof n.label !== 'string' || n.label === '' || seen.has(n.label)) return false
    if (n.type !== 'variable' && n.type !== 'constant') return false
    seen.add(n.label)
    return true
  })
  if (nodes.length === 0) return null
  const paths = raw.paths.filter((p: unknown): p is Record<string, any> =>
    isObject(p) && typeof p.from === 'string' && typeof p.to === 'string')
  const fragment: ClipboardFragment = { drawSEMClipboard: CLIPBOARD_VERSION, nodes, paths }
  if (Array.isArray(raw.external)) {
    const external = raw.external
      .filter((e: unknown): e is ExternalNodeRef =>
        isObject(e) && typeof e.label === 'string' && !seen.has(e.label) && NODE_TYPES.includes(e.type))
      .map((e: ExternalNodeRef) => ({ label: e.label, type: e.type }))
    if (external.length > 0) fragment.external = external
  }
  return fragment
}

// ---------------------------------------------------------------------------
// Paste
// ---------------------------------------------------------------------------

/**
 * A label for a pasted node, given the labels already `taken`: its own label
 * when free; otherwise, like new nodes, the lowest free V<n> for a V<n>
 * variable, the next constant label ("1b", "1c", ...) for a "1"-style
 * constant, else label_2, label_3, ...
 */
export function pasteLabel(label: string, type: Node['type'], taken: ReadonlySet<string>): string {
  if (!taken.has(label)) return label
  const asNodes = [...taken].map((l) => ({ label: l }))
  if (type === 'variable' && /^V\d+$/.test(label)) return uniqueNodeLabel(asNodes, 'variable')
  if (type === 'constant' && /^1([a-z]|_\d+)?$/.test(label)) return uniqueNodeLabel(asNodes, 'constant')
  return uniqueNodeLabel(asNodes, 'name', label)
}

/**
 * New names for the named free parameters (`freeParameter` strings) of pasted
 * paths: each name keeps its own value when no path of the target model uses
 * it, else becomes name_2, name_3, ... Paths in the paste that share a name
 * keep sharing one (new) name, so an equality constraint inside the copy is
 * kept, but no constraint links the copy to the original.
 *
 * Free-parameter names are their own namespace: node labels are not checked
 * (the backend keeps them apart). TODO: the developer wants something more
 * intuitive here later, e.g. a deliberate choice to keep copies equal to the
 * original (same name) instead of always renaming.
 */
export function renameFreeParameters(targetPaths: readonly { freeParameter?: boolean | string }[], names: readonly string[]): Map<string, string> {
  const inTarget = new Set(targetPaths.map((p) => p.freeParameter).filter((f): f is string => typeof f === 'string' && f !== ''))
  return assignUnique([...new Set(names)], inTarget, (name, taken) => uniqueNodeLabel([...taken].map((l) => ({ label: l })), 'name', name))
}

/**
 * Old -> new for each of `items`, each new value chosen by `choose` so it is
 * not in `existing`, not already assigned, and not another item's own value
 * (which may still be kept as it is).
 */
function assignUnique(items: readonly string[], existing: ReadonlySet<string>, choose: (item: string, taken: ReadonlySet<string>) => string): Map<string, string> {
  const out = new Map<string, string>()
  const assigned = new Set<string>()
  for (const item of items) {
    const taken = new Set([...existing, ...assigned, ...items.filter((x) => x !== item && !out.has(x))])
    const next = choose(item, taken)
    out.set(item, next)
    assigned.add(next)
  }
  return out
}

/**
 * Whether a path fits endpoints of these node types: a data path (typed
 * `data`, or from a dataset) runs from a dataset to a variable; any other path
 * touches no dataset, does not end at a constant, and is one-headed when it
 * starts at a constant.
 */
export function pathFitsEndpoints(p: Record<string, any>, fromType: Node['type'], toType: Node['type']): boolean {
  if (p.type === 'data' || fromType === 'dataset') return fromType === 'dataset' && toType === 'variable'
  if (toType === 'dataset' || toType === 'constant') return false
  if (fromType === 'constant') return p.numberOfArrows !== 2
  return true
}

export interface PastePlan {
  nodes: Node[]
  paths: Path[]
}

/**
 * The runtime nodes and paths that pasting `fragment` into a model with
 * `nodes` / `paths` adds, moved by `offset`. Labels are made unique (see
 * `pasteLabel`), paths follow their nodes' new labels, named free parameters
 * are renamed (see `renameFreeParameters`), and every element gets a fresh
 * runtime id. An endpoint outside the fragment attaches to the target's node
 * of that label (and of the type recorded in `external`); the path is dropped
 * when there is none or the types do not fit (see `pathFitsEndpoints`). A data
 * path maps the column named like its variable's new label, linked to it.
 * Null when the fragment has no nodes.
 */
export function planPaste(nodes: readonly Node[], paths: readonly Path[], fragment: ClipboardFragment, offset: { x: number; y: number }): PastePlan | null {
  const fragNodes = fragment.nodes.filter((n) => n.type === 'variable' || n.type === 'constant')
  if (fragNodes.length === 0) return null

  const fragTypes = new Map<string, Node['type']>(fragNodes.map((n) => [n.label as string, n.type]))
  const labelMap = assignUnique(
    fragNodes.map((n) => n.label as string),
    new Set(nodes.map((n) => n.label)),
    (label, taken) => pasteLabel(label, fragTypes.get(label)!, taken)
  )
  const targetByLabel = new Map(nodes.map((n) => [n.label, n]))
  const externalTypes = new Map((fragment.external ?? []).map((e) => [e.label, e.type]))
  /** The type of the node an endpoint label resolves to, or null when it resolves to none. */
  const endpointType = (label: string): Node['type'] | null => {
    if (labelMap.has(label)) return fragTypes.get(label)!
    const target = targetByLabel.get(label)
    if (!target) return null
    const recorded = externalTypes.get(label)
    return recorded === undefined || recorded === target.type ? target.type : null
  }
  const isDataPath = (p: Record<string, any>) => p.type === 'data' || endpointType(p.from) === 'dataset'
  const fragPaths = fragment.paths.filter((p) => {
    if (!labelMap.has(p.from) && !labelMap.has(p.to)) return false
    const fromType = endpointType(p.from)
    const toType = endpointType(p.to)
    return fromType !== null && toType !== null && pathFitsEndpoints(p, fromType, toType)
  })
  const paramMap = renameFreeParameters(
    paths,
    fragPaths.map((p) => p.freeParameter).filter((f): f is string => typeof f === 'string' && f !== '')
  )

  const schemaNodes = fragNodes.map((n) => {
    const { variableCharacteristics: vc, datasetSource: _d, bindingMappings: _b, ...rest } = n
    const out: Record<string, any> = { ...rest, label: labelMap.get(n.label) }
    if (isObject(vc)) {
      const { manifestLatent: _ml, ...keep } = vc
      if (Object.keys(keep).length > 0) out.variableCharacteristics = keep
    }
    const visual = isObject(n.visual) ? n.visual : {}
    out.visual = {
      ...visual,
      x: (typeof visual.x === 'number' ? visual.x : 0) + offset.x,
      y: (typeof visual.y === 'number' ? visual.y : 0) + offset.y,
    }
    return out
  })
  const dataPathIndexes = new Set<number>()
  const schemaPaths = fragPaths.map((p, i) => {
    const from = labelMap.get(p.from) ?? p.from
    const to = labelMap.get(p.to) ?? p.to
    const out: Record<string, any> = { ...p, from, to }
    if (isDataPath(p)) {
      // the column named like the pasted variable (its label is the mapping)
      dataPathIndexes.add(i)
      out.label = to
      return out
    }
    const oldParam = typeof p.freeParameter === 'string' ? p.freeParameter : null
    if (oldParam && paramMap.has(oldParam)) out.freeParameter = paramMap.get(oldParam)
    // Keep the labels the editor derives from a name truthful: a variance
    // labelled V_{node} follows the node's new label, a label that is the
    // parameter name follows the new name.
    if (typeof p.label === 'string') {
      if (p.from === p.to && p.label === defaultVarianceLabel(p.from)) out.label = defaultVarianceLabel(to)
      else if (oldParam && p.label === oldParam) out.label = out.freeParameter
    }
    return out
  })

  const runtime = convertModelToRuntime({ nodes: schemaNodes, paths: schemaPaths })
  const nodeIdMap = new Map<string, string>()
  const newNodes: Node[] = runtime.nodes.map((n) => {
    const id = uid('n_')
    nodeIdMap.set(n.id, id)
    return { ...n, id }
  })
  const endpoint = (id: string) =>
    nodeIdMap.get(id) ?? (id.startsWith(DANGLING_ENDPOINT_PREFIX) ? targetByLabel.get(id.slice(DANGLING_ENDPOINT_PREFIX.length))?.id : undefined)
  const newPaths: Path[] = []
  runtime.paths.forEach((p, i) => {
    const from = endpoint(p.from)
    const to = endpoint(p.to)
    if (!from || !to) return
    const path: Path = { ...p, id: uid('p_'), from, to }
    if (dataPathIndexes.has(i)) path.mappingLinked = true
    newPaths.push(path)
  })
  return { nodes: newNodes, paths: newPaths }
}

/**
 * The width of the box around the fragment's nodes: each centred on its
 * position, `visual.width` wide (the default node width when unset, as in
 * utils/layoutModel.ts). 0 for a fragment without nodes.
 */
export function fragmentWidth(fragment: ClipboardFragment): number {
  let minX = Infinity
  let maxX = -Infinity
  for (const n of fragment.nodes) {
    const visual = isObject(n.visual) ? n.visual : {}
    const x = typeof visual.x === 'number' ? visual.x : 0
    const w = typeof visual.width === 'number' ? visual.width : MANIFEST_DEFAULT_W
    minX = Math.min(minX, x - w / 2)
    maxX = Math.max(maxX, x + w / 2)
  }
  return maxX > minX ? maxX - minX : 0
}

/**
 * The offset of the `n`th step of pasting `fragment`: `n` times
 * PASTE_STEP_WIDTHS fragment widths to the right. Step 0 is in place (the
 * first paste after a cut), 1 the first paste after a copy or a duplicate,
 * and each repeated paste of the same content one step further.
 */
export function pasteOffset(fragment: ClipboardFragment, n: number): { x: number; y: number } {
  return { x: n * PASTE_STEP_WIDTHS * fragmentWidth(fragment), y: 0 }
}

/** Used by duplicate: copy and paste in one go (one step over), without the clipboard. */
export function planDuplicate(nodes: readonly Node[], paths: readonly Path[], selection: CopySource, options: CopyOptions = {}): PastePlan | null {
  const fragment = copySelection(nodes, paths, selection, options)
  return fragment ? planPaste(nodes, paths, fragment, pasteOffset(fragment, 1)) : null
}

// ---------------------------------------------------------------------------
// Clipboard I/O. The system clipboard (navigator.clipboard) with an in-memory
// fallback for when it is unavailable or access is denied (jsdom, insecure
// contexts, some embedded browsers). Shared by every editor on the page.
// Never throws.
// ---------------------------------------------------------------------------

interface MemoryClipboard {
  text: string
  /** Whether the text also reached the system clipboard. */
  inSystem: boolean
}

let memory: MemoryClipboard | null = null

/** Forget the in-memory clipboard (tests). */
export function resetMemoryClipboard(): void {
  memory = null
}

/**
 * The text a paste should use, given what the system clipboard held (`null`
 * when it could not be read, '' when empty) and the in-memory copy: the system
 * text when it is a drawSEM fragment; else the in-memory copy when the system
 * clipboard was unreadable or never received it; else nothing (the user has
 * copied something else since).
 */
export function chooseClipboardText(systemText: string | null, mem: MemoryClipboard | null): string | null {
  if (systemText && parseFragment(systemText)) return systemText
  if (!mem) return null
  if (!systemText || !mem.inSystem) return mem.text
  return null
}

/** Put `text` on the clipboard (system when possible, always in memory). */
export async function writeClipboardText(text: string): Promise<void> {
  const entry: MemoryClipboard = { text, inSystem: false }
  memory = entry
  try {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (clip && typeof clip.writeText === 'function') {
      await clip.writeText(text)
      entry.inSystem = true
    }
  } catch {
    // denied or unavailable: the in-memory copy stands
  }
}

/** The text a paste event carries (null when it has none). */
export function eventClipboardText(e: { clipboardData?: DataTransfer | null }): string | null {
  try {
    const data = e.clipboardData
    return data ? data.getData('text/plain') : null
  } catch {
    return null
  }
}

/** The text to paste, from `systemText` (e.g. a paste event's) or the in-memory copy. */
export function clipboardTextFrom(systemText: string | null): string | null {
  return chooseClipboardText(systemText, memory)
}

/** The text to paste when there is no paste event: navigator.clipboard.readText, else memory. */
export async function readClipboardText(): Promise<string | null> {
  let systemText: string | null = null
  try {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (clip && typeof clip.readText === 'function') systemText = await clip.readText()
  } catch {
    systemText = null
  }
  return chooseClipboardText(systemText, memory)
}
