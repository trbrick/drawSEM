#!/usr/bin/env node
// Importer: convert persisted graph JSON (schema format) into the CanvasTool runtime shape
// Usage: node scripts/import-graph.js [path/to/graph.json]
const fs = require('fs')
const path = require('path')

const DEFAULT_EXAMPLE = path.join(__dirname, '..', 'examples', 'graph.example.json')
const inPath = process.argv[2] || DEFAULT_EXAMPLE
if (!fs.existsSync(inPath)) {
  console.error('Input file not found:', inPath)
  process.exit(2)
}

const doc = JSON.parse(fs.readFileSync(inPath, 'utf8'))

// Validate input document against schema (fail fast)
try {
  const Ajv = require('ajv')
  const schema = require('../schema/graph.schema.json')
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)
  const valid = validate(doc)
  if (!valid) {
    console.error('Import error: input JSON failed schema validation:')
    for (const err of validate.errors || []) {
      console.error(` - ${err.instancePath || '/'}: ${err.message}`)
    }
    process.exit(2)
  }
} catch (e) {
  console.error('Import error while validating schema:', e && e.message ? e.message : e)
  process.exit(3)
}

function slugifyLabel(label) {
  return (
    'n_' +
    label
      .toString()
      .normalize('NFKD')
      .replace(/[^\w\s\-\.]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_\-\.]/g, '')
  )
}

const usedIds = new Set()
function uniqueId(base) {
  let id = base
  let i = 1
  while (usedIds.has(id)) {
    id = `${base}_${i++}`
  }
  usedIds.add(id)
  return id
}

// Map labels -> generated ids
const labelToId = {}
const nodesOut = (doc.nodes || []).map((n) => {
  const label = n.label || 'node'
  let base = n.id || slugifyLabel(label)
  base = base.replace(/^p_/, 'n_')
  const id = uniqueId(base)
  labelToId[label] = id
  const visual = n.visual || {}
  const out = {
    id,
    x: typeof visual.x === 'number' ? visual.x : 0,
    y: typeof visual.y === 'number' ? visual.y : 0,
    label,
    type: n.type || 'manifest'
  }
  if (out.type === 'manifest') {
    out.width = typeof visual.width === 'number' ? visual.width : 60
    out.height = typeof visual.height === 'number' ? visual.height : 60
  }
  return out
})

// helper for paths
function mkPathId(base) {
  return uniqueId(base.replace(/^p_/, 'p_'))
}

const pathsOut = (doc.paths || []).map((p) => {
  const fromLabel = p.fromLabel
  const toLabel = p.toLabel
  const from = labelToId[fromLabel] || slugifyLabel(fromLabel)
  const to = labelToId[toLabel] || slugifyLabel(toLabel)
  // ensure any fallback ids are unique and recorded
  if (!labelToId[fromLabel]) labelToId[fromLabel] = uniqueId(from)
  if (!labelToId[toLabel]) labelToId[toLabel] = uniqueId(to)

  const numberOfArrows = typeof p.numberOfArrows === 'number' ? p.numberOfArrows : 1
  const twoSided = numberOfArrows >= 2
  const side = p.visual && p.visual.loopSide ? p.visual.loopSide : undefined
  const idBase = p.id || ('p_' + (p.label || `${fromLabel}_to_${toLabel}`).replace(/\s+/g, '_'))
  const id = mkPathId(idBase)
  const out = { id, from: labelToId[fromLabel], to: labelToId[toLabel], twoSided }
  if (side) out.side = side
  out.label = p.label || id
  // preserve visual.midpointOffset onto out.visual if present (CanvasTool may choose to use it)
  if (p.visual && p.visual.midpointOffset) {
    out.visual = { midpointOffset: p.visual.midpointOffset }
  }
  return out
})

const result = { nodes: nodesOut, paths: pathsOut }

// By default print JSON to stdout for consumption by other tools
const outJson = JSON.stringify(result, null, 2)
console.log(outJson)
process.exit(0)
