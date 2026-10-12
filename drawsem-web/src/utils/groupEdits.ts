/**
 * Edits that add or change many paths/nodes at once: drag-to-many path
 * creation and the multi-selection popup's group actions. Pure (no React):
 * each planner returns what to add and what it skipped, and the editor applies
 * the result in one state update (one undo step).
 */
import { convertToUnicode } from './converters'
import { makeDataPath, makeNode, makePath, uniqueNodeLabel } from './helpers'
import type { Node, Path } from './helpers'

// ---------------------------------------------------------------------------
// Path rules
// ---------------------------------------------------------------------------

/** Why a path cannot be added. */
export type PathIssue =
  | 'self-one-headed'
  | 'dataset-target'
  | 'constant-target'
  | 'constant-two-headed'
  | 'dataset-two-headed'
  | 'duplicate-one-headed'
  | 'duplicate-two-headed'

/** The full explanation, shown when a single path is refused. */
export const PATH_ISSUE_MESSAGE: Record<PathIssue, string> = {
  'self-one-headed': 'Self-paths must be two-headed (variance). Use ↔ to create variance.',
  'dataset-target': 'Dataset nodes can only be data sources, not path destinations. Paths must originate FROM datasets, not TO datasets.',
  'constant-target': 'Constants cannot be path destinations. Constants are fixed values that can only serve as sources (→).',
  'constant-two-headed': 'Constants cannot have two-headed paths (↔). Constants can only have one-headed outgoing paths (→).',
  'dataset-two-headed': 'Datasets cannot have two-headed paths. Use → for one-headed paths from datasets.',
  'duplicate-one-headed': 'A one-headed path already exists between these nodes.',
  'duplicate-two-headed': 'A two-headed path already exists between these nodes.',
}

/** A short reason, used in the summary of a many-path edit. */
export const PATH_ISSUE_SHORT: Record<PathIssue, string> = {
  'self-one-headed': 'self-paths must be two-headed',
  'dataset-target': 'datasets cannot be targets',
  'constant-target': 'constants cannot be targets',
  'constant-two-headed': 'constants cannot have two-headed paths',
  'dataset-two-headed': 'datasets cannot have two-headed paths',
  'duplicate-one-headed': 'already connected',
  'duplicate-two-headed': 'already connected',
}

/** Is there a two-headed path between a and b (either order)? */
function hasTwoHeaded(paths: readonly Path[], a: string, b: string): boolean {
  return paths.some((p) => p.twoSided && ((p.from === a && p.to === b) || (p.from === b && p.to === a)))
}

/**
 * Why the path src -> dst (two-headed or not) cannot be added to a model with
 * these nodes and paths, or null when it can.
 */
export function pathIssue(nodes: readonly Node[], paths: readonly Path[], src: string, dst: string, twoSided: boolean): PathIssue | null {
  const srcNode = nodes.find((n) => n.id === src)
  const dstNode = nodes.find((n) => n.id === dst)
  if (src === dst && !twoSided) return 'self-one-headed'
  if (dstNode?.type === 'dataset') return 'dataset-target'
  if (dstNode?.type === 'constant') return 'constant-target'
  if (srcNode?.type === 'constant' && twoSided) return 'constant-two-headed'
  if (srcNode?.type === 'dataset' && twoSided) return 'dataset-two-headed'
  if (!twoSided && paths.some((p) => p.from === src && p.to === dst && !p.twoSided)) return 'duplicate-one-headed'
  if (twoSided && hasTwoHeaded(paths, src, dst)) return 'duplicate-two-headed'
  return null
}

/**
 * The path a drag from src to dst creates: a data path from a dataset (the
 * target's label as the column name); a free error variance for a two-headed
 * self-path; otherwise an unlabelled path with no value (schema defaults).
 */
export function newDraggedPath(nodes: readonly Node[], src: string, dst: string, twoSided: boolean): Path {
  const srcNode = nodes.find((n) => n.id === src)
  const dstNode = nodes.find((n) => n.id === dst)
  if (srcNode?.type === 'dataset') {
    return makeDataPath(src, dst, dstNode?.label, convertToUnicode(dstNode?.label ?? ''))
  }
  return makePath({
    from: src,
    to: dst,
    twoSided,
    ...(src === dst && twoSided ? { freeParameter: true, parameterType: 'errorVariance' } : {}),
    displayName: convertToUnicode(srcNode?.label ?? src) + (twoSided ? ' ↔ ' : ' → ') + convertToUnicode(dstNode?.label ?? dst),
  })
}

// ---------------------------------------------------------------------------
// Drag-to-many
// ---------------------------------------------------------------------------

export type NodePair = readonly [string, string]

/** Every unordered pair of distinct ids, in list order. */
export function allPairs(ids: readonly string[]): NodePair[] {
  const out: NodePair[] = []
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]])
  return out
}

/**
 * Which (from, to) pairs a path drag creates.
 *   - `sources`: the nodes the drag started from (every selected node when the
 *     start node was in a multi-selection, else just the start node);
 *   - `selected`: the selected node ids;
 *   - released on the start node itself: just that node (a variance when
 *     two-headed), whatever is selected;
 *   - start and end both in a multi-selection: two-headed, a pair for every two
 *     distinct selected nodes; one-headed, just start -> end;
 *   - otherwise every source to every target, where the targets are every
 *     selected node when the end node is in a multi-selection, else the end
 *     node. Self pairs are left out, and two-headed pairs are unordered
 *     (A↔B is B↔A).
 */
export function dragPathPairs(args: {
  start: string
  end: string
  sources: readonly string[]
  selected: readonly string[]
  twoSided: boolean
}): NodePair[] {
  const { start, end, sources, selected, twoSided } = args
  if (start === end) return [[start, start]]
  const inGroup = (id: string) => selected.length > 1 && selected.includes(id)
  if (inGroup(start) && inGroup(end)) return twoSided ? allPairs(selected) : [[start, end]]
  const targets = inGroup(end) ? selected : [end]
  const out: NodePair[] = []
  const seen = new Set<string>()
  for (const s of sources) {
    for (const t of targets) {
      if (s === t) continue
      const k = twoSided ? [s, t].sort().join('\u0000') : `${s}\u0000${t}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push([s, t])
    }
  }
  return out
}

export interface SkippedPair {
  from: string
  to: string
  issue: PathIssue
}

export interface PathPlan {
  added: Path[]
  skipped: SkippedPair[]
}

/**
 * Check each pair in turn (against the model plus the paths planned so far) and
 * build the paths for the valid ones.
 */
export function planDraggedPaths(nodes: readonly Node[], paths: readonly Path[], pairs: readonly NodePair[], twoSided: boolean): PathPlan {
  const added: Path[] = []
  const skipped: SkippedPair[] = []
  for (const [from, to] of pairs) {
    const issue = pathIssue(nodes, [...paths, ...added], from, to, twoSided)
    if (issue) skipped.push({ from, to, issue })
    else added.push(newDraggedPath(nodes, from, to, twoSided))
  }
  return { added, skipped }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const MAX_EXAMPLES = 3

function plural(k: number, word: string, pluralWord = `${word}s`): string {
  return `${k} ${k === 1 ? word : pluralWord}`
}

/**
 * "(already connected: x1→x2, x1→x3; constants cannot be targets: F→1)":
 * skipped items grouped by reason, a few examples each.
 */
export function skippedDetail(groups: ReadonlyArray<{ reason: string; item: string }>): string {
  const byReason = new Map<string, string[]>()
  for (const g of groups) byReason.set(g.reason, [...(byReason.get(g.reason) ?? []), g.item])
  const parts = [...byReason.entries()].map(([reason, items]) => {
    const shown = items.slice(0, MAX_EXAMPLES).join(', ')
    const more = items.length > MAX_EXAMPLES ? `, +${items.length - MAX_EXAMPLES} more` : ''
    return `${reason}: ${shown}${more}`
  })
  return parts.length > 0 ? ` (${parts.join('; ')})` : ''
}

/**
 * The summary of an edit that added `added` things and skipped some:
 * "Added 5 paths; skipped 2 (already connected: x1→x2; …)." /
 * "No paths added; skipped 2 (…)." / "Added 5 paths."
 */
export function addedSkippedMessage(
  added: number,
  noun: string,
  skipped: ReadonlyArray<{ reason: string; item: string }>,
  nounPlural = `${noun}s`
): string {
  return withSkipped(added > 0 ? `Added ${plural(added, noun, nounPlural)}` : `No ${nounPlural} added`, skipped)
}

/** `head`, then "; skipped N (…)" when anything was skipped, then a full stop. */
export function withSkipped(head: string, skipped: ReadonlyArray<{ reason: string; item: string }>): string {
  if (skipped.length === 0) return `${head}.`
  return `${head}; skipped ${skipped.length}${skippedDetail(skipped)}.`
}

/** Node label for messages. */
function labelOf(nodes: readonly Node[], id: string): string {
  return nodes.find((n) => n.id === id)?.label ?? id
}

/** The summary of a drag that created several paths. */
export function draggedPathsMessage(nodes: readonly Node[], plan: PathPlan, twoSided: boolean): string {
  const arrow = twoSided ? '↔' : '→'
  return addedSkippedMessage(
    plan.added.length,
    'path',
    plan.skipped.map((s) => ({ reason: PATH_ISSUE_SHORT[s.issue], item: `${labelOf(nodes, s.from)}${arrow}${labelOf(nodes, s.to)}` }))
  )
}

// ---------------------------------------------------------------------------
// Group actions (multi-selection popup)
// ---------------------------------------------------------------------------

/** Distance below a selection's bounding box at which a new constant is placed. */
export const NEW_CONSTANT_GAP = 60

export interface MeansPlan {
  /** The constant node to add first, when none was usable. */
  newConstant: Node | null
  /** The constant the paths start from. */
  constantId: string | null
  added: Path[]
  /** Variables that already have a mean (a one-headed path from a constant). */
  skipped: string[]
}

/**
 * "Add means": a free, anonymous one-headed path (parameterType "mean") from a
 * constant to every selected variable that has no one-headed path from any
 * constant yet. The constant is the selected one if exactly one constant is
 * selected; else the node labelled "1"; else a new constant, centred
 * `NEW_CONSTANT_GAP` below `below` (the selection's bounding box). Nothing is
 * created when no variable needs a mean.
 */
export function planAddMeans(
  nodes: readonly Node[],
  paths: readonly Path[],
  selectedNodeIds: readonly string[],
  below: { minX: number; maxX: number; maxY: number } | null
): MeansPlan {
  const selected = selectedNodeIds.map((id) => nodes.find((n) => n.id === id)).filter((n): n is Node => !!n)
  const variables = selected.filter((n) => n.type === 'variable')
  const constantIds = new Set(nodes.filter((n) => n.type === 'constant').map((n) => n.id))
  const hasMean = (v: Node) => paths.some((p) => p.to === v.id && !p.twoSided && constantIds.has(p.from))
  const needing = variables.filter((v) => !hasMean(v))
  const skipped = variables.filter(hasMean).map((v) => v.label)
  if (needing.length === 0) return { newConstant: null, constantId: null, added: [], skipped }

  const selectedConstants = selected.filter((n) => n.type === 'constant')
  let constant: Node | undefined = selectedConstants.length === 1 ? selectedConstants[0] : nodes.find((n) => n.type === 'constant' && n.label === '1')
  let newConstant: Node | null = null
  if (!constant) {
    const x = below ? (below.minX + below.maxX) / 2 : 0
    const y = below ? below.maxY + NEW_CONSTANT_GAP : 0
    newConstant = makeNode({ label: uniqueNodeLabel(nodes as Node[], 'constant'), type: 'constant', x, y })
    constant = newConstant
  }
  const c = constant
  const added = needing.map((v) =>
    makePath({
      from: c.id,
      to: v.id,
      twoSided: false,
      freeParameter: true,
      parameterType: 'mean',
      displayName: `${convertToUnicode(c.label)} → ${convertToUnicode(v.label)}`,
    })
  )
  return { newConstant, constantId: c.id, added, skipped }
}

/**
 * 'Added 3 mean paths from "1"; skipped 1 (already has a mean: x1).' /
 * 'Added constant "1" and 3 mean paths.'
 */
export function addMeansMessage(plan: MeansPlan, constantLabel: string | null): string {
  const n = plan.added.length
  const skipped = plan.skipped.map((l) => ({ reason: 'already has a mean', item: l }))
  if (n === 0) return withSkipped(skipped.length > 0 ? 'No mean paths added' : 'No variables selected', skipped)
  const head = plan.newConstant
    ? `Added constant "${plan.newConstant.label}" and ${plural(n, 'mean path')}`
    : `Added ${plural(n, 'mean path')} from "${constantLabel ?? '?'}"`
  return withSkipped(head, skipped)
}

export interface CorrelatePlan {
  added: Path[]
  /** "x1↔x2" for each pair that already had a two-headed path. */
  skipped: string[]
}

/**
 * "Correlate all": a free, anonymous two-headed path (parameterType
 * "covariance") between every pair of selected variables without one.
 */
export function planCorrelateAll(nodes: readonly Node[], paths: readonly Path[], selectedNodeIds: readonly string[]): CorrelatePlan {
  const variables = selectedNodeIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is Node => !!n && n.type === 'variable')
  const added: Path[] = []
  const skipped: string[] = []
  for (const [a, b] of allPairs(variables.map((v) => v.id))) {
    const na = variables.find((v) => v.id === a)!
    const nb = variables.find((v) => v.id === b)!
    if (hasTwoHeaded(paths, a, b)) {
      skipped.push(`${na.label}↔${nb.label}`)
      continue
    }
    added.push(makePath({
      from: a,
      to: b,
      twoSided: true,
      freeParameter: true,
      parameterType: 'covariance',
      displayName: `${convertToUnicode(na.label)} ↔ ${convertToUnicode(nb.label)}`,
    }))
  }
  return { added, skipped }
}

export function correlateAllMessage(plan: CorrelatePlan): string {
  return addedSkippedMessage(plan.added.length, 'covariance', plan.skipped.map((s) => ({ reason: 'already correlated', item: s })))
}

// ---------------------------------------------------------------------------
// Shared values ("mixed")
// ---------------------------------------------------------------------------

export const MIXED: unique symbol = Symbol('mixed')
export type Mixed = typeof MIXED

/** The value every item shares, or MIXED when they differ (undefined for no items). */
export function sharedValue<T, V>(items: readonly T[], get: (t: T) => V): V | Mixed | undefined {
  if (items.length === 0) return undefined
  const first = get(items[0])
  return items.every((t) => Object.is(get(t), first)) ? first : MIXED
}
