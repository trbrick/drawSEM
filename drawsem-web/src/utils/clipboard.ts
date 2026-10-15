/**
 * Copy, cut, paste and duplicate of the editor's selection.
 *
 * The clipboard holds a drawSEM fragment in schema shapes (node labels and path
 * `from`/`to`, never runtime ids), wrapped with a marker so that any other text
 * on the clipboard is ignored:
 *
 *   {"drawSEMClipboard": 1, "nodes": [...schema nodes], "paths": [...schema paths]}
 *
 * Because it is plain JSON text on the system clipboard, a copy in one window
 * (e.g. the web app) can be pasted in another (e.g. the RStudio addin).
 *
 * What is copied (`copySelection`):
 *   - the selected variable and constant nodes (dataset nodes never are);
 *   - every path with both endpoints among them, except data paths;
 *   - mean paths (one-headed, from a constant) from an uncopied constant into a
 *     copied node; on paste they are re-attached to the target model's
 *     constant of the same label (dropped when there is none).
 * Copied variables get no data connections, so a copied manifest variable is
 * latent until connected. An explicit `variableCharacteristics.manifestLatent`
 * lock is not copied either (manifest/latent is inferred, see DESIGN-DECISIONS).
 *
 * Planning a paste (`planPaste`) is pure apart from fresh runtime ids. The
 * clipboard I/O at the bottom (system clipboard with an in-memory fallback)
 * never throws.
 */
import { convertModelToRuntime } from './runtimeConverter'
import { modelToSchemaModel } from './runtimeToSchema'
import { DANGLING_ENDPOINT_PREFIX, defaultVarianceLabel, isDatasetPath, uid, uniqueNodeLabel, withManifestLatent } from './helpers'
import type { Node, Path } from './helpers'

export const CLIPBOARD_MARKER = 'drawSEMClipboard'
export const CLIPBOARD_VERSION = 1

/** How far (model units, in x and y) each paste or duplicate is moved from the copied position. */
export const PASTE_OFFSET = 30

export interface ClipboardFragment {
  drawSEMClipboard: 1
  /** Schema nodes (`label`, `type`, `visual`, ...). */
  nodes: Record<string, any>[]
  /** Schema paths (`from`/`to` are node labels). */
  paths: Record<string, any>[]
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const isCopyableNode = (n: Node) => n.type === 'variable' || n.type === 'constant'

/** Without the manifestLatent lock and any dataset-only fields. */
function copyableNode(n: Node): Node {
  const { datasetSource: _d, bindingMappings: _b, dataset: _m, ...rest } = withManifestLatent(n, undefined)
  return rest
}

/**
 * The fragment for copying the nodes `nodeIds` (selected paths play no part:
 * see the module comment), or null when nothing is copyable (no selected
 * variable or constant).
 */
export function copySelection(nodes: readonly Node[], paths: readonly Path[], nodeIds: readonly string[]): ClipboardFragment | null {
  const ids = new Set(nodeIds)
  const copied = nodes.filter((n) => ids.has(n.id) && isCopyableNode(n))
  if (copied.length === 0) return null
  const copiedIds = new Set(copied.map((n) => n.id))
  const constants = new Map(nodes.filter((n) => n.type === 'constant').map((n) => [n.id, n]))
  const ns = nodes as Node[]

  const external = new Map<string, Node>() // uncopied constants that copied mean paths start from
  const copiedPaths = paths.filter((p) => {
    if (isDatasetPath(p, ns)) return false
    if (!copiedIds.has(p.to)) return false
    if (copiedIds.has(p.from)) return true
    const c = constants.get(p.from)
    if (c && !p.twoSided) {
      external.set(c.id, c)
      return true
    }
    return false
  })

  // Serialize with the external constants present, so their ids become labels
  const model = modelToSchemaModel({ id: 'clipboard', nodes: [...copied.map(copyableNode), ...external.values()], paths: copiedPaths })
  const externalLabels = new Set([...external.values()].map((c) => c.label))
  return {
    drawSEMClipboard: CLIPBOARD_VERSION,
    nodes: (model.nodes as any[]).filter((n) => !externalLabels.has(n.label)),
    paths: model.paths as any[],
  }
}

export function serializeFragment(fragment: ClipboardFragment): string {
  return JSON.stringify(fragment)
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The fragment in `text`, or null when it is not a drawSEM fragment (any other
 * text, malformed JSON, a wrong marker). Unusable entries are dropped: nodes
 * without a label, dataset nodes, data paths, paths without endpoints.
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
    isObject(p) && typeof p.from === 'string' && typeof p.to === 'string' && p.type !== 'data')
  return { drawSEMClipboard: CLIPBOARD_VERSION, nodes, paths }
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

export interface PastePlan {
  nodes: Node[]
  paths: Path[]
}

/**
 * The runtime nodes and paths that pasting `fragment` into a model with
 * `nodes` / `paths` adds, moved by `offset`. Labels are made unique (see
 * `pasteLabel`), paths follow their nodes' new labels, named free parameters
 * are renamed (see `renameFreeParameters`), and every element gets a fresh
 * runtime id. A mean path from a constant outside the fragment attaches to the
 * target's constant of that label, and is dropped when there is none. Null
 * when the fragment has no nodes.
 */
export function planPaste(nodes: readonly Node[], paths: readonly Path[], fragment: ClipboardFragment, offset: { x: number; y: number }): PastePlan | null {
  const fragNodes = fragment.nodes.filter((n) => n.type === 'variable' || n.type === 'constant')
  if (fragNodes.length === 0) return null

  const labelMap = assignUnique(
    fragNodes.map((n) => n.label as string),
    new Set(nodes.map((n) => n.label)),
    (label, taken) => pasteLabel(label, fragNodes.find((n) => n.label === label)!.type, taken)
  )
  const targetConstants = new Map(nodes.filter((n) => n.type === 'constant').map((n) => [n.label, n]))
  const fragPaths = fragment.paths.filter((p) => {
    if (p.type === 'data' || !labelMap.has(p.to)) return false
    if (labelMap.has(p.from)) return true
    // a mean path from a constant outside the fragment
    return targetConstants.has(p.from) && p.numberOfArrows !== 2
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
  const schemaPaths = fragPaths.map((p) => {
    const from = labelMap.get(p.from) ?? p.from
    const to = labelMap.get(p.to)!
    const out: Record<string, any> = { ...p, from, to }
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
    nodeIdMap.get(id) ?? (id.startsWith(DANGLING_ENDPOINT_PREFIX) ? targetConstants.get(id.slice(DANGLING_ENDPOINT_PREFIX.length))?.id : undefined)
  const newPaths: Path[] = []
  for (const p of runtime.paths) {
    const from = endpoint(p.from)
    const to = endpoint(p.to)
    if (from && to) newPaths.push({ ...p, id: uid('p_'), from, to })
  }
  return { nodes: newNodes, paths: newPaths }
}

/** The offset of the `n`th paste (1, 2, ...) of the same clipboard content. */
export function pasteOffset(n: number): { x: number; y: number } {
  return { x: PASTE_OFFSET * n, y: PASTE_OFFSET * n }
}

/** Used by duplicate: copy and paste in one go, without the clipboard. */
export function planDuplicate(nodes: readonly Node[], paths: readonly Path[], nodeIds: readonly string[]): PastePlan | null {
  const fragment = copySelection(nodes, paths, nodeIds)
  return fragment ? planPaste(nodes, paths, fragment, pasteOffset(1)) : null
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
