import { GraphSchema } from '../core/types'

export interface PositionMap {
  [nodeId: string]: {
    x: number
    y: number
    rank?: number
  }
}

/**
 * Generate an SVG visualization of a model with positioned nodes
 * Used for generating test reports that can be visually verified
 */
export function generateSVGVisualization(
  model: GraphSchema,
  positions: PositionMap,
  options?: {
    width?: number
    height?: number
    nodeRadius?: number
    padding?: number
  }
): string {
  const width = options?.width ?? 1200
  const height = options?.height ?? 800
  const nodeRadius = options?.nodeRadius ?? 30
  const padding = options?.padding ?? 50

  // Get model key
  const modelKey = Object.keys(model.models)[0]
  if (!modelKey) throw new Error('No models found in schema')
  const m = model.models[modelKey]

  // Build a map of label → node for quick lookup
  const nodeById = new Map(m.nodes.map(n => [n.label, n]))

  // Calculate bounds from positions
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  Object.values(positions).forEach(pos => {
    minX = Math.min(minX, pos.x - nodeRadius)
    minY = Math.min(minY, pos.y - nodeRadius)
    maxX = Math.max(maxX, pos.x + nodeRadius)
    maxY = Math.max(maxY, pos.y + nodeRadius)
  })

  const contentWidth = maxX - minX + 2 * padding
  const contentHeight = maxY - minY + 2 * padding
  const scale = Math.min(width / contentWidth, height / contentHeight, 1)

  // SVG header
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">\n`
  svg += `  <defs>\n`
  svg += `    <style>\n`
  svg += `      .node-circ { fill: #e3f2fd; stroke: #1976d2; stroke-width: 2; }\n`
  svg += `      .node-rect { fill: #f5f5f5; stroke: #666; stroke-width: 2; }\n`
  svg += `      .node-diamond { fill: #fff3e0; stroke: #f57c00; stroke-width: 2; }\n`
  svg += `      .node-label { font-family: Arial, sans-serif; font-size: 12px; text-anchor: middle; dominant-baseline: middle; }\n`
  svg += `      .path-line { stroke: #666; stroke-width: 2; fill: none; }\n`
  svg += `      .path-arrow { fill: #666; }\n`
  svg += `      .arrowhead { marker-end: url(#arrowhead); }\n`
  svg += `      .loopback { stroke-dasharray: 5,5; }\n`
  svg += `    </style>\n`
  svg += `    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">\n`
  svg += `      <polygon points="0 0, 10 3, 0 6" class="path-arrow" />\n`
  svg += `    </marker>\n`
  svg += `  </defs>\n`

  // Background
  svg += `  <rect width="${width}" height="${height}" fill="white" />\n`

  // Draw paths first (so they appear behind nodes)
  m.paths?.forEach(path => {
    if (path.numberOfArrows === 1 && positions[path.fromLabel] && positions[path.toLabel]) {
      const fromPos = positions[path.fromLabel]
      const toPos = positions[path.toLabel]

      // Simple arrow from source to target
      svg += `  <line x1="${(fromPos.x - minX + padding) * scale}" y1="${(fromPos.y - minY + padding) * scale}" x2="${(toPos.x - minX + padding) * scale}" y2="${(toPos.y - minY + padding) * scale}" class="path-line arrowhead" />\n`
    } else if (path.numberOfArrows === 2 && positions[path.fromLabel] && positions[path.toLabel]) {
      // Two-headed arrow (covariance)
      const fromPos = positions[path.fromLabel]
      const toPos = positions[path.toLabel]
      svg += `  <line x1="${(fromPos.x - minX + padding) * scale}" y1="${(fromPos.y - minY + padding) * scale}" x2="${(toPos.x - minX + padding) * scale}" y2="${(toPos.y - minY + padding) * scale}" class="path-line loopback" stroke-width="1" />\n`
    }
  })

  // Draw nodes
  m.nodes?.forEach(node => {
    const pos = positions[node.label]
    if (!pos) return

    const x = (pos.x - minX + padding) * scale
    const y = (pos.y - minY + padding) * scale

    if (node.type === 'variable') {
      // Determine shape: circle for latent, rect for manifest
      const isLatent = node.tags?.includes('latent') ?? false
      if (isLatent) {
        // Circle for latent
        svg += `  <circle cx="${x}" cy="${y}" r="${nodeRadius * 0.7}" class="node-circ" />\n`
      } else {
        // Rectangle for manifest
        svg += `  <rect x="${x - nodeRadius * 0.7}" y="${y - nodeRadius * 0.5}" width="${nodeRadius * 1.4}" height="${nodeRadius}" class="node-rect" />\n`
      }
    } else if (node.type === 'constant') {
      // Diamond for constant
      svg += `  <polygon points="${x},${y - nodeRadius * 0.7} ${x + nodeRadius * 0.7},${y} ${x},${y + nodeRadius * 0.7} ${x - nodeRadius * 0.7},${y}" class="node-diamond" />\n`
    } else if (node.type === 'dataset') {
      // Pentagon/special shape for dataset
      svg += `  <rect x="${x - nodeRadius * 0.8}" y="${y - nodeRadius * 0.6}" width="${nodeRadius * 1.6}" height="${nodeRadius * 1.2}" rx="5" class="node-diamond" />\n`
    }

    // Label
    svg += `  <text x="${x}" y="${y}" class="node-label">${escapeXml(node.label)}</text>\n`
  })

  svg += `</svg>\n`

  return svg
}

/**
 * Generate an HTML report page with the visualization and layout information
 */
export function generateLayoutReport(
  modelName: string,
  model: GraphSchema,
  positions: PositionMap,
  expectedRanks?: Record<string, number>
): string {
  const svg = generateSVGVisualization(model, positions)

  // Get model key
  const modelKey = Object.keys(model.models)[0]
  const m = model.models[modelKey]

  // Build rank summary
  let rankSummary = ''
  if (expectedRanks) {
    const rankGroups: Record<number, string[]> = {}
    Object.entries(expectedRanks).forEach(([nodeLabel, rank]) => {
      if (!rankGroups[rank]) rankGroups[rank] = []
      rankGroups[rank].push(nodeLabel)
    })

    rankSummary = '<table border="1" cellpadding="5">\n<tr><th>Rank</th><th>Nodes</th></tr>\n'
    Object.keys(rankGroups)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach(rank => {
        rankSummary += `<tr><td>${rank}</td><td>${rankGroups[rank].join(', ')}</td></tr>\n`
      })
    rankSummary += '</table>\n'
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Layout Report: ${escapeHtml(modelName)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    h2 { margin-top: 30px; color: #555; }
    .section { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    svg { max-width: 100%; height: auto; border: 1px solid #ddd; }
    table { border-collapse: collapse; }
    table td, table th { border: 1px solid #ddd; padding: 8px; text-align: left; }
    table th { background: #f0f0f0; }
    .stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 10px 0; }
    .stat-box { background: #f9f9f9; padding: 10px; border-left: 4px solid #1976d2; }
    .stat-label { font-weight: bold; color: #666; }
    .stat-value { font-size: 18px; color: #333; }
  </style>
</head>
<body>
  <h1>Layout Report: ${escapeHtml(modelName)}</h1>
  
  <div class="section">
    <h2>Visualization</h2>
    ${svg}
  </div>

  <div class="section">
    <h2>Statistics</h2>
    <div class="stats">
      <div class="stat-box">
        <div class="stat-label">Total Nodes</div>
        <div class="stat-value">${m.nodes?.length ?? 0}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Total Paths</div>
        <div class="stat-value">${m.paths?.length ?? 0}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Positioned Nodes</div>
        <div class="stat-value">${Object.keys(positions).length}</div>
      </div>
    </div>
  </div>

  ${rankSummary ? `<div class="section">
    <h2>Rank Assignment</h2>
    ${rankSummary}
  </div>` : ''}

  <div class="section">
    <h2>Node Details</h2>
    <table>
      <tr>
        <th>Label</th>
        <th>Type</th>
        <th>Rank</th>
        <th>X</th>
        <th>Y</th>
      </tr>
${(m.nodes ?? [])
  .map(
    node =>
      `      <tr>
        <td>${escapeHtml(node.label)}</td>
        <td>${node.type}</td>
        <td>${expectedRanks ? expectedRanks[node.label] ?? '-' : '-'}</td>
        <td>${positions[node.label]?.x?.toFixed(1) ?? '-'}</td>
        <td>${positions[node.label]?.y?.toFixed(1) ?? '-'}</td>
      </tr>`
  )
  .join('\n')}
    </table>
  </div>
</body>
</html>
`

  return html
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, char => {
    const escapeMap: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    }
    return escapeMap[char] || char
  })
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return escapeXml(str)
}
