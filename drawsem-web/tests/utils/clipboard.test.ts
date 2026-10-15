import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  copySelection, serializeFragment, parseFragment, planPaste, planDuplicate, pasteLabel, renameFreeParameters,
  pasteOffset, chooseClipboardText, writeClipboardText, readClipboardText, clipboardTextFrom, resetMemoryClipboard,
  CLIPBOARD_MARKER, PASTE_OFFSET,
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
  it('copies the paths among the copied nodes plus mean paths from an uncopied constant, never data', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, ['F', 'x1', 'x2', 'D'])!
    expect(f[CLIPBOARD_MARKER]).toBe(1)
    expect(f.nodes.map((n) => n.label)).toEqual(['F', 'x1', 'x2'])
    expect(f.paths.map((p) => `${p.from}->${p.to}`)).toEqual(['F->x1', 'F->x2', 'x1->x1', '1->x1', 'x1->x2'])
    expect(f.paths.some((p) => p.type === 'data')).toBe(false)
  })

  it('uses schema shapes: labels and from/to, no runtime ids', () => {
    const { nodes, paths } = model()
    nodes[0] = { ...nodes[0], id: 'n_runtime_F' }
    const ps = paths.map((p) => (p.from === 'F' ? { ...p, from: 'n_runtime_F' } : p))
    const f = copySelection(nodes, ps, ['n_runtime_F', 'x1'])!
    const text = serializeFragment(f)
    expect(text).not.toContain('n_runtime_F')
    expect(f.nodes[0]).toMatchObject({ label: 'F', type: 'variable', visual: { x: 0, y: 0 } })
    expect(f.nodes[0]).not.toHaveProperty('id')
    expect(f.paths[0]).toMatchObject({ from: 'F', to: 'x1', numberOfArrows: 1, freeParameter: 'b1', value: 0.7 })
  })

  it('drops the manifestLatent lock but keeps other variable characteristics', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, ['x1', 'x2'])!
    expect(f.nodes[0].variableCharacteristics).toEqual({ exogeneity: 'endogenous' })
    expect(f.nodes[1]).not.toHaveProperty('variableCharacteristics')
  })

  it('does not copy a selected path whose endpoints are not both copied (except the constant case)', () => {
    const { nodes, paths } = model()
    // G -> F is not copied with F alone; "1" -> G is not a path into a copied node
    const f = copySelection(nodes, paths, ['F'])!
    expect(f.paths).toEqual([])
  })

  it('copies a copied constant as a node, not as an external reference', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, ['1', 'x1'])!
    expect(f.nodes.map((n) => n.label)).toEqual(['x1', '1'])
    expect(f.paths.map((p) => `${p.from}->${p.to}`)).toEqual(['x1->x1', '1->x1'])
  })

  it('does nothing for datasets alone or paths alone', () => {
    const { nodes, paths } = model()
    expect(copySelection(nodes, paths, ['D'])).toBeNull()
    expect(copySelection(nodes, paths, [])).toBeNull()
  })
})

describe('parseFragment', () => {
  it('round-trips a fragment', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, ['F', 'x1'])!
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

  it('drops unusable entries: datasets, data paths, paths without endpoints, duplicate labels', () => {
    const text = JSON.stringify({
      drawSEMClipboard: 1,
      nodes: [{ label: 'a', type: 'variable' }, { label: 'a', type: 'variable' }, { label: 'D', type: 'dataset' }, 7],
      paths: [{ from: 'a', to: 'a', numberOfArrows: 2 }, { from: 'D', to: 'a', type: 'data' }, { from: 'a' }, null],
    })
    const f = parseFragment(text)!
    expect(f.nodes).toEqual([{ label: 'a', type: 'variable' }])
    expect(f.paths).toEqual([{ from: 'a', to: 'a', numberOfArrows: 2 }])
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
    const f = copySelection(nodes, paths, ['F', 'x1', 'x2'])!
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
    const plan = planPaste(nodes, paths, copySelection(nodes, paths, ['F', 'x1', 'x2'])!, pasteOffset(1))!
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

  it('keeps parameter names that are free in the target (e.g. another window)', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, ['F', 'x1'])!
    const plan = planPaste([], [], f, pasteOffset(1))!
    expect(plan.nodes.map((n) => n.label)).toEqual(['F', 'x1'])
    expect(plan.paths[0].freeParameter).toBe('b1')
  })

  it('re-attaches mean paths to the target constant of the same label, else drops them', () => {
    const { nodes, paths } = model()
    const f = copySelection(nodes, paths, ['x1'])!
    const plan = planPaste(nodes, paths, f, pasteOffset(1))!
    const mean = plan.paths.find((p) => p.parameterType === 'mean')!
    expect(mean.from).toBe('1') // the existing constant's runtime id
    expect(plan.nodes.map((n) => n.label)).toEqual(['x1_2'])

    // a target without that constant: the mean path is dropped
    const other = [node('y', 'variable')]
    const plan2 = planPaste(other, [], f, pasteOffset(1))!
    expect(plan2.paths.map((p) => p.parameterType ?? null)).toEqual([null]) // just the variance
    // a node labelled "1" that is not a constant does not count
    const plan3 = planPaste([node('1', 'variable')], [], f, pasteOffset(1))!
    expect(plan3.paths.some((p) => p.parameterType === 'mean')).toBe(false)
  })

  it('a copied constant is pasted as a new constant', () => {
    const { nodes, paths } = model()
    const plan = planDuplicate(nodes, paths, ['1', 'x1'])!
    expect(plan.nodes.map((n) => [n.label, n.type])).toEqual([['x1_2', 'variable'], ['1b', 'constant']])
    expect(describePaths([...nodes, ...plan.nodes], plan.paths)).toEqual(['x1_2<->x1_2', '1b->x1_2'])
  })

  it('never pastes datasets, data paths or the manifestLatent lock', () => {
    const { nodes, paths } = model()
    const text = JSON.stringify({
      drawSEMClipboard: 1,
      nodes: [
        { label: 'x', type: 'variable', variableCharacteristics: { manifestLatent: 'manifest' } },
        { label: 'D', type: 'dataset' },
      ],
      paths: [{ from: 'D', to: 'x', type: 'data', label: 'x' }, { from: 'x', to: 'x', numberOfArrows: 2 }],
    })
    const plan = planPaste(nodes, paths, parseFragment(text)!, pasteOffset(1))!
    expect(plan.nodes).toHaveLength(1)
    expect(plan.nodes[0]).not.toHaveProperty('variableCharacteristics')
    expect(plan.paths).toHaveLength(1)
    expect(plan.paths[0].type).toBeUndefined()
  })

  it('is null for a fragment without nodes', () => {
    const f: ClipboardFragment = { drawSEMClipboard: 1, nodes: [], paths: [] }
    expect(planPaste([], [], f, pasteOffset(1))).toBeNull()
  })

  it('pasteOffset steps by PASTE_OFFSET', () => {
    expect(pasteOffset(1)).toEqual({ x: PASTE_OFFSET, y: PASTE_OFFSET })
    expect(pasteOffset(3)).toEqual({ x: 3 * PASTE_OFFSET, y: 3 * PASTE_OFFSET })
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
