import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  copySelection, serializeFragment, parseFragment, planPaste, planDuplicate, pasteLabel, renameFreeParameters,
  pasteOffset, fragmentWidth, isCopyableNode, chooseClipboardText, writeClipboardText, readClipboardText, clipboardTextFrom,
  resetMemoryClipboard, pathFitsEndpoints, CLIPBOARD_MARKER, PASTE_STEP_WIDTHS,
} from '../../src/utils/clipboard'
import type { ClipboardFragment } from '../../src/utils/clipboard'
import type { Node, Path } from '../../src/utils/helpers'
import { convertToUnicode } from '../../src/utils/converters'

const node = (id: string, type: Node['type'] = 'variable', x = 0, y = 0, extra: Partial<Node> = {}): Node => ({ id, label: id, type, x, y, ...extra })
const path = (from: string, to: string, extra: Partial<Path> = {}): Path => ({ id: `${from}-${to}-${extra.twoSided ? 2 : 1}`, from, to, twoSided: false, ...extra })

/*
 * F -> x1 (b1), F -> x2 (b1), x1 <-> x1 (V_{x1}), "1" -> x1 (mean), D -> x1 (data),
 * x1 <-> x2, G -> F (G not copied in most tests), "1" -> G
 */
function model() {
  const nodes: Node[] = [
    node('F', 'variable', 0, 0),
    node('x1', 'variable', -50, 100, { variableCharacteristics: { manifestLatent: 'manifest', exogeneity: 'endogenous' } }),
    node('x2', 'variable', 50, 100, { variableCharacteristics: { manifestLatent: 'manifest' } }),
    node('G', 'variable', 0, -100),
    node('1', 'constant', 0, 200),
    node('D', 'dataset', 0, 300, { datasetSource: { type: 'embedded', columnTypes: { x1: 'number' }, object: [] } }),
  ]
  const paths: Path[] = [
    path('F', 'x1', { label: 'b1', freeParameter: 'b1', value: 0.7 }),
    path('F', 'x2', { freeParameter: 'b1', value: 0.7 }),
    path('x1', 'x1', { twoSided: true, label: 'V_{x1}', freeParameter: true }),
    path('1', 'x1', { freeParameter: true, parameterType: 'mean' }),
    path('D', 'x1', { type: 'data', label: 'x1' }),
    path('x1', 'x2', { twoSided: true, freeParameter: 'c' }),
    path('G', 'F', { value: 0.5 }),
    path('1', 'G', { freeParameter: true }),
  ]
  return { nodes, paths }
}

/** A selection: node ids, and path ids as built by `path` ("from-to-1" / "from-to-2"). */
const sel = (nodeIds: string[], pathIds: string[] = []) => ({ nodeIds, pathIds })
/** The paths among F, x1, x2 plus x1's mean (the paths the old rules copied with them). */
const FX_PATHS = ['F-x1-1', 'F-x2-1', 'x1-x1-2', '1-x1-1', 'x1-x2-2']

const labelOf = (nodes: Node[], id: string) => nodes.find((n) => n.id === id)?.label ?? id

/** "from->to" (or "from<->to") with labels from both the target and the plan. */
function describePaths(all: Node[], ps: Path[]): string[] {
  return ps.map((p) => `${labelOf(all, p.from)}${p.twoSided ? '<->' : '->'}${labelOf(all, p.to)}`)
}

afterEach(() => {
  resetMemoryClipboard()
  vi.unstubAllGlobals()
})

describe('copySelection', () => {
  it('copies (and a cut removes) variables and constants only', () => {
    const { nodes } = model()
    expect(nodes.filter(isCopyableNode).map((n) => n.id)).toEqual(['F', 'x1', 'x2', 'G', '1'])
  })

  it('copies only the selected paths with an endpoint among the copied nodes, data paths included', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['F', 'x1', 'x2', 'D'], ['F-x1-1', 'x1-x1-2', '1-x1-1', 'D-x1-1', 'G-F-1', '1-G-1']))!
    expect(f[CLIPBOARD_MARKER]).toBe(1)
    expect(f.nodes.map((n) => n.label)).toEqual(['F', 'x1', 'x2'])
    // not "1" -> G (no copied endpoint), not the unselected F -> x2 and x1 <-> x2
    expect(f.paths.map((p) => `${p.from}->${p.to}`)).toEqual(['F->x1', 'x1->x1', '1->x1', 'D->x1', 'G->F'])
    expect(f.paths.find((p) => p.from === 'D')).toMatchObject({ type: 'data', label: 'x1' })
    // the endpoints outside the copy, with their types
    expect(f.external).toEqual([{ label: '1', type: 'constant' }, { label: 'D', type: 'dataset' }, { label: 'G', type: 'variable' }])
  })

  it('a path between two copied nodes is copied only when it is selected; no mean paths by default', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['F', 'x1', 'x2']))!
    expect(f.paths).toEqual([])
    expect(f).not.toHaveProperty('external')
  })

  it('withDataPaths (the SEM layer) also copies the data paths into copied variables', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['x1', 'F']), { withDataPaths: true })!
    expect(f.paths.map((p) => `${p.from}->${p.to}`)).toEqual(['D->x1'])
    expect(f.external).toEqual([{ label: 'D', type: 'dataset' }])
    // selected paths still come along as usual
    const g = copySelection(nodes, paths, sel(['x1'], ['x1-x1-2']), { withDataPaths: true })!
    expect(g.paths.map((p) => `${p.from}->${p.to}`)).toEqual(['x1->x1', 'D->x1'])
  })

  it('uses schema shapes: labels and from/to, no runtime ids', () => {
    const { nodes, paths } = model()
    nodes[0] = { ...nodes[0], id: 'n_runtime_F' }
    const ps = paths.map((p) => (p.from === 'F' ? { ...p, from: 'n_runtime_F' } : p))
    const f = copySelection(nodes, ps, sel(['n_runtime_F', 'x1'], ['F-x1-1']))!
    const text = serializeFragment(f)
    expect(text).not.toContain('n_runtime_F')
    expect(text).not.toContain('F-x1-1')
    expect(f.nodes[0]).toMatchObject({ label: 'F', type: 'variable', visual: { x: 0, y: 0 } })
    expect(f.nodes[0]).not.toHaveProperty('id')
    expect(f.paths[0]).toMatchObject({ from: 'F', to: 'x1', numberOfArrows: 1, freeParameter: 'b1', value: 0.7 })
  })

  it('drops the manifestLatent lock but keeps other variable characteristics', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['x1', 'x2']))!
    expect(f.nodes[0].variableCharacteristics).toEqual({ exogeneity: 'endogenous' })
    expect(f.nodes[1]).not.toHaveProperty('variableCharacteristics')
  })

  it('does not copy a selected path without a copied endpoint', () => {
    const { nodes, paths } = model()
    // "1" -> G touches neither F nor x1
    const f = copySelection(nodes, paths, sel(['F'], ['1-G-1', 'x1-x1-2']))!
    expect(f.paths).toEqual([])
  })

  it('copies a copied constant as a node, not as an external reference', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['1', 'x1'], ['x1-x1-2', '1-x1-1']))!
    expect(f.nodes.map((n) => n.label)).toEqual(['x1', '1'])
    expect(f.paths.map((p) => `${p.from}->${p.to}`)).toEqual(['x1->x1', '1->x1'])
    expect(f).not.toHaveProperty('external')
  })

  it('does nothing for datasets alone or paths alone', () => {
    const { nodes, paths } = model()
    expect(copySelection(nodes, paths, sel(['D'], ['D-x1-1']))).toBeNull()
    expect(copySelection(nodes, paths, sel([], ['F-x1-1', 'x1-x1-2']))).toBeNull()
    expect(copySelection(nodes, paths, sel([]), { withDataPaths: true })).toBeNull()
  })
})

describe('parseFragment', () => {
  it('round-trips a fragment', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['F', 'x1'], ['F-x1-1', 'D-x1-1', 'G-F-1']))!
    expect(f.external).toHaveLength(2)
    expect(parseFragment(serializeFragment(f))).toEqual(f)
  })

  it.each([
    ['plain text', 'hello world'],
    ['empty', ''],
    ['malformed JSON', '{"drawSEMClipboard": 1, "nodes": ['],
    ['JSON without the marker', '{"nodes": [{"label": "a", "type": "variable"}], "paths": []}'],
    ['a wrong version', '{"drawSEMClipboard": 2, "nodes": [{"label": "a", "type": "variable"}], "paths": []}'],
    ['a whole schema document', '{"schemaVersion": 0, "models": {"m": {"nodes": [], "paths": []}}}'],
    ['a non-object', '"drawSEMClipboard"'],
    ['nodes not an array', '{"drawSEMClipboard": 1, "nodes": {}, "paths": []}'],
    ['no usable nodes', '{"drawSEMClipboard": 1, "nodes": [{"label": "D", "type": "dataset"}, {"type": "variable"}], "paths": []}'],
  ])('ignores %s', (_name, text) => {
    expect(parseFragment(text)).toBeNull()
  })

  it('ignores null / undefined', () => {
    expect(parseFragment(null)).toBeNull()
    expect(parseFragment(undefined)).toBeNull()
  })

  it('drops unusable entries: dataset nodes, paths without endpoints, duplicate labels, bad external refs', () => {
    const text = JSON.stringify({
      drawSEMClipboard: 1,
      nodes: [{ label: 'a', type: 'variable' }, { label: 'a', type: 'variable' }, { label: 'D', type: 'dataset' }, 7],
      paths: [{ from: 'a', to: 'a', numberOfArrows: 2 }, { from: 'D', to: 'a', type: 'data' }, { from: 'a' }, null],
      external: [{ label: 'D', type: 'dataset' }, { label: 'a', type: 'variable' }, { label: 3 }, { label: 'q', type: 'box' }, 'x'],
    })
    const f = parseFragment(text)!
    expect(f.nodes).toEqual([{ label: 'a', type: 'variable' }])
    // data paths are kept: pasting decides whether their dataset is there
    expect(f.paths).toEqual([{ from: 'a', to: 'a', numberOfArrows: 2 }, { from: 'D', to: 'a', type: 'data' }])
    expect(f.external).toEqual([{ label: 'D', type: 'dataset' }])
  })
})

describe('pasteLabel', () => {
  const taken = (...ls: string[]) => new Set(ls)
  it('keeps a free label', () => {
    expect(pasteLabel('x1', 'variable', taken('F'))).toBe('x1')
    expect(pasteLabel('V7', 'variable', taken('V1'))).toBe('V7')
  })
  it('V<n> variables get the lowest free V<n>', () => {
    expect(pasteLabel('V2', 'variable', taken('V1', 'V2', 'V4'))).toBe('V3')
  })
  it('"1"-style constants follow the constant rule', () => {
    expect(pasteLabel('1', 'constant', taken('1'))).toBe('1b')
    expect(pasteLabel('1b', 'constant', taken('1', '1b'))).toBe('1c')
  })
  it('other names get name_2, name_3, ...', () => {
    expect(pasteLabel('x1', 'variable', taken('x1'))).toBe('x1_2')
    expect(pasteLabel('x1', 'variable', taken('x1', 'x1_2'))).toBe('x1_3')
    expect(pasteLabel('one', 'constant', taken('one'))).toBe('one_2')
    // a variable named like a V<n> but not V-numbered, and a constant named V1
    expect(pasteLabel('V1', 'constant', taken('V1'))).toBe('V1_2')
  })
})

describe('renameFreeParameters', () => {
  it('renames names the target uses, keeps others, and keeps shared names shared', () => {
    const target = [{ freeParameter: 'b1' }, { freeParameter: 'b1_2' }, { freeParameter: true }, {}]
    const m = renameFreeParameters(target, ['b1', 'b1', 'c', 'b1_2'])
    expect(m.get('b1')).toBe('b1_3')
    expect(m.get('c')).toBe('c')
    expect(m.get('b1_2')).toBe('b1_2_2')
  })

  it('a renamed name never takes another pasted name', () => {
    // b1 is taken in the target; b1_2 is a pasted name that stays b1_2
    const m = renameFreeParameters([{ freeParameter: 'b1' }], ['b1', 'b1_2'])
    expect(m.get('b1_2')).toBe('b1_2')
    expect(m.get('b1')).toBe('b1_3')
  })
})

describe('planPaste', () => {
  it('makes labels unique, rewrites paths and offsets positions', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['F', 'x1', 'x2'], FX_PATHS))!
    const plan = planPaste(nodes, paths, f, { x: 30, y: 30 })!
    expect(plan.nodes.map((n) => n.label)).toEqual(['F_2', 'x1_2', 'x2_2'])
    expect(plan.nodes.map((n) => [n.x, n.y])).toEqual([[30, 30], [-20, 130], [80, 130]])
    const all = [...nodes, ...plan.nodes]
    expect(describePaths(all, plan.paths)).toEqual(['F_2->x1_2', 'F_2->x2_2', 'x1_2<->x1_2', '1->x1_2', 'x1_2<->x2_2'])
    // fresh runtime ids, none shared with the target
    const ids = new Set([...nodes.map((n) => n.id), ...paths.map((p) => p.id)])
    for (const el of [...plan.nodes, ...plan.paths]) expect(ids.has(el.id)).toBe(false)
  })

  it('renames named free parameters; paths sharing one name share the new name', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['F', 'x1', 'x2'], FX_PATHS))!
    const plan = planPaste(nodes, paths, f, pasteOffset(f, 1))!
    const [b1a, b1b, variance, mean, cov] = plan.paths
    expect(b1a.freeParameter).toBe('b1_2')
    expect(b1b.freeParameter).toBe('b1_2')
    expect(cov.freeParameter).toBe('c_2')
    // anonymous free and fixed paths unchanged, values copied as-is
    expect(variance.freeParameter).toBe(true)
    expect(mean.freeParameter).toBe(true)
    expect(b1a.value).toBe(0.7)
    // a label that was the parameter name follows it; a default variance label follows the node
    expect(b1a.label).toBe('b1_2')
    expect(variance.label).toBe('V_{x1_2}')
    expect(variance.displayName).toBe(convertToUnicode('V_{x1_2}'))
  })

  it('generated mean and covariance labels follow the pasted nodes', () => {
    const { nodes } = model()
    const paths: Path[] = [
      path('1', 'x1', { freeParameter: true, label: 'M_{x1}' }),
      path('x1', 'x2', { twoSided: true, freeParameter: true, label: 'C_{x1,x2}' }),
    ]
    const f = copySelection(nodes, paths, sel(['x1', 'x2', '1'], ['1-x1-1', 'x1-x2-2']))!
    const plan = planPaste(nodes, paths, f, pasteOffset(f, 1))!
    const labels = plan.paths.map((p) => p.label).sort()
    expect(labels).toEqual(['C_{x1_2,x2_2}', 'M_{x1_2}'])
  })

  it('keeps parameter names that are free in the target (e.g. another window)', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['F', 'x1'], ['F-x1-1']))!
    const plan = planPaste([], [], f, pasteOffset(f, 1))!
    expect(plan.nodes.map((n) => n.label)).toEqual(['F', 'x1'])
    expect(plan.paths[0].freeParameter).toBe('b1')
  })

  it('re-attaches a selected mean path to the target constant of the same label, else drops it', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['x1'], ['x1-x1-2', '1-x1-1']))!
    const plan = planPaste(nodes, paths, f, pasteOffset(f, 1))!
    const mean = plan.paths.find((p) => p.parameterType === 'mean')!
    expect(mean.from).toBe('1') // the existing constant's runtime id
    expect(plan.nodes.map((n) => n.label)).toEqual(['x1_2'])

    // a target without that constant: the mean path is dropped
    const other = [node('y', 'variable')]
    const plan2 = planPaste(other, [], f, pasteOffset(f, 1))!
    expect(plan2.paths.map((p) => p.parameterType ?? null)).toEqual([null]) // just the variance
    // a node labelled "1" that is not a constant does not count
    const plan3 = planPaste([node('1', 'variable')], [], f, pasteOffset(f, 1))!
    expect(plan3.paths.some((p) => p.parameterType === 'mean')).toBe(false)
  })

  it('re-attaches any outside endpoint by label and type: F -> x2 pastes as F -> x2_2', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, sel(['x2'], ['F-x2-1', 'x1-x2-2']))!
    const plan = planPaste(nodes, paths, f, pasteOffset(f, 1))!
    expect(plan.nodes.map((n) => n.label)).toEqual(['x2_2'])
    expect(describePaths([...nodes, ...plan.nodes], plan.paths)).toEqual(['F->x2_2', 'x1<->x2_2'])
    expect(plan.paths[0].from).toBe('F') // the existing node's runtime id
    expect(plan.paths[0].freeParameter).toBe('b1_2') // still renamed like any pasted name

    // a target without F or x1: dropped; with F of another type: dropped
    expect(planPaste([node('y')], [], f, pasteOffset(f, 1))!.paths).toEqual([])
    const target = [node('F', 'constant'), node('x1')]
    const plan2 = planPaste(target, [], f, pasteOffset(f, 1))!
    expect(describePaths([...target, ...plan2.nodes], plan2.paths)).toEqual(['x1<->x2'])
  })

  it('pastes a selected data path from the target dataset of the same label, mapping the new variable name, linked', () => {
    const { nodes, paths } = model()
    // the source maps another column: a paste maps the pasted variable's name anyway
    const ps = paths.map((p) => (p.from === 'D' ? { ...p, label: 'col7', displayName: 'col7', mappingLinked: undefined } : p))
    const f = copySelection(nodes, ps, sel(['x1'], ['D-x1-1']))!
    expect(f.paths).toEqual([{ from: 'D', to: 'x1', type: 'data', label: 'col7' }])
    const plan = planPaste(nodes, ps, f, pasteOffset(f, 1))!
    expect(plan.nodes.map((n) => n.label)).toEqual(['x1_2'])
    expect(plan.paths).toHaveLength(1)
    expect(plan.paths[0]).toMatchObject({ from: 'D', to: plan.nodes[0].id, type: 'data', label: 'x1_2', displayName: convertToUnicode('x1_2'), mappingLinked: true })
    // the label is kept where it is free (another window)
    const other = [node('D', 'dataset')]
    expect(planPaste(other, [], f, pasteOffset(f, 1))!.paths[0]).toMatchObject({ label: 'x1', mappingLinked: true })
    // no dataset D, or a D that is no dataset: the variable comes without it
    expect(planPaste([node('y')], [], f, pasteOffset(f, 1))!.paths).toEqual([])
    expect(planPaste([node('D', 'variable')], [], f, pasteOffset(f, 1))!.paths).toEqual([])
  })

  it('a hand-written fragment without external types still needs endpoints that fit the path', () => {
    const f = parseFragment(JSON.stringify({
      drawSEMClipboard: 1,
      nodes: [{ label: 'x', type: 'variable' }],
      paths: [
        { from: 'D', to: 'x', type: 'data', label: 'x' },
        { from: 'x', to: 'D', numberOfArrows: 1 }, // into a dataset
        { from: 'c', to: 'x', numberOfArrows: 2 }, // two-headed from a constant
        { from: 'x', to: 'c', numberOfArrows: 1 }, // into a constant
        { from: 'F', to: 'x', numberOfArrows: 1 },
      ],
    }))!
    const target = [node('D', 'dataset'), node('c', 'constant'), node('F')]
    const plan = planPaste(target, [], f, { x: 0, y: 0 })!
    expect(describePaths([...target, ...plan.nodes], plan.paths)).toEqual(['D->x', 'F->x'])
  })

  it('pathFitsEndpoints', () => {
    expect(pathFitsEndpoints({ type: 'data' }, 'dataset', 'variable')).toBe(true)
    expect(pathFitsEndpoints({ type: 'data' }, 'variable', 'variable')).toBe(false)
    expect(pathFitsEndpoints({}, 'dataset', 'variable')).toBe(true) // from a dataset: a data path
    expect(pathFitsEndpoints({}, 'dataset', 'constant')).toBe(false)
    expect(pathFitsEndpoints({ numberOfArrows: 1 }, 'constant', 'variable')).toBe(true)
    expect(pathFitsEndpoints({ numberOfArrows: 2 }, 'constant', 'variable')).toBe(false)
    expect(pathFitsEndpoints({ numberOfArrows: 1 }, 'variable', 'constant')).toBe(false)
    expect(pathFitsEndpoints({ numberOfArrows: 1 }, 'variable', 'dataset')).toBe(false)
    expect(pathFitsEndpoints({ numberOfArrows: 2 }, 'variable', 'variable')).toBe(true)
  })

  it('a copied constant is pasted as a new constant', () => {
    const { nodes, paths } = model()
    const plan = planDuplicate(nodes, paths, sel(['1', 'x1'], ['x1-x1-2', '1-x1-1']))!
    expect(plan.nodes.map((n) => [n.label, n.type])).toEqual([['x1_2', 'variable'], ['1b', 'constant']])
    // a duplicate is one step right: x1 (-50) and "1" (0) span -80..30, 1.5 x 110
    expect(plan.nodes.map((n) => [n.x, n.y])).toEqual([[115, 100], [165, 200]])
    expect(describePaths([...nodes, ...plan.nodes], plan.paths)).toEqual(['x1_2<->x1_2', '1b->x1_2'])
  })

  it('duplicate follows the copy rules (withDataPaths too)', () => {
    const { nodes, paths } = model()
    expect(planDuplicate(nodes, paths, sel(['x1']))!.paths).toEqual([])
    const plan = planDuplicate(nodes, paths, sel(['x1'], ['F-x1-1']), { withDataPaths: true })!
    expect(describePaths([...nodes, ...plan.nodes], plan.paths)).toEqual(['F->x1_2', 'D->x1_2'])
    expect(plan.paths[1]).toMatchObject({ label: 'x1_2', mappingLinked: true })
  })

  it('never pastes dataset nodes or the manifestLatent lock', () => {
    const { nodes, paths } = model()
    const text = JSON.stringify({
      drawSEMClipboard: 1,
      nodes: [
        { label: 'x', type: 'variable', variableCharacteristics: { manifestLatent: 'manifest' } },
        { label: 'D', type: 'dataset' },
      ],
      paths: [{ from: 'D', to: 'x', type: 'data', label: 'x' }, { from: 'x', to: 'x', numberOfArrows: 2 }],
    })
    const f = parseFragment(text)!
    const plan = planPaste(nodes, paths, f, pasteOffset(f, 1))!
    expect(plan.nodes).toHaveLength(1)
    expect(plan.nodes[0]).not.toHaveProperty('variableCharacteristics')
    // the data path attaches to the target's dataset D (the fragment's D node is ignored)
    expect(plan.paths.map((p) => p.type ?? null)).toEqual(['data', null])
    expect(plan.paths[0].from).toBe('D')
    expect(planPaste([], [], f, pasteOffset(f, 1))!.paths.map((p) => p.type ?? null)).toEqual([null])
  })

  it('is null for a fragment without nodes', () => {
    const f: ClipboardFragment = { drawSEMClipboard: 1, nodes: [], paths: [] }
    expect(planPaste([], [], f, pasteOffset(f, 1))).toBeNull()
  })

  it('fragmentWidth spans the nodes as drawn (default width 60 when unset)', () => {
    const frag = (ns: Record<string, any>[]): ClipboardFragment => ({ drawSEMClipboard: 1, nodes: ns, paths: [] })
    expect(fragmentWidth(frag([{ label: 'a', type: 'variable', visual: { x: 340, y: 250, width: 60, height: 60 } }]))).toBe(60)
    expect(fragmentWidth(frag([{ label: 'a', type: 'variable' }]))).toBe(60) // no position or size
    expect(fragmentWidth(frag([
      { label: 'a', type: 'variable', visual: { x: 0, y: 0 } },
      { label: 'b', type: 'variable', visual: { x: 200, y: 500, width: 100 } },
    ]))).toBe(280) // -30 .. 250; y plays no part
    expect(fragmentWidth(frag([]))).toBe(0)
  })

  it('pasteOffset steps right only, by PASTE_STEP_WIDTHS fragment widths; step 0 is in place', () => {
    const { nodes, paths } = model()
    const one = copySelection(nodes, paths, sel(['x1']))!
    expect(PASTE_STEP_WIDTHS).toBe(1.5)
    expect(pasteOffset(one, 1)).toEqual({ x: 90, y: 0 }) // one default-width node
    expect(pasteOffset(one, 3)).toEqual({ x: 270, y: 0 })
    expect(pasteOffset(one, 0)).toEqual({ x: 0, y: 0 })
    const three = copySelection(nodes, paths, sel(['F', 'x1', 'x2']))!
    expect(pasteOffset(three, 1)).toEqual({ x: 240, y: 0 }) // -80 .. 80
  })
})

describe('clipboard text', () => {
  const frag = serializeFragment({ drawSEMClipboard: 1, nodes: [{ label: 'a', type: 'variable' }], paths: [] })

  it('chooseClipboardText prefers a fragment on the system clipboard', () => {
    expect(chooseClipboardText(frag, { text: 'old', inSystem: true })).toBe(frag)
  })
  it('falls back to memory when the system clipboard is unreadable or empty', () => {
    expect(chooseClipboardText(null, { text: frag, inSystem: true })).toBe(frag)
    expect(chooseClipboardText('', { text: frag, inSystem: true })).toBe(frag)
  })
  it('ignores memory once the user copied something else to the system clipboard', () => {
    expect(chooseClipboardText('other text', { text: frag, inSystem: true })).toBeNull()
    // ...unless the copy never reached the system clipboard
    expect(chooseClipboardText('other text', { text: frag, inSystem: false })).toBe(frag)
    expect(chooseClipboardText('other text', null)).toBeNull()
  })

  it('without navigator.clipboard (jsdom) the in-memory copy is used, quietly', async () => {
    vi.stubGlobal('navigator', {})
    await writeClipboardText(frag)
    expect(await readClipboardText()).toBe(frag)
    expect(clipboardTextFrom(null)).toBe(frag)
  })

  it('denied clipboard access never throws and falls back to memory', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(async () => { throw new Error('NotAllowedError') }),
        readText: vi.fn(async () => { throw new Error('NotAllowedError') }),
      },
    })
    await expect(writeClipboardText(frag)).resolves.toBeUndefined()
    expect(await readClipboardText()).toBe(frag)
    // the write failed, so foreign system text does not hide the copy
    expect(clipboardTextFrom('foreign')).toBe(frag)
  })

  it('uses the system clipboard when it works', async () => {
    let stored = ''
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(async (t: string) => { stored = t }),
        readText: vi.fn(async () => stored),
      },
    })
    await writeClipboardText(frag)
    expect(stored).toBe(frag)
    expect(await readClipboardText()).toBe(frag)
    stored = 'copied elsewhere'
    expect(await readClipboardText()).toBeNull()
  })
})
