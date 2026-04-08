import { GraphSchema } from '../core/types'

/**
 * RAMPath Algorithm Implementation for Automatic Path Diagram Layout (with error node handling)
 *
 * Based on: Boker, McArdle, & Neale (2002)
 * Reference: "A note on the Powley method for computing the square root of a 2×2 matrix"
 *
 * Phases:
 * 1. Prepare data (extract variable nodes, build adjacency index)
 * 2. Compute longest paths (path finding without cycles)
 * 3. Assign ranks based on longest path length
 * 4-5. Sort nodes within ranks + assign coordinates (interleaved)
 * 6. Determine two-headed arrow sides (covariances)
 * 7. Position constants and database nodes
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface PositionMap {
  [nodeLabel: string]: {
    x: number
    y: number
    rank?: number
  }
}

export interface LayoutOptions {
  /** Node width for spacing (default: 100) */
  nodeWidth?: number
  /** Horizontal gap between nodes (default: 50) */
  gap?: number
  /** Vertical spacing between ranks (default: 150) */
  rankHeight?: number
}

interface ArrowPath {
  from: string
  to: string
}

interface ArrowIndex {
  incomingByTarget: Map<string, ArrowPath[]>
  outgoingBySource: Map<string, ArrowPath[]>
  oneHeadedPaths: ArrowPath[]
}

interface ErrorNodeInfo {
  /** The detected error/disturbance node label */
  nodeLabel: string
  /** The single target this error node drives */
  targetLabel: string
  /**
   * Placement strategy:
   * - 'below': target is terminal (no outgoing variable paths); error goes one rank below target.
   *   Classic CFA pattern: factor arrows arrive from above, error arrow arrives from below.
   * - 'beside': target is non-terminal (has outgoing variable paths); error goes at same rank.
   *   Disturbance pattern: factor disturbances, RAM predictor residuals.
   */
  placement: 'below' | 'beside'
}

interface PathRecord {
  length: number
  nodeSet: Set<string>
  to: string
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Apply RAMPath layout algorithm to a schema
 * Returns a map of node labels to {x, y, rank} positions
 */
export function autoLayout(schema: GraphSchema, options?: LayoutOptions): PositionMap {
  const layoutOpts: Required<LayoutOptions> = {
    nodeWidth: options?.nodeWidth ?? 100,
    gap: options?.gap ?? 50,
    rankHeight: options?.rankHeight ?? 150,
  }

  // Get the first (or only) model
  const modelKey = Object.keys(schema.models)[0]
  if (!modelKey) throw new Error('No models found in schema')
  const model = schema.models[modelKey]

  // PHASE 1: Prepare data — full arrow index over all variable nodes
  const { variableNodes, arrowIndex: fullArrowIndex } = prepareData(model)

  // PHASE 1.5: Detect error/disturbance nodes and remove them from the main layout set.
  // Error nodes distort rank assignment (they score rank 1 like factors, not rank 0 like
  // indicators) so they must be excluded from Phases 2-5 and positioned separately.
  const errorNodeInfos = detectErrorNodes(model, variableNodes, fullArrowIndex)
  const errorNodeLabels = new Set(errorNodeInfos.map(e => e.nodeLabel))

  // Main variable nodes: all variable nodes except detected error nodes
  const mainVariableNodes = new Set([...variableNodes].filter(n => !errorNodeLabels.has(n)))

  // Rebuild arrow index restricted to main variable nodes so error-node paths don't
  // participate in longest-path computation or barycenter calculations.
  const mainArrowIndex = buildArrowIndex(model.paths ?? [], mainVariableNodes)

  // PHASE 2: Compute longest paths (main nodes only)
  const longestPathByNode = computeLongestPaths(mainVariableNodes, mainArrowIndex)

  // PHASE 3: Assign ranks (main nodes only)
  const { ranks, rankIndex } = assignRanks(longestPathByNode, mainVariableNodes)

  // PHASES 4-5: Sort nodes within ranks & assign coordinates (interleaved)
  const positions = sortAndPositionRanks(ranks, rankIndex, mainArrowIndex, layoutOpts)

  // PHASE 5.5: Position error/disturbance nodes relative to their targets.
  // Uses the main arrow index to determine whether each target is terminal.
  // Updates rankIndex in-place so Phase 6 loop-side logic sees correct ranks.
  positionErrorNodes(errorNodeInfos, positions, rankIndex, mainArrowIndex, layoutOpts)

  // PHASE 6: Determine two-headed arrow sides
  // ranks array is rebuilt from the now-complete rankIndex (includes error nodes)
  const allRanks = buildRanksFromIndex(rankIndex)
  determineLoopSides(allRanks, rankIndex, model.paths)

  // PHASE 7: Position constants and database nodes
  positionConstantsAndDatabases(model, positions, layoutOpts)

  return positions
}

// ============================================================================
// PHASE 1: Prepare Data
// ============================================================================

function prepareData(model: any) {
  // Extract variable nodes (manifest and latent, excluding constants and datasets)
  const variableNodes = new Set<string>()
  model.nodes?.forEach((node: any) => {
    if (node.type === 'variable') {
      variableNodes.add(node.label)
    }
  })

  // Build arrow index
  const arrowIndex = buildArrowIndex(model.paths ?? [], variableNodes)

  return { variableNodes, arrowIndex }
}

function buildArrowIndex(paths: any[], variableNodes: Set<string>): ArrowIndex {
  const incomingByTarget = new Map<string, ArrowPath[]>()
  const outgoingBySource = new Map<string, ArrowPath[]>()
  const oneHeadedPaths: ArrowPath[] = []

  paths.forEach(path => {
    if (path.numberOfArrows === 1 && variableNodes.has(path.from) && variableNodes.has(path.to)) {
      const arrow = { from: path.from, to: path.to }

      // Add to incoming
      if (!incomingByTarget.has(path.to)) incomingByTarget.set(path.to, [])
      incomingByTarget.get(path.to)!.push(arrow)

      // Add to outgoing
      if (!outgoingBySource.has(path.from)) outgoingBySource.set(path.from, [])
      outgoingBySource.get(path.from)!.push(arrow)

      // Add to one-headed list
      oneHeadedPaths.push(arrow)
    }
  })

  return { incomingByTarget, outgoingBySource, oneHeadedPaths }
}

// ============================================================================
// PHASE 1.5: Detect Error / Disturbance Nodes
// ============================================================================

/**
 * Detect error/disturbance nodes using a structural signature that does not
 * rely on semantic naming conventions or parameterType labels.
 *
 * A node is classified as an error node when ALL of the following hold:
 *   1. It is a variable node (already guaranteed by variableNodes membership)
 *   2. It has exactly one two-headed self-loop, and that self-loop is free
 *      (the node's variance is freely estimated — it is a residual variance)
 *   3. It has no incoming one-headed paths from other variable nodes
 *      (nothing structurally drives it; it is exogenous by construction)
 *   4. It has exactly one outgoing one-headed path, where:
 *        a. The path is fixed at value 1.0 (unit loading — RAM error convention)
 *        b. The target node has no two-headed self-loop of its own
 *           (the target's variance comes from this error node, not a direct loop)
 *
 * Correlated errors (inter-node two-headed paths) are allowed and do not
 * disqualify a node — only self-loops are checked in condition 2.
 *
 * Known false positives (rare):
 *   - Single-indicator latent variables identified by fixing the loading to 1.0
 *     with no error term on the indicator (structurally identical to an error node).
 *   - Degenerate bifactor specific factors loading on exactly one indicator.
 * Both are uncommon and can be worked around by either fixing the factor variance
 * to 1.0 for identification (changes condition 2) or adding an explicit fixed-zero
 * error self-loop on the indicator (changes condition 4b).
 *
 * Placement rule (recorded in ErrorNodeInfo.placement):
 *   - 'below'  : target has no outgoing variable paths (terminal/indicator node).
 *                Error is placed one rank below the target — the classic opposing-
 *                arrows CFA sandwich (factor arrows down, error arrows up).
 *   - 'beside' : target has outgoing variable paths (factor, mediator, predictor).
 *                Error is placed at the same rank as its target — disturbance
 *                convention used in structural models and RAM all-Y notation.
 */
function detectErrorNodes(
  model: any,
  variableNodes: Set<string>,
  fullArrowIndex: ArrowIndex
): ErrorNodeInfo[] {
  const results: ErrorNodeInfo[] = []

  // --- Pre-compute self-loop sets from paths ---
  // hasFreeOwnLoop: nodes with at least one FREE two-headed self-loop
  // hasAnyOwnLoop : nodes with any two-headed self-loop (free or fixed)
  const hasFreeOwnLoop = new Set<string>()
  const hasAnyOwnLoop = new Set<string>()
  ;(model.paths ?? []).forEach((path: any) => {
    if (path.from === path.to && path.numberOfArrows === 2) {
      hasAnyOwnLoop.add(path.from)
      if (path.freeParameter) hasFreeOwnLoop.add(path.from)
    }
  })

  // Count self-loops per node (condition 2 requires exactly one)
  const ownLoopCount = new Map<string, number>()
  ;(model.paths ?? []).forEach((path: any) => {
    if (path.from === path.to && path.numberOfArrows === 2) {
      ownLoopCount.set(path.from, (ownLoopCount.get(path.from) ?? 0) + 1)
    }
  })

  // Index one-headed path properties by "from→to" key for O(1) lookup
  // (free/value are not stored in ArrowIndex, only topology is)
  const oneHeadedProps = new Map<string, { freeParameter: boolean | string | undefined; value: number | null }>()
  ;(model.paths ?? []).forEach((path: any) => {
    if (
      path.numberOfArrows === 1 &&
      variableNodes.has(path.from) &&
      variableNodes.has(path.to)
    ) {
      oneHeadedProps.set(`${path.from}\u2192${path.to}`, {
        freeParameter: path.freeParameter,
        value: path.value ?? null,
      })
    }
  })

  variableNodes.forEach(nodeId => {
    // Condition 2: exactly one two-headed self-loop AND it must be free
    if ((ownLoopCount.get(nodeId) ?? 0) !== 1) return
    if (!hasFreeOwnLoop.has(nodeId)) return

    // Condition 3: no incoming one-headed paths from other variable nodes
    const incoming = fullArrowIndex.incomingByTarget.get(nodeId) ?? []
    if (incoming.length > 0) return

    // Condition 4: exactly one outgoing one-headed path
    const outgoing = fullArrowIndex.outgoingBySource.get(nodeId) ?? []
    if (outgoing.length !== 1) return

    const targetLabel = outgoing[0].to
    const props = oneHeadedProps.get(`${nodeId}\u2192${targetLabel}`)

    // 4a: path must be fixed at value 1.0
    if (!props || props.freeParameter || props.value !== 1.0) return

    // 4b: target must have no two-headed self-loop
    if (hasAnyOwnLoop.has(targetLabel)) return

    // Placement: 'below' if target is terminal (no outgoing variable paths),
    //            'beside' if target drives other nodes (non-terminal)
    const targetOutgoing = fullArrowIndex.outgoingBySource.get(targetLabel) ?? []
    const placement: 'below' | 'beside' = targetOutgoing.length === 0 ? 'below' : 'beside'

    results.push({ nodeLabel: nodeId, targetLabel, placement })
  })

  return results
}

// ============================================================================
// PHASE 5.5: Position Error / Disturbance Nodes
// ============================================================================

/**
 * Position detected error/disturbance nodes after main variable nodes are placed.
 *
 * 'below' errors (terminal targets — manifest indicators):
 *   Placed directly below their target at x = target.x, y = target.y + rankHeight.
 *   If multiple errors share a terminal target (unusual but valid with correlated
 *   errors), they are spread symmetrically around the target's x.
 *   Rank assigned: targetRank - 1  (creates a sub-rank below rank 0).
 *
 * 'beside' errors (non-terminal targets — factors, mediators, predictors):
 *   Placed at the same y as their target, extending the rank to the right of the
 *   rightmost already-positioned node in that rank.
 *   Sorted by their target's x so left-associated errors appear leftmost.
 *   Rank assigned: targetRank  (same rank as target).
 *
 * rankIndex is updated in-place so Phase 6 (loop-side assignment) sees the
 * correct rank for every error node.
 */
function positionErrorNodes(
  errorNodeInfos: ErrorNodeInfo[],
  positions: PositionMap,
  rankIndex: Map<string, number>,
  mainArrowIndex: ArrowIndex,
  options: Required<LayoutOptions>
): void {
  const { nodeWidth, gap, rankHeight } = options
  if (errorNodeInfos.length === 0) return

  // --- 'below' errors: group by target ---
  const belowByTarget = new Map<string, string[]>()
  errorNodeInfos
    .filter(e => e.placement === 'below')
    .forEach(e => {
      if (!belowByTarget.has(e.targetLabel)) belowByTarget.set(e.targetLabel, [])
      belowByTarget.get(e.targetLabel)!.push(e.nodeLabel)
    })

  belowByTarget.forEach((errors, targetLabel) => {
    const targetPos = positions[targetLabel]
    if (!targetPos) return
    const targetRank = rankIndex.get(targetLabel) ?? 0
    const errorRank = targetRank - 1
    const errorY = targetPos.y + rankHeight

    // Spread multiple errors symmetrically around the visual centre of the target.
    // targetPos.x is the left edge of the target node, so its centre is
    // targetPos.x + nodeWidth/2.  We centre the error row on that same point.
    const count = errors.length
    const totalWidth = count * nodeWidth + (count - 1) * gap
    const startX = targetPos.x + nodeWidth / 2 - totalWidth / 2

    errors.forEach((errorId, idx) => {
      positions[errorId] = {
        x: startX + idx * (nodeWidth + gap),
        y: errorY,
        rank: errorRank,
      }
      rankIndex.set(errorId, errorRank)
    })
  })

  // --- 'beside' errors: group by target rank ---
  // Within each rank, sort beside-errors by their target's x so placement order
  // follows the left-to-right arrangement of the rank.
  const besideByRank = new Map<number, ErrorNodeInfo[]>()
  errorNodeInfos
    .filter(e => e.placement === 'beside')
    .forEach(e => {
      const targetRank = rankIndex.get(e.targetLabel)
      if (targetRank === undefined) return
      if (!besideByRank.has(targetRank)) besideByRank.set(targetRank, [])
      besideByRank.get(targetRank)!.push(e)
    })

  besideByRank.forEach((errors, targetRank) => {
    // Sort by target x (ascending) so errors extend the rank in a predictable order
    const sorted = [...errors].sort(
      (a, b) => (positions[a.targetLabel]?.x ?? 0) - (positions[b.targetLabel]?.x ?? 0)
    )

    // Find the rightmost x already occupied in this rank
    let maxX = -Infinity
    Object.values(positions).forEach(pos => {
      if (pos.rank === targetRank) maxX = Math.max(maxX, pos.x)
    })
    if (maxX === -Infinity) maxX = 0 // fallback for empty rank (shouldn't happen)

    sorted.forEach((info, idx) => {
      const targetPos = positions[info.targetLabel]
      if (!targetPos) return
      const errorX = maxX + (idx + 1) * (nodeWidth + gap)
      positions[info.nodeLabel] = {
        x: errorX,
        y: targetPos.y,
        rank: targetRank,
      }
      rankIndex.set(info.nodeLabel, targetRank)
    })
  })
}

// ============================================================================
// Helper: Rebuild ranks array from a complete rankIndex
// ============================================================================

/**
 * Reconstruct the ranks array (used by Phase 6) from a rankIndex that now
 * includes error nodes. Ranks are ordered from lowest rank number to highest
 * so that Phase 6's rankIdx=0 corresponds to the bottom-most visual rank.
 */
function buildRanksFromIndex(rankIndex: Map<string, number>): string[][] {
  const ranksByNumber = new Map<number, string[]>()
  rankIndex.forEach((rankNum, nodeId) => {
    if (!ranksByNumber.has(rankNum)) ranksByNumber.set(rankNum, [])
    ranksByNumber.get(rankNum)!.push(nodeId)
  })
  const sortedNums = [...ranksByNumber.keys()].sort((a, b) => a - b)
  return sortedNums.map(n => ranksByNumber.get(n)!)
}

// ============================================================================
// PHASE 2: Compute Longest Paths
// ============================================================================

function computeLongestPaths(variableNodes: Set<string>, arrowIndex: ArrowIndex): Map<string, number> {
  const longestPathByNode = new Map<string, number>()
  const pathsBySource = new Map<string, PathRecord[]>()

  // Initialize: all nodes start with longest path 0
  variableNodes.forEach(node => {
    longestPathByNode.set(node, 0)
  })

  // Initialize one-step paths: X→Y means X has outgoing path length 1
  arrowIndex.oneHeadedPaths.forEach(path => {
    if (!pathsBySource.has(path.from)) pathsBySource.set(path.from, [])
    const pathRecord: PathRecord = {
      length: 1,
      nodeSet: new Set([path.from, path.to]),
      to: path.to,
    }
    pathsBySource.get(path.from)!.push(pathRecord)
    longestPathByNode.set(path.from, 1)
  })

  // Iteratively extend paths
  let hasChanges = true
  while (hasChanges) {
    hasChanges = false

    variableNodes.forEach(sourceNode => {
      const paths = pathsBySource.get(sourceNode)
      if (!paths || paths.length === 0) return

      const currentMaxLength = Math.max(...paths.map(p => p.length))
      const pathsAtMax = paths.filter(p => p.length === currentMaxLength)

      pathsAtMax.forEach(path => {
        const nextNode = path.to
        const nextOutgoing = arrowIndex.outgoingBySource.get(nextNode) ?? []

        nextOutgoing.forEach(arrow => {
          if (!path.nodeSet.has(arrow.to)) {
            const newPath: PathRecord = {
              length: path.length + 1,
              nodeSet: new Set([...path.nodeSet, arrow.to]),
              to: arrow.to,
            }
            pathsBySource.get(sourceNode)!.push(newPath)
            const currentLongest = longestPathByNode.get(sourceNode) ?? 0
            longestPathByNode.set(sourceNode, Math.max(currentLongest, newPath.length))
            hasChanges = true
          }
        })
      })
    })
  }

  // Special handling for isolated nodes: rank them as sources (Infinity so they appear first)
  variableNodes.forEach(node => {
    const hasIncoming = (arrowIndex.incomingByTarget.get(node) ?? []).length > 0
    const hasOutgoing = (arrowIndex.outgoingBySource.get(node) ?? []).length > 0

    if (!hasIncoming && !hasOutgoing) {
      longestPathByNode.set(node, Infinity)
    }
  })

  return longestPathByNode
}

// ============================================================================
// PHASE 3: Assign Ranks
// ============================================================================

interface RankAssignment {
  ranks: string[][]
  rankIndex: Map<string, number>
}

function assignRanks(longestPathByNode: Map<string, number>, variableNodes: Set<string>): RankAssignment {
  const ranksByPathLength = new Map<number | string, string[]>()

  // Group nodes by longest path length
  variableNodes.forEach(nodeId => {
    const pathLength = longestPathByNode.get(nodeId) ?? 0
    const key = pathLength === Infinity ? 'infinity' : pathLength
    if (!ranksByPathLength.has(key)) ranksByPathLength.set(key, [])
    ranksByPathLength.get(key)!.push(nodeId)
  })

  // Find max finite path length for isolated nodes
  const finitePaths = [...longestPathByNode.values()].filter(p => p !== Infinity)
  const maxFinitePath = finitePaths.length > 0 ? Math.max(...finitePaths) : 0

  // Create rankIndex map (assigns rank = path length, Infinity nodes get maxFinitePath)
  const rankIndex = new Map<string, number>()
  variableNodes.forEach(nodeId => {
    const pathLength = longestPathByNode.get(nodeId) ?? 0
    rankIndex.set(nodeId, pathLength === Infinity ? maxFinitePath : pathLength)
  })

  // Create ranks array for positioning (sorted by frequency - widest first)
  const rankCounts = new Map<number, number>()
  rankIndex.forEach(rank => {
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1)
  })

  const sortedRanksByWidth = [...rankCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rank]) => rank)

  const ranks: string[][] = sortedRanksByWidth.map(rank =>
    [...variableNodes].filter(nodeId => rankIndex.get(nodeId) === rank)
  )

  return { ranks, rankIndex }
}

// ============================================================================
// PHASES 4-5: Sort & Position
// ============================================================================

function sortAndPositionRanks(
  ranks: string[][],
  rankIndex: Map<string, number>,
  arrowIndex: ArrowIndex,
  options: Required<LayoutOptions>
): PositionMap {
  const positions: PositionMap = {}
  const { nodeWidth, gap, rankHeight } = options

  // Build ranksByNumber map from rankIndex
  const ranksByNumber = new Map<number, string[]>()
  rankIndex.forEach((rankNum, nodeId) => {
    if (!ranksByNumber.has(rankNum)) ranksByNumber.set(rankNum, [])
    ranksByNumber.get(rankNum)!.push(nodeId)
  })

  const sortedRankNumbers = [...ranksByNumber.keys()].sort((a, b) => a - b)

  if (sortedRankNumbers.length === 0) return positions

  // Create a mapping from actual rank numbers to visual position indices (0, 1, 2, ...)
  // This compresses empty ranks so there are no gaps
  const rankToPositionIndex = new Map<number, number>()
  sortedRankNumbers.forEach((rankNum, idx) => {
    rankToPositionIndex.set(rankNum, idx)
  })

  const maxPositionIndex = sortedRankNumbers.length - 1

  // Find widest rank
  let widestRankNum = sortedRankNumbers[0]
  let maxNodes = 0
  sortedRankNumbers.forEach(rankNum => {
    const nodeCount = ranksByNumber.get(rankNum)?.length ?? 0
    if (nodeCount > maxNodes) {
      maxNodes = nodeCount
      widestRankNum = rankNum
    }
  })

  // Position widest rank first (y position = inverted for sources at top)
  {
    const rank = ranksByNumber.get(widestRankNum)!
    const nodeCount = rank.length
    const totalWidth = nodeCount * nodeWidth + (nodeCount - 1) * gap
    const startX = -totalWidth / 2
    const positionIndex = rankToPositionIndex.get(widestRankNum)!

    rank.forEach((nodeId, idx) => {
      positions[nodeId] = {
        x: startX + idx * (nodeWidth + gap),
        y: (maxPositionIndex - positionIndex) * rankHeight,
        rank: widestRankNum,
      }
    })
  }

  // Position remaining ranks
  sortedRankNumbers.forEach(rankNum => {
    if (rankNum === widestRankNum) return

    const rank = ranksByNumber.get(rankNum)!
    const positionIndex = rankToPositionIndex.get(rankNum)!

    // Compute barycenters
    const barycenters = new Map<string, number>()
    rank.forEach(nodeId => {
      const incomingSources = arrowIndex.incomingByTarget.get(nodeId) ?? []
      const sourceXPositions = incomingSources
        .map(src => positions[src.from]?.x)
        .filter((x): x is number => x !== undefined)

      if (sourceXPositions.length === 0) {
        barycenters.set(nodeId, Infinity)
      } else {
        const avg = sourceXPositions.reduce((a, b) => a + b) / sourceXPositions.length
        barycenters.set(nodeId, avg)
      }
    })

    // Sort by barycenter
    const sortedRank = [...rank].sort((a, b) => {
      const aBar = barycenters.get(a) ?? Infinity
      const bBar = barycenters.get(b) ?? Infinity
      return aBar - bBar
    })

    // Position nodes
    const nodeCount = sortedRank.length
    const totalWidth = nodeCount * nodeWidth + (nodeCount - 1) * gap
    const startX = -totalWidth / 2

    sortedRank.forEach((nodeId, idx) => {
      positions[nodeId] = {
        x: startX + idx * (nodeWidth + gap),
        y: (maxPositionIndex - positionIndex) * rankHeight,
        rank: rankNum,
      }
    })
  })

  return positions
}

// ============================================================================
// PHASE 6: Two-Headed Arrow Sides
// ============================================================================

function determineLoopSides(ranks: string[][], rankIndex: Map<string, number>, paths: any[]): void {
  const twoHeadedPaths = paths?.filter((p: any) => p.numberOfArrows === 2) ?? []

  ranks.forEach((rank, rankIdx) => {
    let incomingCount = 0
    let outgoingCount = 0

    rank.forEach(nodeId => {
      const incomingPaths = (paths ?? []).filter((p: any) => p.numberOfArrows === 1 && p.to === nodeId)
      incomingPaths.forEach((p: any) => {
        const sourceRank = rankIndex.get(p.from)
        if (sourceRank !== undefined && sourceRank < rankIdx) incomingCount++
      })

      const outgoingPaths = (paths ?? []).filter((p: any) => p.numberOfArrows === 1 && p.from === nodeId)
      outgoingPaths.forEach((p: any) => {
        const targetRank = rankIndex.get(p.to)
        if (targetRank !== undefined && targetRank > rankIdx) outgoingCount++
      })
    })

    let preferredSide = 'top'
    if (rankIdx === 0) preferredSide = 'bottom'
    else if (rankIdx === ranks.length - 1) preferredSide = 'top'
    else if (incomingCount > outgoingCount) preferredSide = 'bottom'
    else if (outgoingCount > incomingCount) preferredSide = 'top'
    else preferredSide = rankIdx < ranks.length / 2 ? 'bottom' : 'top'

    twoHeadedPaths.forEach((path: any) => {
      if (!path.visual) path.visual = {}
      if (path.visual.loopSide) return
      if (rank.indexOf(path.from) >= 0 || rank.indexOf(path.to) >= 0) {
        path.visual.loopSide = preferredSide
      }
    })
  })
}

// ============================================================================
// PHASE 7: Constants & Databases
// ============================================================================

function positionConstantsAndDatabases(model: any, positions: PositionMap, options: Required<LayoutOptions>): void {
  const { nodeWidth, gap, rankHeight } = options

  // Get all variable ranks and compute middle rank
  const variableRanks = Object.values(positions)
    .filter((p: any) => p.rank !== undefined && typeof p.rank === 'number')
    .map((p: any) => p.rank) as number[]
  
  const uniqueRanks = [...new Set(variableRanks)].sort((a, b) => a - b)
  const middleRankIndex = Math.floor(uniqueRanks.length / 2)
  const middleRank = uniqueRanks[middleRankIndex]

  // Group constants and databases by their placement decision
  const nodesToPosition: Array<{node: any; targets: string[]; isConstant: boolean; medianRank: number}> = []

  model.nodes?.forEach((node: any) => {
    if (node.type !== 'constant' && node.type !== 'dataset') return

    const targets: string[] = []
    model.paths?.forEach((path: any) => {
      if (path.from === node.label && positions[path.to]) {
        targets.push(path.to)
      }
    })

    // Get ranks of targets
    const targetRanks = targets
      .map(t => positions[t]?.rank)
      .filter((r): r is number => r !== undefined)
    
    const medianRank = targetRanks.length > 0
      ? targetRanks.sort((a, b) => a - b)[Math.floor(targetRanks.length / 2)]
      : middleRank

    nodesToPosition.push({
      node,
      targets,
      isConstant: node.type === 'constant',
      medianRank
    })
  })

  // Separate into above and below groups
  const aboveNodes: typeof nodesToPosition = []
  const belowNodes: typeof nodesToPosition = []

  nodesToPosition.forEach(item => {
    if (item.isConstant) {
      // Constants: above if median >= middle, below if median < middle
      if (item.medianRank >= middleRank) {
        aboveNodes.push(item)
      } else {
        belowNodes.push(item)
      }
    } else {
      // Databases: above if median > middle, below if median <= middle
      if (item.medianRank > middleRank) {
        aboveNodes.push(item)
      } else {
        belowNodes.push(item)
      }
    }
  })

  // Position above nodes (use rank -1, positioned horizontally)
  // Sort by barycenter of targets (left to right)
  const aboveWithBarycenters = aboveNodes.map(item => {
    const targetXs = item.targets.map(t => positions[t]?.x ?? 0)
    const barycenter = targetXs.length > 0 
      ? targetXs.reduce((a, b) => a + b) / targetXs.length
      : 0
    return { ...item, barycenter }
  }).sort((a, b) => a.barycenter - b.barycenter)

  if (aboveWithBarycenters.length > 0) {
    const nodeCount = aboveWithBarycenters.length
    const totalWidth = nodeCount * nodeWidth + (nodeCount - 1) * gap
    const startX = -totalWidth / 2
    
    aboveWithBarycenters.forEach((item, idx) => {
      positions[item.node.label] = {
        x: startX + idx * (nodeWidth + gap),
        y: -rankHeight,
        rank: -1
      }
    })
  }

  // Position below nodes (use rank beyond max variable rank, positioned horizontally)
  const maxVariableRank = Math.max(...uniqueRanks)
  const belowWithBarycenters = belowNodes.map(item => {
    const targetXs = item.targets.map(t => positions[t]?.x ?? 0)
    const barycenter = targetXs.length > 0 
      ? targetXs.reduce((a, b) => a + b) / targetXs.length
      : 0
    return { ...item, barycenter }
  }).sort((a, b) => a.barycenter - b.barycenter)

  if (belowWithBarycenters.length > 0) {
    const nodeCount = belowWithBarycenters.length
    const totalWidth = nodeCount * nodeWidth + (nodeCount - 1) * gap
    const startX = -totalWidth / 2
    const belowRank = maxVariableRank + 1
    
    belowWithBarycenters.forEach((item, idx) => {
      positions[item.node.label] = {
        x: startX + idx * (nodeWidth + gap),
        y: belowRank * rankHeight,
        rank: belowRank
      }
    })
  }
}
