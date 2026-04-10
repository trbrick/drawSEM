// Validate all JSON files in `drawsem-web/examples` against the schema using ajv
// Usage: from repo root: `cd drawsem-web && node scripts/validate-examples.js`
const fs = require('fs')
const path = require('path')
const Ajv = require('ajv')

const schema = require('../schema/graph.schema.json')
const examplesDir = path.join(__dirname, '..', 'examples')

const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

let ok = true
const files = fs.readdirSync(examplesDir).filter((f) => f.endsWith('.json'))
for (const f of files) {
  const fp = path.join(examplesDir, f)
  const doc = JSON.parse(fs.readFileSync(fp, 'utf8'))
  const v = validate(doc)
  if (!v) {
    ok = false
    console.error(`\nValidation failed for ${f}:`)
    for (const err of validate.errors || []) {
      console.error(` - ${err.instancePath} ${err.message}`)
    }
  } else {
    console.log(`OK: ${f}`)
  }
}

if (!ok) process.exitCode = 2
