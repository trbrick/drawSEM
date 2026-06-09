import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { convertDocToRuntime } from '../../src/utils/runtimeConverter'
import { modelToSchema, modelToSchemaModel } from '../../src/utils/runtimeToSchema'

function loadExampleSchema() {
  const schemaPath = join(__dirname, '../../examples/graph.example.json')
  return JSON.parse(readFileSync(schemaPath, 'utf-8'))
}

function normalizeRuntimeModel(model: any) {
  const idToLabel: Record<string, string> = {}
  model.nodes.forEach((n: any) => {
    idToLabel[n.id] = n.label
  })

  const nodes = model.nodes
    .map((n: any) => ({
      label: n.label,
      type: n.type,
      description: n.description,
      tags: n.tags,
      variableCharacteristics: n.variableCharacteristics,
      bindingMappings: n.bindingMappings,
      datasetSource: n.datasetSource,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }))
    .sort((a: any, b: any) => a.label.localeCompare(b.label))

  const paths = model.paths
    .map((p: any) => ({
      from: idToLabel[p.from] ?? p.from,
      to: idToLabel[p.to] ?? p.to,
      type: p.type,
      twoSided: p.twoSided,
      label: p.label,
      value: p.value,
      freeParameter: p.freeParameter,
      parameterType: p.parameterType,
      optimization: p.optimization,
      side: p.side,
      midpointOffset: p.visual?.midpointOffset,
    }))
    .sort((a: any, b: any) => {
      const ak = `${a.from}|${a.to}|${a.label ?? ''}|${a.type ?? ''}`
      const bk = `${b.from}|${b.to}|${b.label ?? ''}|${b.type ?? ''}`
      return ak.localeCompare(bk)
    })

  return {
    id: model.id,
    label: model.label,
    parameterTypes: model.parameterTypes,
    nodes,
    paths,
  }
}

describe('runtimeToSchema utilities', () => {
  it('round-trips runtime model to schema and back without structural loss', () => {
    const source = loadExampleSchema()
    const runtimeModels = convertDocToRuntime(source)
    const runtimeModel = runtimeModels[0]

    const schema = modelToSchema(runtimeModel)
    const roundTripped = convertDocToRuntime(schema)[0]

    expect(normalizeRuntimeModel(roundTripped)).toEqual(normalizeRuntimeModel(runtimeModel))
  })

  it('creates minimal model shape for auto-layout mode', () => {
    const source = loadExampleSchema()
    const runtimeModel = convertDocToRuntime(source)[0]

    const layoutModel = modelToSchemaModel(runtimeModel, { forAutoLayout: true }) as any

    expect(layoutModel.nodes.every((n: any) => n.visual && Object.keys(n.visual).every((k) => ['x', 'y'].includes(k)))).toBe(true)
    expect(layoutModel.paths.every((p: any) => typeof p.numberOfArrows === 'number')).toBe(true)
    expect(layoutModel.paths.every((p: any) => !('parameterType' in p))).toBe(true)
    expect(layoutModel.paths.every((p: any) => !('visual' in p))).toBe(true)
  })
})
