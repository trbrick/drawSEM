// Simple AJV usage example for the graph schema.
// Note: this file assumes `ajv` is installed in the project. If not, install with `npm i ajv`.
import Ajv from 'ajv'
import schema from '../schema/graph.schema.json'

const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(schema as object)

export function validateGraph(doc: unknown) {
  const ok = validate(doc)
  return { ok: Boolean(ok), errors: validate.errors }
}

// example usage (uncomment to run in a script):
// const fs = require('fs')
// const example = JSON.parse(fs.readFileSync(require.resolve('../examples/graph.example.json'), 'utf8'))
// console.log(validateGraph(example))
