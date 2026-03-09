import { GraphSchema } from '../core/types'
import { modelToSVG } from './svgRenderer'
import { escapeXml } from './nodeRender'

export interface PositionMap {
  [nodeId: string]: {
    x: number
    y: number
    rank?: number
  }
}

/**
 * Merge a PositionMap into a schema's node visual properties and render via
 * the production SVG renderer so layout reports look identical to the real UI.
 */
function buildSvgFromPositions(schema: GraphSchema, positions: PositionMap): string {
  const modelKey = Object.keys(schema.models)[0]
  if (!modelKey) throw new Error('No models found in schema')
  const m = schema.models[modelKey]

  const schemaWithPositions: GraphSchema = {
    ...schema,
    models: {
      ...schema.models,
      [modelKey]: {
        ...m,
        nodes: m.nodes.map((n) => ({
          ...n,
          visual: {
            ...n.visual,
            ...(positions[n.label]
              ? { x: positions[n.label].x, y: positions[n.label].y }
              : {}),
          },
        })),
      },
    },
  }

  return modelToSVG(schemaWithPositions, modelKey, { pathLabelFormat: 'labels' })
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
  const svg = buildSvgFromPositions(model, positions)

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
    <h2 id="visualization">Visualization</h2>
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

// escapeXml imported from nodeRender.ts
const escapeHtml = escapeXml
