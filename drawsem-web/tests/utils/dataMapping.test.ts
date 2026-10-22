import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  withMappingLinked, withMappingColumn, followLinkedMappings, incomingDataPaths, knownColumns, isMissingColumn, linkMappingsOnLoad,
} from '../../src/utils/dataMapping'
import { convertDocToRuntime, docPassthroughOf } from '../../src/utils/runtimeConverter'
import { modelsToSchema } from '../../src/utils/runtimeToSchema'
import { serializeEditHistory } from '../../src/utils/editHistory'
import { newDraggedPath } from '../../src/utils/groupEdits'
import { convertToUnicode } from '../../src/utils/converters'
import type { Node, Path } from '../../src/utils/helpers'
import type { RuntimeModel } from '../../src/utils/runtimeToSchema'

const node = (id: string, type: Node['type'] = 'variable', extra: Partial<Node> = {}): Node => ({ id, label: id, type, ...extra })
const dataPath = (from: string, to: string, label: string, extra: Partial<Path> = {}): Path =>
  ({ id: `${from}-${to}`, from, to, twoSided: false, type: 'data', label, displayName: label, ...extra })

function model(paths: Path[], nodes: Node[] = [node('D', 'dataset'), node('x1'), node('x2'), node('F')]): RuntimeModel {
  return { id: 'm', nodes, paths }
}
const linkedOf = (m: RuntimeModel) => Object.fromEntries(m.paths.map((p) => [p.id, !!p.mappingLinked]))

describe('mapping link helpers', () => {
  it('withMappingLinked sets or removes the flag (absent = unlinked)', () => {
    const p = dataPath('D', 'x1', 'x1')
    expect(withMappingLinked(p, true).mappingLinked).toBe(true)
    expect(withMappingLinked(p, false)).toBe(p)
    expect(withMappingLinked(withMappingLinked(p, true), false)).not.toHaveProperty('mappingLinked')
  })

  it('withMappingColumn sets label and display name, keeping the link only while names match', () => {
    const p = withMappingLinked(dataPath('D', 'x_1', 'x_1'), true)
    expect(withMappingColumn(p, 'x_2', 'x_1')).toEqual({ ...dataPath('D', 'x_1', 'x_2'), displayName: convertToUnicode('x_2') })
    expect(withMappingColumn(p, 'x_1', 'x_1').mappingLinked).toBe(true)
    // never links an unlinked path
    expect(withMappingColumn(dataPath('D', 'x1', 'a'), 'x1', 'x1')).not.toHaveProperty('mappingLinked')
  })

  it('followLinkedMappings renames only linked data paths into the renamed node', () => {
    const paths = [
      withMappingLinked(dataPath('D', 'x1', 'x1'), true),
      dataPath('E', 'x1', 'x1'), // unlinked
      withMappingLinked(dataPath('D', 'x2', 'x2'), true), // another node
    ]
    const out = followLinkedMappings(paths, 'x1', 'y_1')
    expect(out[0]).toMatchObject({ label: 'y_1', displayName: convertToUnicode('y_1'), mappingLinked: true })
    expect(out[1]).toBe(paths[1])
    expect(out[2]).toBe(paths[2])
    expect(followLinkedMappings(paths, 'F', 'G')).toBe(paths)
  })

  it('incomingDataPaths: data paths (typed or from a dataset) into the node', () => {
    const nodes = [node('D', 'dataset'), node('x1'), node('F')]
    const paths: Path[] = [dataPath('D', 'x1', 'x1'), { id: 'u', from: 'D', to: 'x1', twoSided: false }, { id: 'l', from: 'F', to: 'x1', twoSided: false }]
    expect(incomingDataPaths(nodes, paths, 'x1').map((p) => p.id)).toEqual(['D-x1', 'u'])
  })

  it('knownColumns / isMissingColumn: only when the dataset headers are known', () => {
    const loaded = node('D', 'dataset', { dataset: { fileName: 'd.csv', headers: ['x1', 'x2'], columns: [] } })
    expect(knownColumns(loaded)).toEqual(['x1', 'x2'])
    expect(knownColumns(node('D', 'dataset'))).toBeNull()
    expect(knownColumns(node('E', 'dataset', { dataset: { fileName: 'e.csv', headers: [], columns: [] } }))).toBeNull()
    const nodes = [loaded, node('x1'), node('x3'), node('E', 'dataset')]
    expect(isMissingColumn(dataPath('D', 'x1', 'x1'), nodes)).toBe(false)
    expect(isMissingColumn(dataPath('D', 'x3', 'x3'), nodes)).toBe(true)
    expect(isMissingColumn(dataPath('E', 'x3', 'x3'), nodes)).toBe(false) // E's columns are unknown
    expect(isMissingColumn({ id: 'l', from: 'x1', to: 'x3', twoSided: false, label: 'zz' }, nodes)).toBe(false) // not a data path
  })

  it('a dataset -> variable drag makes a linked data path', () => {
    const p = newDraggedPath([node('D', 'dataset'), node('x1')], 'D', 'x1', false)
    expect(p).toMatchObject({ type: 'data', label: 'x1', mappingLinked: true })
  })
})

describe('linkMappingsOnLoad', () => {
  it('a new document links every data path whose column is its variable label', () => {
    const m = model([dataPath('D', 'x1', 'x1'), dataPath('D', 'x2', 'col_b'), { id: 'l', from: 'F', to: 'x1', twoSided: false, label: 'x1' }])
    expect(linkedOf(linkMappingsOnLoad([m])[0])).toEqual({ 'D-x1': true, 'D-x2': false, l: false })
  })

  it('a push that keeps the history carries flags for paths that still exist, and links only new matching ones', () => {
    const before = model([
      dataPath('D', 'x1', 'x1'), // was unticked by the user
      withMappingLinked(dataPath('D', 'x2', 'x2'), true),
    ])
    const pushed = model([
      dataPath('D', 'x1', 'x1'),
      dataPath('D', 'x2', 'x2'),
      dataPath('D', 'F', 'F'), // new
    ])
    expect(linkedOf(linkMappingsOnLoad([pushed], [before])[0])).toEqual({ 'D-x1': false, 'D-x2': true, 'D-F': true })
    // a carried link whose names no longer match is dropped
    const renamed = model([dataPath('D', 'x2', 'other')])
    expect(linkedOf(linkMappingsOnLoad([renamed], [before])[0])).toEqual({ 'D-x2': false })
    // a model R did not have before: by the names
    expect(linkedOf(linkMappingsOnLoad([{ ...pushed, id: 'new' }], [before])[0])).toEqual({ 'D-x1': true, 'D-x2': true, 'D-F': true })
  })

  it('matches by dataset label + variable label, not runtime id', () => {
    const before = model([dataPath('D', 'x1', 'x1')])
    const pushed: RuntimeModel = {
      id: 'm',
      nodes: [node('D2id', 'dataset', { label: 'D' }), node('x1id', 'variable', { label: 'x1' })],
      paths: [dataPath('D2id', 'x1id', 'x1')],
    }
    expect(linkedOf(linkMappingsOnLoad([pushed], [before])[0])).toEqual({ 'D2id-x1id': false })
  })

  it('returns the same model when nothing changes', () => {
    const m = model([{ id: 'l', from: 'F', to: 'x1', twoSided: false }])
    expect(linkMappingsOnLoad([m])[0]).toBe(m)
  })
})

describe('the link is runtime-only', () => {
  const example = () => JSON.parse(readFileSync(join(__dirname, '../../examples/graph.example.json'), 'utf-8'))

  it('is stripped when the model is serialized (schema and edit history)', () => {
    const doc = example()
    const plain = convertDocToRuntime(doc)
    const linked = linkMappingsOnLoad(plain)
    expect(linked[0].paths.filter((p) => p.mappingLinked)).toHaveLength(3) // sample -> x_1..x_3
    const out = modelsToSchema(linked, docPassthroughOf(doc))
    expect(JSON.stringify(out)).not.toContain('mappingLinked')
    expect(out).toEqual(modelsToSchema(plain, docPassthroughOf(doc)))
    const history = serializeEditHistory({ past: [{ models: linked, currentModelId: 'model1' }], future: [] }, { models: linked, currentModelId: 'model1' })!
    expect(history).not.toContain('mappingLinked')
  })
})
