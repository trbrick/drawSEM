import { GraphSchema } from '../core/types'

/**
 * RAMPath Algorithm Implementation for Automatic Path Diagram Layout
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

  // PHASE 1: Prepare data
  const { variableNodes, arrowIndex } = prepareData(model)

  // PHASE 2: Compute longest paths
  const longestPathByNode = computeLongestPaths(variableNodes, arrowIndex)

  // PHASE 3: Assign ranks
  const { ranks, rankIndex } = assignRanks(longestPathByNode, variableNodes)

  // PHASES 4-5: Sort nodes within ranks & assign coordinates (interleaved)
  const positions = sortAndPositionRanks(ranks, rankIndex, arrowIndex, layoutOpts)

  // PHASE 6: Determine two-headed arrow sides
  determineLoopSides(ranks, rankIndex, model.paths)

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
    if (path.numberOfArrows === 1 && variableNodes.has(path.fromLabel) && variableNodes.has(path.toLabel)) {
      const arrow = { from: path.fromLabel, to: path.toLabel }

      // Add to incoming
      if (!incomingByTarget.has(path.toLabel)) incomingByTarget.set(path.toLabel, [])
      incomingByTarget.get(path.toLabel)!.push(arrow)

      // Add to outgoing
      if (!outgoingBySource.has(path.fromLabel)) outgoingBySource.set(path.fromLabel, [])
      outgoingBySource.get(path.fromLabel)!.push(arrow)

      // Add to one-headed list
      oneHeadedPaths.push(arrow)
    }
  })

  return { incomingByTarget, outgoingBySource, oneHeadedPaths }
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
      const incomingPaths = (paths ?? []).filter((p: any) => p.numberOfArrows === 1 && p.toLabel === nodeId)
      incomingPaths.forEach((p: any) => {
        const sourceRank = rankIndex.get(p.fromLabel)
        if (sourceRank !== undefined && sourceRank < rankIdx) incomingCount++
      })

      const outgoingPaths = (paths ?? []).filter((p: any) => p.numberOfArrows === 1 && p.fromLabel === nodeId)
      outgoingPaths.forEach((p: any) => {
        const targetRank = rankIndex.get(p.toLabel)
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
      if (rank.indexOf(path.fromLabel) >= 0 || rank.indexOf(path.toLabel) >= 0) {
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
      if (path.fromLabel === node.label && positions[path.toLabel]) {
        targets.push(path.toLabel)
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
