/**
 * Data mappings: a data path's `label` names the dataset column mapped to its
 * variable (R maps that column, see R/converters.R). Pure helpers, no React.
 *
 * "Same as variable name" link: `Path.mappingLinked` is a runtime-only flag on
 * a data path saying that its column follows its variable's label (renaming
 * the variable renames the mapping too). It is never serialized: the schema
 * serializer writes only owned keys (see runtimeToSchema.ts), so the flag is
 * dropped there like runtime ids. While a path is linked its column equals its
 * variable's label. The flag is set
 *   - when a model is loaded (import, initial load, R `load`): every data path
 *     whose column equals its variable's label (`linkMappingsOnLoad`);
 *   - when R pushes a model that keeps the history (`data`, `fit`): flags carry
 *     over for data paths that still exist (same dataset and variable labels);
 *     new data paths are linked when the names match;
 *   - for data paths made by a column drop or a dataset -> variable drag when
 *     the names match, and for pasted / duplicated data paths.
 * Unticking clears it, and nothing but the cases above sets it again.
 */
import { convertToUnicode } from './converters'
import { isDatasetPath } from './helpers'
import type { Node, Path } from './helpers'
import type { RuntimeModel } from './runtimeToSchema'

/** `p` with `mappingLinked` set (true) or removed. */
export function withMappingLinked(p: Path, linked: boolean): Path {
  if (linked) return p.mappingLinked ? p : { ...p, mappingLinked: true }
  if (!p.mappingLinked) return p
  const { mappingLinked: _l, ...rest } = p
  return rest
}

/**
 * A data path mapping `column`: its label, and the display name the editor
 * derives from a label (as at load and in makeDataPath). The link is kept only
 * while the column still equals `variableLabel`.
 */
export function withMappingColumn(p: Path, column: string, variableLabel: string | undefined): Path {
  const next: Path = { ...p, label: column, displayName: convertToUnicode(column) }
  return withMappingLinked(next, !!p.mappingLinked && column === variableLabel)
}

/**
 * `paths` after the variable `nodeId` is renamed to `label`: each linked data
 * path into it maps the new label. The same array when nothing changes.
 */
export function followLinkedMappings(paths: Path[], nodeId: string, label: string): Path[] {
  let changed = false
  const out = paths.map((p) => {
    if (p.to !== nodeId || !p.mappingLinked || p.label === label) return p
    changed = true
    return withMappingColumn(p, label, label)
  })
  return changed ? out : paths
}

/** The data paths into the variable `nodeId`. */
export function incomingDataPaths(nodes: readonly Node[], paths: readonly Path[], nodeId: string): Path[] {
  return paths.filter((p) => p.to === nodeId && isDatasetPath(p, nodes as Node[]))
}

/**
 * The columns of a dataset node, when known: the data is loaded and its
 * headers are available (`dataset.headers`). Null otherwise.
 */
export function knownColumns(dataset: Node | undefined): readonly string[] | null {
  const headers = dataset?.type === 'dataset' ? dataset.dataset?.headers : undefined
  return Array.isArray(headers) && headers.length > 0 ? headers : null
}

/**
 * Whether a data path maps a column its dataset does not have. False when the
 * dataset's columns are not known (nothing to check against).
 */
export function isMissingColumn(p: Path, nodes: readonly Node[]): boolean {
  if (!isDatasetPath(p, nodes as Node[])) return false
  const columns = knownColumns(nodes.find((n) => n.id === p.from))
  if (!columns) return false
  return typeof p.label !== 'string' || !columns.includes(p.label)
}

/**
 * Link flags for freshly loaded `models`. Without `previous` (a new document)
 * every data path whose column equals its variable's label is linked. With
 * `previous` (an R push that keeps the history), a data path that existed
 * before (the same model id, dataset label and variable label) keeps its flag
 * (while its column still equals the variable's label); other data paths are
 * linked when the names match.
 */
export function linkMappingsOnLoad(models: RuntimeModel[], previous?: readonly RuntimeModel[]): RuntimeModel[] {
  const prevById = new Map((previous ?? []).map((m) => [m.id, m]))
  return models.map((m) => {
    const prev = previous ? prevById.get(m.id) : undefined
    const prevFlags = prev ? dataPathFlags(prev) : null
    const byId = new Map(m.nodes.map((n) => [n.id, n]))
    let changed = false
    const paths = m.paths.map((p) => {
      if (!isDatasetPath(p, m.nodes)) return p
      const from = byId.get(p.from)
      const to = byId.get(p.to)
      const sameName = !!to && typeof p.label === 'string' && p.label === to.label
      const key = from && to ? mappingKey(from.label, to.label) : null
      const carried = prevFlags && key !== null ? prevFlags.get(key) : undefined
      const next = withMappingLinked(p, sameName && (carried ?? true))
      if (next !== p) changed = true
      return next
    })
    return changed ? { ...m, paths } : m
  })
}

const mappingKey = (datasetLabel: string, variableLabel: string) => `${datasetLabel}\u0000${variableLabel}`

/** dataset label + variable label -> linked, for the data paths of `m`. */
function dataPathFlags(m: RuntimeModel): Map<string, boolean> {
  const byId = new Map(m.nodes.map((n) => [n.id, n]))
  const out = new Map<string, boolean>()
  for (const p of m.paths) {
    if (!isDatasetPath(p, m.nodes)) continue
    const from = byId.get(p.from)
    const to = byId.get(p.to)
    if (from && to) out.set(mappingKey(from.label, to.label), !!p.mappingLinked)
  }
  return out
}
