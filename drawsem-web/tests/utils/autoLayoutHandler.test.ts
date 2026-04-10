/**
 * Tests for the auto-layout handler logic
 *
 * These tests verify the pure logic used by the handleAutoLayout() function in
 * CanvasTool: building a schema from runtime state, calling autoLayout(), and
 * mapping positions back to nodes via node.label.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { autoLayout, PositionMap } from '../../src/utils/autoLayout'
import { GraphSchema } from '../../src/core/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadFixture(filename: string): GraphSchema {
  const path = join(__dirname, '../fixtures/models', filename)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

/** Replicate the position-application step from handleAutoLayout */
function applyPositions(
  nodes: Array<{ label: string; x: number; y: number; [k: string]: any }>,
  positions: PositionMap
): Array<{ label: string; x: number; y: number; [k: string]: any }> {
  return nodes.map((n) => {
    const pos = positions[n.label]
    return pos ? { ...n, x: pos.x, y: pos.y } : n
  })
}

/** Minimal runtime node shape used inside CanvasTool */
function mockNode(label: string, x = 0, y = 0) {
  return { id: `node-${label}`, label, x, y, type: 'variable' as const }
}

// ── Schema construction (mirrors handleAutoLayout internals) ──────────────────

describe('handleAutoLayout – schema construction', () => {
  it('builds a valid GraphSchema from runtime model data', () => {
    const nodes = [mockNode('X'), mockNode('M'), mockNode('Y')]
    const paths: any[] = []
    const modelId = 'test_model'

    const schema: GraphSchema = {
      schemaVersion: 1,
      models: {
        [modelId]: {
          label: 'Test',
          nodes,
          paths,
        },
      },
    }

    // autoLayout should not throw on a well-formed schema
    expect(() => autoLayout(schema)).not.toThrow()
  })

  it('translates runtime paths (from/to/twoSided) to schema paths (from/to/numberOfArrows)', () => {
    // This is the field-name translation that handleAutoLayout must perform.
    // Runtime paths use node IDs and twoSided; schema paths use node labels and numberOfArrows.
    const nodeX = mockNode('X')
    const nodeM = mockNode('M')
    const nodeY = mockNode('Y')
    const runtimeNodes = [nodeX, nodeM, nodeY]
    const runtimePaths = [
      { id: 'p1', from: nodeX.id, to: nodeM.id, twoSided: false },
      { id: 'p2', from: nodeM.id, to: nodeY.id, twoSided: false },
    ]

    // Replicate the translation logic from handleAutoLayout
    const idToLabel: Record<string, string> = {}
    runtimeNodes.forEach((n) => { idToLabel[n.id] = n.label })

    const schemaPaths = runtimePaths.map((p) => ({
      from: idToLabel[p.from] ?? p.from,
      to: idToLabel[p.to] ?? p.to,
      numberOfArrows: p.twoSided ? 2 : 1,
    }))

    expect(schemaPaths[0]).toEqual({ from: 'X', to: 'M', numberOfArrows: 1 })
    expect(schemaPaths[1]).toEqual({ from: 'M', to: 'Y', numberOfArrows: 1 })
  })

  it('translates twoSided:true to numberOfArrows:2', () => {
    const nodeA = mockNode('A')
    const nodeB = mockNode('B')
    const idToLabel: Record<string, string> = { [nodeA.id]: 'A', [nodeB.id]: 'B' }
    const runtimePath = { id: 'p1', from: nodeA.id, to: nodeB.id, twoSided: true }

    const schemaPath = {
      from: idToLabel[runtimePath.from],
      to: idToLabel[runtimePath.to],
      numberOfArrows: runtimePath.twoSided ? 2 : 1,
    }

    expect(schemaPath.numberOfArrows).toBe(2)
  })

  it('autoLayout sees path structure when given correctly translated paths', () => {
    // Build a chain A→B→C and verify B ends up between A and C in rank
    const nodeA = mockNode('A')
    const nodeB = mockNode('B')
    const nodeC = mockNode('C')
    const idToLabel: Record<string, string> = {
      [nodeA.id]: 'A', [nodeB.id]: 'B', [nodeC.id]: 'C',
    }
    const runtimePaths = [
      { from: nodeA.id, to: nodeB.id, twoSided: false },
      { from: nodeB.id, to: nodeC.id, twoSided: false },
    ]

    const schema: GraphSchema = {
      schemaVersion: 1,
      models: {
        m: {
          label: 'Chain',
          nodes: [nodeA, nodeB, nodeC].map((n) => ({
            label: n.label, type: n.type, visual: { x: 0, y: 0 },
          })),
          paths: runtimePaths.map((p) => ({
            from: idToLabel[p.from],
            to: idToLabel[p.to],
            numberOfArrows: p.twoSided ? 2 : 1,
          })),
        },
      },
    } as unknown as GraphSchema

    const positions = autoLayout(schema)
    // All three nodes should receive positions
    expect(positions).toHaveProperty('A')
    expect(positions).toHaveProperty('B')
    expect(positions).toHaveProperty('C')
    // In a chain A→B→C, A B C should not all share the same rank (same y).
    // At least two distinct y values must exist.
    const yValues = new Set([positions['A'].y, positions['B'].y, positions['C'].y])
    expect(yValues.size).toBeGreaterThan(1)
  })
})

// ── autoLayout return values ──────────────────────────────────────────────────

describe('handleAutoLayout – autoLayout() output', () => {
  it('returns positions keyed by node labels', () => {
    const schema = loadFixture('mediation-model.json')
    const positions = autoLayout(schema)

    expect(typeof positions).toBe('object')
    // Mediation model has nodes X, M, Y
    expect(positions).toHaveProperty('X')
    expect(positions).toHaveProperty('M')
    expect(positions).toHaveProperty('Y')
  })

  it('positions have numeric x and y properties', () => {
    const schema = loadFixture('mediation-model.json')
    const positions = autoLayout(schema)

    for (const [, pos] of Object.entries(positions)) {
      expect(typeof pos.x).toBe('number')
      expect(typeof pos.y).toBe('number')
      expect(isFinite(pos.x)).toBe(true)
      expect(isFinite(pos.y)).toBe(true)
    }
  })

  it('produces distinct positions for distinct nodes', () => {
    const schema = loadFixture('mediation-model.json')
    const positions = autoLayout(schema)

    const coords = Object.values(positions).map((p) => `${p.x},${p.y}`)
    const unique = new Set(coords)
    // All three nodes should land in different positions
    expect(unique.size).toBe(Object.keys(positions).length)
  })

  it('returns positions for all variable nodes in a CFA model', () => {
    const schema = loadFixture('cfa-model.json')
    const positions = autoLayout(schema)

    // Every variable node in the first model should have a position
    const firstModel = Object.values(schema.models)[0] as any
    const varNodeLabels: string[] = (firstModel.nodes ?? [])
      .filter((n: any) => n.type === 'variable')
      .map((n: any) => n.label as string)

    for (const label of varNodeLabels) {
      expect(positions).toHaveProperty(label)
    }
  })

  it('handles an inline minimal schema without filesystem access', () => {
    const schema: GraphSchema = {
      schemaVersion: 1,
      models: {
        m: {
          label: 'Minimal',
          nodes: [
            { label: 'A', type: 'variable', visual: { x: 0, y: 0 } },
            { label: 'B', type: 'variable', visual: { x: 0, y: 0 } },
          ],
          paths: [
            { from: 'A', to: 'B', numberOfArrows: 1 },
          ],
        },
      },
    }
    const positions = autoLayout(schema)
    expect(positions).toHaveProperty('A')
    expect(positions).toHaveProperty('B')
  })
})

// ── Position application logic ────────────────────────────────────────────────

describe('handleAutoLayout – position application', () => {
  it('updates node x and y from positions map', () => {
    const nodes = [mockNode('X', 0, 0), mockNode('Y', 0, 0)]
    const positions: PositionMap = {
      X: { x: 100, y: 200 },
      Y: { x: 300, y: 200 },
    }
    const updated = applyPositions(nodes, positions)

    expect(updated[0]).toMatchObject({ label: 'X', x: 100, y: 200 })
    expect(updated[1]).toMatchObject({ label: 'Y', x: 300, y: 200 })
  })

  it('leaves nodes unchanged when their label is absent from positions map', () => {
    const nodes = [mockNode('Known', 0, 0), mockNode('Unknown', 50, 75)]
    const positions: PositionMap = {
      Known: { x: 100, y: 100 },
    }
    const updated = applyPositions(nodes, positions)

    expect(updated[0]).toMatchObject({ label: 'Known', x: 100, y: 100 })
    // Unknown node retains its original coordinates
    expect(updated[1]).toMatchObject({ label: 'Unknown', x: 50, y: 75 })
  })

  it('preserves all other node properties when applying positions', () => {
    const node = { id: 'n1', label: 'X', x: 0, y: 0, type: 'variable' as const, someExtra: 'preserved' }
    const positions: PositionMap = { X: { x: 999, y: 888 } }
    const [updated] = applyPositions([node], positions)

    expect(updated.someExtra).toBe('preserved')
    expect(updated.id).toBe('n1')
    expect(updated.type).toBe('variable')
  })

  it('returns empty array unchanged when no nodes provided', () => {
    const positions: PositionMap = { X: { x: 10, y: 10 } }
    const updated = applyPositions([], positions)
    expect(updated).toHaveLength(0)
  })

  it('handles empty positions map — all nodes left unchanged', () => {
    const nodes = [mockNode('A', 10, 20), mockNode('B', 30, 40)]
    const updated = applyPositions(nodes, {})

    expect(updated[0]).toMatchObject({ x: 10, y: 20 })
    expect(updated[1]).toMatchObject({ x: 30, y: 40 })
  })
})

// ── Full round-trip: schema → positions → node update ────────────────────────

describe('handleAutoLayout – full round-trip', () => {
  it('recomputes node positions from a fixture schema', () => {
    const schema = loadFixture('mediation-model.json')
    const firstModelKey = Object.keys(schema.models)[0]
    const model = schema.models[firstModelKey] as any

    // Simulate runtime nodes at (0,0)
    const runtimeNodes = (model.nodes as any[]).map((n: any) =>
      mockNode(n.label, 0, 0)
    )

    const positions = autoLayout(schema)
    const updated = applyPositions(runtimeNodes, positions)

    // Every node should now have a non-zero position (or at minimum a defined one)
    for (const n of updated) {
      expect(positions[n.label]).toBeDefined()
      expect(n.x).toBe(positions[n.label].x)
      expect(n.y).toBe(positions[n.label].y)
    }
  })
})
