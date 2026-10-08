/**
 * Edit history across round trips to R.
 *
 * The editor's undo/redo stacks (see hooks/useHistory.ts) hold runtime
 * snapshots `{ models, currentModelId }`. To let the history survive the
 * Shiny app / addin closing (Done) and reopening on the returned GraphModel,
 * the stacks are serialized here into a JSON string that R keeps in
 * `GraphModel@metadata$editHistory`. It is never part of the schema: not in
 * `provenance`, not in saved JSON files, not in image export.
 *
 * Format (`format: "drawSEM-editHistory"`, `version: 1`):
 *   {
 *     format, version, savedAt,
 *     present: Snapshot,      // the document when the history was saved
 *     past:    Snapshot[],    // undo steps, oldest first
 *     future:  Snapshot[],    // redo steps, in stack order (last = next redo)
 *     data:    { [ref]: rows } // embedded dataset rows, stored once each
 *   }
 *   Snapshot = { models: { [modelKey]: schema Model }, current: modelKey | null }
 *
 * Snapshots are in schema form (labels, not runtime ids, which are regenerated
 * on every load). Each model omits `provenance` (R-owned fit results, carried
 * forward from the current document on restore anyway), and an embedded
 * dataset's `datasetSource.object` is replaced by `datasetSource.objectRef`,
 * a key into `data`, so the rows are stored once however many snapshots share
 * them.
 */
import type { RuntimeModel } from './runtimeToSchema'
import { modelToSchemaModel } from './runtimeToSchema'
import { convertDocToRuntime } from './runtimeConverter'

export interface DocSnapshot {
  models: RuntimeModel[]
  currentModelId: string | null
}

export interface SerializedSnapshot {
  models: Record<string, any>
  current: string | null
}

export interface SerializedEditHistory {
  format: typeof EDIT_HISTORY_FORMAT
  version: typeof EDIT_HISTORY_VERSION
  savedAt?: string
  present: SerializedSnapshot
  past: SerializedSnapshot[]
  future: SerializedSnapshot[]
  data?: Record<string, unknown>
}

export const EDIT_HISTORY_FORMAT = 'drawSEM-editHistory'
export const EDIT_HISTORY_VERSION = 1
/** Most undo + redo steps kept in a serialized history (the in-memory limit). */
export const EDIT_HISTORY_MAX_STEPS = 100
/**
 * Most characters of serialized snapshots (present + steps) kept. Embedded
 * dataset rows are stored once each in `data` and not counted.
 */
export const EDIT_HISTORY_MAX_CHARS = 1_000_000

export interface SerializeOptions {
  maxSteps?: number
  maxChars?: number
  now?: Date
}

// ---------------------------------------------------------------------------
// Serialize

/**
 * Serialize undo/redo stacks plus the current document to a JSON string, or
 * null when there is nothing to undo or redo (no history worth keeping).
 * Oldest undo steps are dropped first, then the farthest redo steps, to stay
 * within `maxSteps` and `maxChars`.
 */
export function serializeEditHistory(
  stacks: { past: DocSnapshot[]; future: DocSnapshot[] },
  present: DocSnapshot,
  options: SerializeOptions = {}
): string | null {
  const maxSteps = options.maxSteps ?? EDIT_HISTORY_MAX_STEPS
  const maxChars = options.maxChars ?? EDIT_HISTORY_MAX_CHARS
  if (stacks.past.length === 0 && stacks.future.length === 0) return null

  const data = new DataTable()
  // Snapshot objects are immutable and shared between steps: serialize each once.
  const encode = (s: DocSnapshot): Encoded => {
    const snap = toSerializedSnapshot(s, data)
    return { snap, chars: JSON.stringify(snap).length }
  }
  const presentEnc = encode(present)
  // Step cap: oldest undo steps go first, then the farthest redo steps.
  const keepFuture = Math.min(stacks.future.length, Math.max(0, maxSteps))
  const keepPast = Math.min(stacks.past.length, Math.max(0, maxSteps - keepFuture))
  const past = stacks.past.slice(stacks.past.length - keepPast).map(encode)
  const future = stacks.future.slice(stacks.future.length - keepFuture).map(encode)

  // Size cap, dropping in the same order.
  let total = presentEnc.chars + past.reduce((a, e) => a + e.chars, 0) + future.reduce((a, e) => a + e.chars, 0)
  while (total > maxChars && past.length + future.length > 0) {
    const dropped = past.length > 0 ? past.shift()! : future.shift()!
    total -= dropped.chars
  }
  if (past.length + future.length === 0) return null

  const used = new Set<string>()
  for (const e of [presentEnc, ...past, ...future]) collectRefs(e.snap, used)

  const out: SerializedEditHistory = {
    format: EDIT_HISTORY_FORMAT,
    version: EDIT_HISTORY_VERSION,
    savedAt: (options.now ?? new Date()).toISOString(),
    present: presentEnc.snap,
    past: past.map((e) => e.snap),
    future: future.map((e) => e.snap),
  }
  const table = data.subset(used)
  if (Object.keys(table).length > 0) out.data = table
  return JSON.stringify(out)
}

interface Encoded {
  snap: SerializedSnapshot
  chars: number
}

/** Embedded dataset rows, deduplicated by content (and by reference, to avoid re-stringifying). */
class DataTable {
  private byRef = new WeakMap<object, string>()
  private byJson = new Map<string, string>()
  private entries: Record<string, unknown> = {}
  private next = 1

  ref(rows: unknown): string {
    if (rows !== null && typeof rows === 'object') {
      const known = this.byRef.get(rows as object)
      if (known) return known
    }
    const json = JSON.stringify(rows)
    let key = this.byJson.get(json)
    if (!key) {
      key = `d${this.next++}`
      this.byJson.set(json, key)
      this.entries[key] = rows
    }
    if (rows !== null && typeof rows === 'object') this.byRef.set(rows as object, key)
    return key
  }

  subset(keys: Set<string>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(this.entries).filter(([k]) => keys.has(k)))
  }
}

function toSerializedSnapshot(s: DocSnapshot, data: DataTable): SerializedSnapshot {
  const models: Record<string, any> = {}
  for (const m of s.models) {
    const sm: any = { ...modelToSchemaModel(m) }
    delete sm.provenance
    sm.nodes = (sm.nodes ?? []).map((n: any) => {
      const ds = n.datasetSource
      if (!ds || ds.object === undefined) return n
      const { object, ...rest } = ds
      return { ...n, datasetSource: { ...rest, objectRef: data.ref(object) } }
    })
    models[m.id] = sm
  }
  return { models, current: s.currentModelId }
}

function collectRefs(snap: SerializedSnapshot, into: Set<string>): void {
  for (const m of Object.values(snap.models)) {
    for (const n of (m?.nodes ?? []) as any[]) {
      const ref = n?.datasetSource?.objectRef
      if (typeof ref === 'string') into.add(ref)
    }
  }
}

// ---------------------------------------------------------------------------
// Parse and restore

/** Parse a serialized history; null if it is missing, malformed or of another version. */
export function parseEditHistory(text: unknown): SerializedEditHistory | null {
  if (typeof text !== 'string' || text.length === 0) return null
  let h: any
  try {
    h = JSON.parse(text)
  } catch {
    return null
  }
  const isSnap = (s: any) => s && typeof s === 'object' && s.models && typeof s.models === 'object' && !Array.isArray(s.models)
  if (
    !h || h.format !== EDIT_HISTORY_FORMAT || h.version !== EDIT_HISTORY_VERSION ||
    !isSnap(h.present) || !Array.isArray(h.past) || !Array.isArray(h.future) ||
    !h.past.every(isSnap) || !h.future.every(isSnap)
  ) {
    return null
  }
  return h as SerializedEditHistory
}

/** A serialized snapshot as runtime state (embedded rows restored; no provenance). */
export function snapshotToRuntime(snap: SerializedSnapshot, data: Record<string, unknown> = {}): DocSnapshot {
  const models: Record<string, any> = {}
  for (const [key, m] of Object.entries(snap.models)) {
    models[key] = {
      ...m,
      nodes: ((m?.nodes ?? []) as any[]).map((n) => {
        const ds = n?.datasetSource
        if (!ds || typeof ds.objectRef !== 'string') return n
        const { objectRef, ...rest } = ds
        return { ...n, datasetSource: { ...rest, object: data[objectRef] } }
      }),
    }
  }
  const runtime = convertDocToRuntime({ models })
  const current = snap.current !== null && runtime.some((m) => m.id === snap.current)
    ? snap.current
    : (runtime[0]?.id ?? null)
  return { models: runtime, currentModelId: current }
}

export interface RestoreOptions {
  /**
   * Layout-only editor: a history whose steps change more than layout (e.g.
   * made in the full editor, or across a structural change in R) is dropped,
   * since undoing into it would change the model's structure.
   */
  layoutOnly?: boolean
}

export interface RestoredHistory {
  past: DocSnapshot[]
  future: DocSnapshot[]
  /** True when the opened document matched the history's saved state. */
  matched: boolean
}

/**
 * Undo/redo stacks for a document opened with a serialized history.
 *
 * The opened document is the current state either way. If it matches the
 * history's saved `present` (ignoring provenance, model-level visualization,
 * and number noise from the trip through R), the stacks are restored as saved.
 * Otherwise the model was changed in R in between (verbs, setLocation(), a
 * fit): the saved `present` becomes one more undo step, so the R-side change
 * is itself undoable, and the redo steps are dropped as after any new edit.
 */
export function restoreEditHistory(
  text: unknown,
  opened: DocSnapshot,
  options: RestoreOptions = {}
): RestoredHistory | null {
  const h = parseEditHistory(text)
  if (!h) return null
  const data = (h.data && typeof h.data === 'object') ? h.data : {}
  const present = snapshotToRuntime(h.present, data)
  let past = h.past.map((s) => snapshotToRuntime(s, data))
  let future = h.future.map((s) => snapshotToRuntime(s, data))

  const matched = comparableDocument(present.models) === comparableDocument(opened.models)
  if (!matched) {
    past = [...past, present]
    future = []
  }
  if (options.layoutOnly) {
    const structure = comparableDocument(opened.models, { structureOnly: true })
    if ([...past, ...future].some((s) => comparableDocument(s.models, { structureOnly: true }) !== structure)) {
      return null
    }
  }
  if (past.length === 0 && future.length === 0) return null
  return { past, future, matched }
}

/**
 * Canonical string of a document for "is this the same model" checks: schema
 * form without `provenance` or model-level `visualization`, keys sorted, null
 * treated as absent, node positions/sizes rounded to whole units and other
 * numbers to 10 significant digits (R's JSON round trip and generated
 * setLocation() code do not preserve full precision). `structureOnly` also
 * drops node and path `visual` (what a layout-only edit may change).
 */
export function comparableDocument(models: RuntimeModel[], options: { structureOnly?: boolean } = {}): string {
  const doc: Record<string, any> = {}
  for (const m of models) {
    const sm: any = { ...modelToSchemaModel(m) }
    delete sm.provenance
    delete sm.visualization
    if (options.structureOnly) {
      sm.nodes = (sm.nodes ?? []).map(({ visual, ...n }: any) => n)
      sm.paths = (sm.paths ?? []).map(({ visual, ...p }: any) => p)
    }
    doc[m.id] = sm
  }
  return JSON.stringify(canonical(doc, null))
}

const ROUNDED_KEYS = new Set(['x', 'y', 'width', 'height'])

function canonical(v: unknown, key: string | null): unknown {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v)
    return key !== null && ROUNDED_KEYS.has(key) ? Math.round(v) : Number(v.toPrecision(10))
  }
  if (Array.isArray(v)) return v.map((x) => canonical(x, null))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) {
      const x = (v as any)[k]
      if (x === undefined || x === null) continue
      out[k] = canonical(x, k)
    }
    return out
  }
  return v
}

// ---------------------------------------------------------------------------
// R-owned state on restore

/**
 * Apply an undo/redo `target` without reverting state R owns: each model's
 * `provenance` (fit results) is taken from the `current` model with the same
 * id, and dataset nodes without column summaries take them from the current
 * dataset node of the same label and source (R sends those summaries for data
 * it holds; they are display-only and never serialized). Fit staleness is
 * derived from `provenance.structureHash`, so restoring an older structure
 * shows the carried fit as stale, and redoing back to the fitted structure
 * shows it current again.
 */
export function carryForwardHostState(target: RuntimeModel[], current: RuntimeModel[]): RuntimeModel[] {
  const currentById = new Map(current.map((m) => [m.id, m]))
  let changed = false
  const out = target.map((m) => {
    const cur = currentById.get(m.id)
    if (!cur) return m
    let next = m
    const curProv = cur.passthrough?.provenance
    if (curProv !== m.passthrough?.provenance) {
      const { passthrough, ...rest } = next
      const pt: Record<string, any> = { ...(passthrough ?? {}) }
      if (curProv === undefined) delete pt.provenance
      else pt.provenance = curProv
      next = Object.keys(pt).length > 0 ? { ...rest, passthrough: pt } : rest
    }
    const summaries = new Map(cur.nodes.filter((n) => n.type === 'dataset' && n.dataset).map((n) => [n.label, n]))
    if (summaries.size > 0) {
      let nodesChanged = false
      const nodes = next.nodes.map((n) => {
        const src = n.type === 'dataset' && !n.dataset ? summaries.get(n.label) : undefined
        if (!src || !sameDataSource(n.datasetSource, src.datasetSource)) return n
        nodesChanged = true
        return { ...n, dataset: src.dataset }
      })
      if (nodesChanged) next = { ...next, nodes }
    }
    if (next !== m) changed = true
    return next
  })
  return changed ? out : target
}

// Embedded rows are summarized by the editor itself, so only R-held data
// (no datasetSource) and file connections are matched here.
function sameDataSource(a: any, b: any): boolean {
  if (!a && !b) return true
  if (!a || !b || a.type !== 'file' || b.type !== 'file') return false
  return a.location === b.location && a.md5 === b.md5
}
