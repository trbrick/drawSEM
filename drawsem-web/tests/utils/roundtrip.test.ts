/**
 * Lossless, non-stamping round trip: load(schema) -> no edit -> serialize must
 * deep-equal the input, and an edit must change only what it edits.
 * See "Noise files/widget-lossless-roundtrip-plan.md".
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { convertDocToRuntime, docPassthroughOf } from '../../src/utils/runtimeConverter'
import { modelsToSchema } from '../../src/utils/runtimeToSchema'
import { autoLayout } from '../../src/utils/autoLayout'
import { validateGraph } from '../../src/validateGraph'
import { deepDiff } from './test-helpers'

const FIXTURES = join(__dirname, '../fixtures/models')

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

/** load -> serialize, with no edit in between */
function roundTrip(doc: any): any {
  const models = convertDocToRuntime(doc)
  return modelsToSchema(models, docPassthroughOf(doc))
}

function fixtureFiles(): Array<{ name: string; path: string }> {
  const top = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: f, path: join(FIXTURES, f) }))
  const layout = readdirSync(join(FIXTURES, 'layout'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: `layout/${f}`, path: join(FIXTURES, 'layout', f) }))
  const example = { name: 'examples/graph.example.json', path: join(__dirname, '../../examples/graph.example.json') }
  return [...top, ...layout, example]
}

describe('round trip: fit results survive', () => {
  it.fails('a fitted model keeps provenance.fitResults through load -> sync', () => {
    const doc = readJson(join(FIXTURES, 'kitchen-sink.json'))
    const before = clone(doc)
    const out = roundTrip(doc)
    expect(out.models.fitted.provenance).toEqual(before.models.fitted.provenance)
    expect(out.models.fitted.provenance.fitResults[0].parameterEstimates).toEqual({ b1: 0.7, e1: 0.3 })
  })
})

describe('round trip: kitchen-sink fixture', () => {
  it('is valid against graph.schema.json and has two models', () => {
    const doc = readJson(join(FIXTURES, 'kitchen-sink.json'))
    const res = validateGraph(doc)
    expect(res.errors ?? []).toEqual([])
    expect(res.ok).toBe(true)
    expect(Object.keys(doc.models)).toHaveLength(2)
  })

  it.fails('round-trips to a deep-equal document', () => {
    const doc = readJson(join(FIXTURES, 'kitchen-sink.json'))
    const before = clone(doc)
    const out = roundTrip(doc)
    expect(deepDiff(out, before)).toEqual([])
    expect(out).toEqual(before)
  })
})

describe('round trip: identity over every fixture', () => {
  it.fails.each(fixtureFiles())('$name', ({ path }) => {
    const doc = readJson(path)
    const before = clone(doc)
    const out = roundTrip(doc)
    expect(deepDiff(out, before)).toEqual([])
    expect(out).toEqual(before)
  })
})

describe('autoLayout does not mutate its input', () => {
  it.each(fixtureFiles())('$name', ({ path }) => {
    const doc = readJson(path)
    const before = clone(doc)
    autoLayout(doc)
    expect(doc).toEqual(before)
  })
})
