import { describe, it, expect } from 'vitest'
import {
  autoLoopSide,
  nearestLoopSide,
  effectiveLoopSide,
  effectiveSchemaLoopSide,
  rankLoopSides,
  resolveLoopSides,
  LOOP_SIDE_TIE_TOLERANCE_DEG,
} from '../../src/utils/loopSide'
import { convertModelToRuntime } from '../../src/utils/runtimeConverter'
import { modelToSVG } from '../../src/utils/svgRenderer'
import { autoLayout } from '../../src/utils/autoLayout'
import type { GraphSchema } from '../../src/core/types'
import { readFileSync } from 'fs'
import { join } from 'path'
import { convertDocToRuntime as convertDocToRuntimeDoc } from '../../src/utils/runtimeConverter'
import { layoutModel } from '../../src/utils/layoutModel'

const C = { x: 0, y: 0 }
const at = (deg: number, r = 100) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) })

describe('autoLoopSide', () => {
  it('no incident paths -> bottom', () => {
    expect(autoLoopSide(C, [])).toBe('bottom')
  })

  it('ignores endpoints that coincide with the center', () => {
    expect(autoLoopSide(C, [{ x: 0, y: 0 }])).toBe('bottom')
  })

  it('a single path loading from above -> bottom', () => {
    expect(autoLoopSide(C, [{ x: 0, y: -150 }])).toBe('bottom')
  })

  it('paths below -> top', () => {
    expect(autoLoopSide(C, [{ x: -80, y: 150 }, { x: 0, y: 150 }, { x: 80, y: 150 }])).toBe('top')
  })

  it('paths on the left and below -> top (top and right tie at 90 degrees; top preferred)', () => {
    expect(autoLoopSide(C, [{ x: -100, y: 0 }, { x: 0, y: 100 }])).toBe('top')
  })

  it('paths on the right and above -> bottom (bottom and left tie; bottom preferred)', () => {
    expect(autoLoopSide(C, [{ x: 100, y: 0 }, { x: 0, y: -100 }])).toBe('bottom')
  })

  it('breaks exact ties in the order bottom, top, right, left', () => {
    // four diagonals: every side has 45 degrees clearance
    expect(autoLoopSide(C, [at(45), at(135), at(-45), at(-135)])).toBe('bottom')
    // vertical paths only: right and left tie
    expect(autoLoopSide(C, [{ x: 0, y: -100 }, { x: 0, y: 100 }])).toBe('right')
  })

  it('treats scores within the tie tolerance as tied', () => {
    expect(LOOP_SIDE_TIE_TOLERANCE_DEG).toBe(10)
    // right (0 deg) + left-slightly-down (175 deg): top 90, bottom 85 -> tied -> bottom
    expect(autoLoopSide(C, [at(0), at(175)])).toBe('bottom')
    // left-and-further-down (160 deg): top 90, bottom 70 -> top clearly better
    expect(autoLoopSide(C, [at(0), at(160)])).toBe('top')
  })

  it('picks the side with the largest clearance', () => {
    // a mediator: incoming from the left, outgoing to the right and down-right
    expect(autoLoopSide(C, [at(180), at(0), at(30)])).toBe('top')
    // paths to the right and above and below: left is clear
    expect(autoLoopSide(C, [at(0), at(-80), at(80)])).toBe('left')
  })
})

describe('nearestLoopSide', () => {
  it('snaps the cursor direction to the nearest side', () => {
    expect(nearestLoopSide(C, { x: 5, y: -40 })).toBe('top')
    expect(nearestLoopSide(C, { x: 40, y: 10 })).toBe('right')
    expect(nearestLoopSide(C, { x: -3, y: 40 })).toBe('bottom')
    expect(nearestLoopSide(C, { x: -40, y: -20 })).toBe('left')
  })
})

/** F (latent) loads on X1 (below-left) and X2 (below-right); a constant above-right of X2. */
function fixture(): GraphSchema {
  return {
    schemaVersion: 0,
    models: {
      m: {
        nodes: [
          { label: 'F', type: 'variable', visual: { x: 0, y: 0 } },
          { label: 'X1', type: 'variable', visual: { x: -100, y: 150 } },
          { label: 'X2', type: 'variable', visual: { x: 100, y: 150 } },
          { label: '1', type: 'constant', visual: { x: 200, y: 150 } },
          { label: 'U', type: 'variable' }, // unplaced: counts as 0,0
        ],
        paths: [
          { label: 'l1', from: 'F', to: 'X1', numberOfArrows: 1 },
          { label: 'l2', from: 'F', to: 'X2', numberOfArrows: 1 },
          { label: 'm2', from: '1', to: 'X2', numberOfArrows: 1 },
          { label: 'vF', from: 'F', to: 'F', numberOfArrows: 2 },
          { label: 'vX1', from: 'X1', to: 'X1', numberOfArrows: 2 },
          { label: 'vX2', from: 'X2', to: 'X2', numberOfArrows: 2 },
          { label: 'uX2', from: 'U', to: 'X2', numberOfArrows: 2 },
        ],
      },
    },
  } as unknown as GraphSchema
}

describe('effective side resolution', () => {
  it('schema and runtime resolvers agree, and a pinned side wins', () => {
    const schema = fixture()
    const model = schema.models.m
    const { nodes, paths } = convertModelToRuntime(model)
    const expected: Record<string, string> = {}
    for (const p of model.paths.filter((p) => p.from === p.to)) {
      expected[p.label as string] = effectiveSchemaLoopSide(p as any, model.nodes as any, model.paths as any)
    }
    // F has paths down-left and down-right -> top; X1 has F up-right -> bottom;
    // X2 has F up-left, the constant to the right and U (0,0) up-left -> bottom
    expect(expected).toEqual({ vF: 'top', vX1: 'bottom', vX2: 'bottom' })
    for (const p of paths.filter((p) => p.from === p.to)) {
      expect(effectiveLoopSide(p, nodes, paths)).toBe(expected[p.label as string])
      expect(effectiveLoopSide({ ...p, side: 'left' }, nodes, paths)).toBe('left')
    }
    const vF = model.paths.find((p) => p.label === 'vF')!
    expect(effectiveSchemaLoopSide({ ...vF, visual: { loopSide: 'right' } } as any, model.nodes as any, model.paths as any)).toBe('right')
  })

  it('follows node moves (the side is computed from current positions)', () => {
    const schema = fixture()
    const { nodes, paths } = convertModelToRuntime(schema.models.m)
    const vX1 = paths.find((p) => p.label === 'vX1')!
    expect(effectiveLoopSide(vX1, nodes, paths)).toBe('bottom')
    // move F below X1: the loop flips to the top
    const moved = nodes.map((n) => (n.label === 'F' ? { ...n, x: -100, y: 400 } : n))
    expect(effectiveLoopSide(vX1, moved, paths)).toBe('top')
  })

  it('svgRenderer draws an unpinned loop exactly as if pinned to its automatic side', () => {
    const auto = fixture()
    const pinned = fixture()
    for (const p of pinned.models.m.paths) {
      if (p.label === 'vF') p.visual = { loopSide: 'top' }
      if (p.label === 'vX1' || p.label === 'vX2') p.visual = { loopSide: 'bottom' }
    }
    const opts = { pathLabelFormat: 'labels' as const }
    expect(modelToSVG(auto, undefined, opts)).toBe(modelToSVG(pinned, undefined, opts))
    // and a different pin changes the drawing
    const other = fixture()
    other.models.m.paths.find((p) => p.label === 'vF')!.visual = { loopSide: 'bottom' }
    expect(modelToSVG(other, undefined, opts)).not.toBe(modelToSVG(auto, undefined, opts))
  })
})

describe('autoLayout and loop sides', () => {
  it('does not write loopSide (Auto Layout never pins a side)', () => {
    const schema = fixture()
    for (const n of schema.models.m.nodes) delete n.visual
    const before = JSON.parse(JSON.stringify(schema))
    const positions = autoLayout(schema)
    expect(Object.keys(positions).length).toBeGreaterThan(0)
    expect(schema).toEqual(before)
    expect(JSON.stringify(positions)).not.toContain('loopSide')
  })
})

describe('data paths are ignored when choosing a loop side', () => {
  // x has a loading from above and a data path from a dataset below. Counting
  // the data path would push the loop to the side; ignoring it gives bottom.
  const nodes = [
    { id: 'f', x: 0, y: -100, type: 'variable' },
    { id: 'x', x: 0, y: 0, type: 'variable' },
    { id: 'd', x: 0, y: 100, type: 'dataset' },
  ]
  it('ignores a path typed "data"', () => {
    const paths = [{ from: 'f', to: 'x' }, { from: 'd', to: 'x', type: 'data' }]
    expect(effectiveLoopSide({ from: 'x' }, nodes, paths)).toBe('bottom')
  })
  it('ignores an untyped path from a dataset node', () => {
    const paths = [{ from: 'f', to: 'x' }, { from: 'd', to: 'x' }]
    expect(effectiveLoopSide({ from: 'x' }, nodes, paths)).toBe('bottom')
  })
  it('the schema resolver agrees', () => {
    const sNodes = nodes.map((n) => ({ label: n.id, type: n.type, visual: { x: n.x, y: n.y } }))
    const paths = [{ from: 'f', to: 'x' }, { from: 'd', to: 'x', type: 'data' }]
    expect(effectiveSchemaLoopSide({ from: 'x' }, sNodes, paths)).toBe('bottom')
  })
})

describe('resolveLoopSides: loops avoid each other and other nodes', () => {
  const box = (x: number, y: number, half = 30) => ({ x, y, halfW: half, halfH: half })
  const none = () => false

  it('two factors side by side both move their loops away from each other', () => {
    // two_level_factor_model, laid out as the editor does: F1 and F2 sit side
    // by side under F3, each with its indicators below. On its own, each
    // factor's clearest side is the one facing the other.
    const doc = JSON.parse(readFileSync(join(__dirname, '../fixtures/models/layout/two_level_factor_model.json'), 'utf8'))
    const m = convertDocToRuntimeDoc(doc)[0]
    const nodes = layoutModel(m, { excludeDatasets: true })!
    const id = (label: string) => nodes.find((n) => n.label === label)!.id
    const isDataset = (k: string) => nodes.find((n) => n.id === k)?.type === 'dataset'
    const latent = new Set(['F1', 'F2', 'F3'].map(id))
    const shapes = new Map(nodes.map((n) => {
      const half = n.type === 'constant' ? 22 : latent.has(n.id) ? 36 : 30
      return [n.id, { x: n.x!, y: n.y!, halfW: half, halfH: half }]
    }))
    const loops = m.paths.filter((p) => p.from === p.to).map((p) => ({ id: p.id, node: p.from }))
    const individually = new Map(loops.map((l) => [l.node, effectiveLoopSide({ from: l.node }, nodes, m.paths)]))
    expect([individually.get(id('F1')), individually.get(id('F2'))].sort()).toEqual(['left', 'right'])

    const sides = resolveLoopSides(loops, shapes, m.paths, isDataset)
    // both give way: neither keeps the side facing the other
    const f1 = loops.find((l) => l.node === id('F1'))!.id
    const f2 = loops.find((l) => l.node === id('F2'))!.id
    expect(sides.get(f1)).not.toBe(individually.get(id('F1')))
    expect(sides.get(f2)).not.toBe(individually.get(id('F2')))
    // no two loops (as circles of radius 20 just outside their nodes) overlap
    const centre = (l: { id: string; node: string }) => {
      const s = shapes.get(l.node)!
      const d = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[sides.get(l.id)!]!
      const reach = (d[0] ? s.halfW : s.halfH) + 6 + 20
      return { x: s.x + d[0] * reach, y: s.y + d[1] * reach }
    }
    for (let i = 0; i < loops.length; i++) {
      for (let j = i + 1; j < loops.length; j++) {
        const a = centre(loops[i]), b = centre(loops[j])
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(40)
      }
    }
  })

  it('a pinned loop keeps its side and others avoid it', () => {
    const shapes = new Map([['x', box(0, 0)], ['y', box(110, 0)]])
    const sides = resolveLoopSides(
      [{ id: 'lx', node: 'x' }, { id: 'ly', node: 'y', pinned: 'left' }], shapes, [], none)
    expect(sides.get('ly')).toBe('left')
    expect(sides.get('lx')).toBe('bottom')
    const sides2 = resolveLoopSides(
      [{ id: 'lx', node: 'x' }, { id: 'ly', node: 'y', pinned: 'bottom' }], shapes, [], none)
    expect(sides2.get('lx')).toBe('bottom')   // no conflict: both at the bottom, far enough apart
  })

  it('a loop avoids a nearby node it is not connected to', () => {
    // x's paths go up and down; ties go bottom, top, right, left, so it would
    // take the right -- where an unconnected node sits close by.
    const shapes = new Map([['x', box(0, 0)], ['up', box(0, -150)], ['down', box(0, 150)], ['n', box(95, 0)]])
    const paths = [{ from: 'up', to: 'x' }, { from: 'x', to: 'down' }]
    expect(rankLoopSides(shapes.get('x')!, [shapes.get('up')!, shapes.get('down')!])[0]).toBe('right')
    expect(resolveLoopSides([{ id: 'l', node: 'x' }], shapes, paths, none).get('l')).toBe('left')
  })

  it('keeps the first-ranked side when every side is blocked', () => {
    const shapes = new Map([['x', box(0, 0)], ['t', box(0, -80)], ['b', box(0, 80)], ['l', box(-80, 0)], ['r', box(80, 0)]])
    expect(resolveLoopSides([{ id: 'l', node: 'x' }], shapes, [], none).get('l')).toBe('bottom')
  })
})
