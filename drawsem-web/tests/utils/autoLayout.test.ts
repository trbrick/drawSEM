import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { autoLayout } from '../../src/utils/autoLayout'
import { generateLayoutReport } from '../../src/utils/layoutReport'
import { GraphSchema } from '../../src/core/types'

/**
 * Test suite for RAMPath layout algorithm
 * Tests use fixture models from tests/fixtures/models/layout/
 */

// Helper to load test fixtures
function loadFixture(filename: string): GraphSchema {
  const path = join(__dirname, '../fixtures/models/layout', filename)
  const content = readFileSync(path, 'utf-8')
  return JSON.parse(content)
}

function loadExpectedLayout(filename: string): any {
  const path = join(__dirname, '../fixtures/layouts', filename)
  const content = readFileSync(path, 'utf-8')
  return JSON.parse(content)
}

// Helper to write layout reports for visual validation
function writeLayoutReport(filename: string, html: string): void {
  const reportsDir = join(__dirname, '../../dist/test-reports/layout')
  try {
    mkdirSync(reportsDir, { recursive: true })
  } catch (e) {
    // Directory may already exist
  }
  const filepath = join(reportsDir, filename)
  writeFileSync(filepath, html, 'utf-8')
}

// Helper to update test metadata with run timestamp
function updateTestMetadata(): void {
  const reportsDir = join(__dirname, '../../dist/test-reports')
  try {
    mkdirSync(reportsDir, { recursive: true })
  } catch (e) {
    // Directory may already exist
  }
  
  const metadataPath = join(reportsDir, 'test-metadata.json')
  let metadata = {}
  
  // Read existing metadata if it exists
  try {
    const existing = readFileSync(metadataPath, 'utf-8')
    metadata = JSON.parse(existing)
  } catch (e) {
    // File doesn't exist or is invalid, start fresh
  }
  
  // Update layout test timestamp
  metadata.layoutTestsRunAt = new Date().toISOString()
  
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
}

describe('RAMPath Layout Algorithm', () => {
  describe('simple_chain: X→Y→Z', () => {
    let model: GraphSchema
    let expected: any

    beforeAll(() => {
      model = loadFixture('simple_chain.json')
      expected = loadExpectedLayout('simple_chain.expected.json')
    })

    it('should load the fixture', () => {
      expect(model).toBeDefined()
      expect(Object.keys(model.models)).toHaveLength(1)
    })

    it('should assign correct ranks: X(2) → Y(1) → Z(0)', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      expect(ranks['X']).toBe(2)
      expect(ranks['Y']).toBe(1)
      expect(ranks['Z']).toBe(0)
    })

    it('should position nodes vertically by rank', () => {
      const positions = autoLayout(model)
      const xY = positions['X'].y
      const yY = positions['Y'].y
      const zY = positions['Z'].y

      // X (rank 2) should be higher (smaller y) than Y (rank 1)
      expect(xY).toBeLessThan(yY)
      // Y (rank 1) should be higher (smaller y) than Z (rank 0)
      expect(yY).toBeLessThan(zY)
    })

    it('should match expected rank assignments', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      Object.entries(expected.expectedRanks).forEach(([label, expectedRank]) => {
        expect(ranks[label]).toBe(expectedRank)
      })
    })

    it('should generate valid HTML report', () => {
      const positions = autoLayout(model)
      const html = generateLayoutReport('simple_chain', model, positions, expected.expectedRanks)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('simple_chain')
      expect(html).toContain('<svg')
      writeLayoutReport('simple_chain.html', html)
    })
  })

  describe('one_factor_model: F→X1-X3', () => {
    let model: GraphSchema
    let expected: any

    beforeAll(() => {
      model = loadFixture('one_factor_model.json')
      expected = loadExpectedLayout('one_factor_model.expected.json')
    })

    it('should assign correct ranks: F(1) → X1-X3(0)', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      expect(ranks['F']).toBe(1)
      expect(ranks['X1']).toBe(0)
      expect(ranks['X2']).toBe(0)
      expect(ranks['X3']).toBe(0)
    })

    it('should position manifest variables in same rank horizontally', () => {
      const positions = autoLayout(model)
      const y1 = positions['X1'].y
      const y2 = positions['X2'].y
      const y3 = positions['X3'].y

      expect(y1).toBe(y2)
      expect(y2).toBe(y3)

      const x1 = positions['X1'].x
      const x2 = positions['X2'].x
      const x3 = positions['X3'].x
      expect(x2).toBeGreaterThan(x1)
      expect(x3).toBeGreaterThan(x2)
    })

    it('should match expected rank assignments', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      Object.entries(expected.expectedRanks).forEach(([label, expectedRank]) => {
        expect(ranks[label]).toBe(expectedRank)
      })
    })

    it('should generate valid HTML report', () => {
      const positions = autoLayout(model)
      const html = generateLayoutReport('one_factor_model', model, positions, expected.expectedRanks)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('one_factor_model')
      expect(html).toContain('<svg')
      writeLayoutReport('one_factor_model.html', html)
    })
  })

  describe('two_level_factor_model: F3→F1→X1-X3, F3→F2→X4-X6', () => {
    let model: GraphSchema
    let expected: any

    beforeAll(() => {
      model = loadFixture('two_level_factor_model.json')
      expected = loadExpectedLayout('two_level_factor_model.expected.json')
    })

    it('should assign correct ranks for hierarchical structure', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      expect(ranks['F3']).toBe(2)
      expect(ranks['F1']).toBe(1)
      expect(ranks['F2']).toBe(1)
      expect(ranks['X1']).toBe(0)
      expect(ranks['X6']).toBe(0)
    })

    it('should match expected rank assignments', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      Object.entries(expected.expectedRanks).forEach(([label, expectedRank]) => {
        expect(ranks[label]).toBe(expectedRank)
      })
    })

    it('should generate valid HTML report', () => {
      const positions = autoLayout(model)
      const html = generateLayoutReport('two_level_factor_model', model, positions, expected.expectedRanks)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('two_level_factor_model')
      expect(html).toContain('<svg')
      writeLayoutReport('two_level_factor_model.html', html)
    })
  })

  describe('diamond: X→Y, X→Z, Y→W, Z→W', () => {
    let model: GraphSchema
    let expected: any

    beforeAll(() => {
      model = loadFixture('diamond.json')
      expected = loadExpectedLayout('diamond.expected.json')
    })

    it('should handle convergence pattern correctly', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      expect(ranks['X']).toBe(2)
      expect(ranks['Y']).toBe(1)
      expect(ranks['Z']).toBe(1)
      expect(ranks['W']).toBe(0)
    })

    it('should position Y and Z in same rank', () => {
      const positions = autoLayout(model)
      const yy = positions['Y'].y
      const zy = positions['Z'].y
      expect(yy).toBe(zy)
    })

    it('should match expected rank assignments', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      Object.entries(expected.expectedRanks).forEach(([label, expectedRank]) => {
        expect(ranks[label]).toBe(expectedRank)
      })
    })

    it('should generate valid HTML report', () => {
      const positions = autoLayout(model)
      const html = generateLayoutReport('diamond', model, positions, expected.expectedRanks)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('diamond')
      expect(html).toContain('<svg')
      writeLayoutReport('diamond.html', html)
    })
  })

  describe('cycle: X→Y→Z→X', () => {
    let model: GraphSchema
    let expected: any

    beforeAll(() => {
      model = loadFixture('cycle.json')
      expected = loadExpectedLayout('cycle.expected.json')
    })

    it('should assign all cycle nodes to same rank', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      expect(ranks['X']).toBe(2)
      expect(ranks['Y']).toBe(2)
      expect(ranks['Z']).toBe(2)
    })

    it('should match expected rank assignments', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      Object.entries(expected.expectedRanks).forEach(([label, expectedRank]) => {
        expect(ranks[label]).toBe(expectedRank)
      })
    })

    it('should note that this requires special handling later', () => {
      // This test documents the known limitation
      expect(expected.notes.toLowerCase()).toContain('special handling')
    })

    it('should generate valid HTML report', () => {
      const positions = autoLayout(model)
      const html = generateLayoutReport('cycle', model, positions, expected.expectedRanks)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('cycle')
      expect(html).toContain('<svg')
      writeLayoutReport('cycle.html', html)
    })
  })

  describe('isolated_nodes: X→Y→Z, A (isolated), B (isolated)', () => {
    let model: GraphSchema
    let expected: any

    beforeAll(() => {
      model = loadFixture('isolated_nodes.json')
      expected = loadExpectedLayout('isolated_nodes.expected.json')
    })

    it('should handle isolated nodes correctly', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      // Connected chain: X→Y→Z gets ranks 2,1,0
      expect(ranks['X']).toBe(2)
      expect(ranks['Y']).toBe(1)
      expect(ranks['Z']).toBe(0)

      // Isolated nodes are treated as sources (Infinity) → grouped with X at rank 2
      expect(ranks['A']).toBe(2)
      expect(ranks['B']).toBe(2)
    })

    it('should match expected rank assignments', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      Object.entries(expected.expectedRanks).forEach(([label, expectedRank]) => {
        expect(ranks[label]).toBe(expectedRank)
      })
    })

    it('should generate valid HTML report', () => {
      const positions = autoLayout(model)
      const html = generateLayoutReport('isolated_nodes', model, positions, expected.expectedRanks)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('isolated_nodes')
      expect(html).toContain('<svg')
      writeLayoutReport('isolated_nodes.html', html)
    })
  })

  describe('factor_mediator_model: X1-X2→F→X3-X5', () => {
    let model: GraphSchema
    let expected: any

    beforeAll(() => {
      model = loadFixture('factor_mediator_model.json')
      expected = loadExpectedLayout('factor_mediator_model.expected.json')
    })

    it('should handle latent mediator pattern correctly', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      // Predictors: X1→F→X3 means X1 has longest path 2
      expect(ranks['X1']).toBe(2)
      expect(ranks['X2']).toBe(2)

      // Mediator: F has longest path 1
      expect(ranks['F']).toBe(1)

      // Outcomes: X3 has longest path 0
      expect(ranks['X3']).toBe(0)
      expect(ranks['X4']).toBe(0)
      expect(ranks['X5']).toBe(0)
    })

    it('should position predictors and outcomes in same ranks', () => {
      const positions = autoLayout(model)
      const x1y = positions['X1'].y
      const x2y = positions['X2'].y
      expect(x1y).toBe(x2y)

      const x3y = positions['X3'].y
      const x4y = positions['X4'].y
      const x5y = positions['X5'].y
      expect(x3y).toBe(x4y)
      expect(x4y).toBe(x5y)
    })

    it('should match expected rank assignments', () => {
      const positions = autoLayout(model)
      const ranks: Record<string, number> = {}
      Object.entries(positions).forEach(([label, pos]) => {
        ranks[label] = pos.rank ?? 0
      })

      Object.entries(expected.expectedRanks).forEach(([label, expectedRank]) => {
        expect(ranks[label]).toBe(expectedRank)
      })
    })

    it('should generate valid HTML report', () => {
      const positions = autoLayout(model)
      const html = generateLayoutReport('factor_mediator_model', model, positions, expected.expectedRanks)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('factor_mediator_model')
      expect(html).toContain('<svg')
      writeLayoutReport('factor_mediator_model.html', html)
    })
  })

  describe('Configuration options', () => {
    let simpleChainModel: GraphSchema
    let factorModel: GraphSchema

    beforeAll(() => {
      simpleChainModel = loadFixture('simple_chain.json')
      factorModel = loadFixture('one_factor_model.json')
    })

    it('should respect nodeWidth option', () => {
      // Use one_factor_model where X1, X2, X3 are all in the same rank
      // so nodeWidth affects their horizontal spacing
      const positions1 = autoLayout(factorModel, { nodeWidth: 50 })
      const positions2 = autoLayout(factorModel, { nodeWidth: 100 })

      // Wider nodeWidth should result in larger x spacing between nodes in same rank
      const spacing1 = Math.abs(positions1['X2'].x - positions1['X1'].x)
      const spacing2 = Math.abs(positions2['X2'].x - positions2['X1'].x)
      expect(spacing2).toBeGreaterThan(spacing1)
    })

    it('should respect rankHeight option', () => {
      const positions1 = autoLayout(simpleChainModel, { rankHeight: 100 })
      const positions2 = autoLayout(simpleChainModel, { rankHeight: 200 })

      // Larger rankHeight should result in larger y spacing
      const vSpacing1 = Math.abs(positions1['Y'].y - positions1['X'].y)
      const vSpacing2 = Math.abs(positions2['Y'].y - positions2['X'].y)
      expect(vSpacing2).toBeGreaterThan(vSpacing1)
    })
  })

  describe('Error handling', () => {
    it('should throw error if schema has no models', () => {
      const invalidSchema = { schemaVersion: 1, models: {} } as GraphSchema
      expect(() => autoLayout(invalidSchema)).toThrow()
    })

    it('should handle empty models gracefully', () => {
      const emptyModel: GraphSchema = {
        schemaVersion: 1,
        models: {
          test: {
            label: 'test',
            nodes: [],
            paths: [],
          },
        },
      }
      const positions = autoLayout(emptyModel)
      expect(positions).toBeDefined()
      expect(Object.keys(positions)).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Error node placement (Phase 1.5 + Phase 5.5)
  // ---------------------------------------------------------------------------
  //
  // Three cases are tested:
  //   A. 'below'  – CFA error on terminal indicator (cfa-model.json)
  //   B. 'below'  – graph.example.json: errors with correlated error path,
  //                 x_2 has its own self-loop but is NOT an error node
  //   C. 'beside' – structural disturbance on a non-terminal factor
  // ---------------------------------------------------------------------------

  describe('error node placement – CFA (below): cfa-model.json', () => {
    // F → X1/X2/X3, with ε₁/ε₂/ε₃ as error nodes.
    // Each εᵢ has: one free self-loop, no incoming paths, one fixed-1.0
    // outgoing path to a terminal indicator.  Expected placement: 'below'.

    let model: GraphSchema
    beforeAll(() => {
      const path = join(__dirname, '../fixtures/models/cfa-model.json')
      model = JSON.parse(readFileSync(path, 'utf-8'))
    })

    it('should return positions for all variable nodes including errors', () => {
      const positions = autoLayout(model)
      expect(positions).toHaveProperty('F')
      expect(positions).toHaveProperty('X1')
      expect(positions).toHaveProperty('X2')
      expect(positions).toHaveProperty('X3')
      expect(positions).toHaveProperty('ε₁')
      expect(positions).toHaveProperty('ε₂')
      expect(positions).toHaveProperty('ε₃')
    })

    it('error nodes should have a strictly lower rank than their targets', () => {
      const positions = autoLayout(model)
      expect(positions['ε₁'].rank).toBeLessThan(positions['X1'].rank!)
      expect(positions['ε₂'].rank).toBeLessThan(positions['X2'].rank!)
      expect(positions['ε₃'].rank).toBeLessThan(positions['X3'].rank!)
    })

    it('error nodes should be visually below their targets (higher y)', () => {
      const positions = autoLayout(model)
      expect(positions['ε₁'].y).toBeGreaterThan(positions['X1'].y)
      expect(positions['ε₂'].y).toBeGreaterThan(positions['X2'].y)
      expect(positions['ε₃'].y).toBeGreaterThan(positions['X3'].y)
    })

    it('each error node should have the same x as its target (centred below)', () => {
      const positions = autoLayout(model)
      expect(positions['ε₁'].x).toBe(positions['X1'].x)
      expect(positions['ε₂'].x).toBe(positions['X2'].x)
      expect(positions['ε₃'].x).toBe(positions['X3'].x)
    })

    it('factor F should NOT be detected as an error node', () => {
      // F has a free self-loop (Φ) but also has outgoing paths to X1/X2/X3,
      // so condition 4 (exactly one outgoing path) fails.
      const positions = autoLayout(model)
      // F must sit above or at the same level as the indicators, never below.
      expect(positions['F'].y).toBeLessThan(positions['X1'].y)
    })

    it('error nodes should not shift indicator x-positions', () => {
      // Removing error nodes from the main rank phase should leave X1/X2/X3
      // centred identically to a model without error nodes.
      const withErrors = autoLayout(model)

      const noErrorModel: GraphSchema = {
        schemaVersion: 1,
        models: {
          m: {
            label: 'no errors',
            nodes: [
              { label: 'F',  type: 'variable', visual: { x: 0, y: 0 } },
              { label: 'X1', type: 'variable', visual: { x: 0, y: 0 } },
              { label: 'X2', type: 'variable', visual: { x: 0, y: 0 } },
              { label: 'X3', type: 'variable', visual: { x: 0, y: 0 } },
            ],
            paths: [
              { from: 'F', to: 'X1', numberOfArrows: 1, value: 1.0,  },
              { from: 'F', to: 'X2', numberOfArrows: 1, value: 1.0, freeParameter: true  },
              { from: 'F', to: 'X3', numberOfArrows: 1, value: 1.0, freeParameter: true  },
              { from: 'F', to: 'F',  numberOfArrows: 2, value: 1.0, freeParameter: true  },
            ],
          },
        },
      }
      const withoutErrors = autoLayout(noErrorModel)

      expect(withErrors['X1'].x).toBe(withoutErrors['X1'].x)
      expect(withErrors['X2'].x).toBe(withoutErrors['X2'].x)
      expect(withErrors['X3'].x).toBe(withoutErrors['X3'].x)
    })
  })

  describe('cfa_with_errors: F_1→x_1/x_2/x_3 with explicit error nodes and correlated residuals', () => {
    // Fixture: tests/fixtures/models/layout/cfa_with_errors.json
    // F_1 → x_1, x_2, x_3 (loadings); eps_x1 → x_1, eps_x3 → x_3 (unit error paths);
    // eps_x1 ↔ eps_x3 (correlated errors — must NOT disqualify detection);
    // x_2 carries its own free self-loop (no dedicated error node);
    // F_1 has a fixed self-loop (factor variance fixed for identification).

    let model: GraphSchema
    let expected: any
    beforeAll(() => {
      model = loadFixture('cfa_with_errors.json')
      expected = loadExpectedLayout('cfa_with_errors.expected.json')
    })

    it('should return positions for all six variable nodes', () => {
      const positions = autoLayout(model)
      expect(Object.keys(positions)).toHaveLength(6)
      ;['F_1', 'x_1', 'x_2', 'x_3', 'eps_x1', 'eps_x3'].forEach(label => {
        expect(positions).toHaveProperty(label)
      })
    })

    it('should match expected rank assignments', () => {
      const positions = autoLayout(model)
      Object.entries(expected.expectedRanks).forEach(([label, expectedRank]) => {
        expect(positions[label]?.rank, `rank of ${label}`).toBe(expectedRank)
      })
    })

    it('should generate valid HTML report', () => {
      const positions = autoLayout(model)
      const html = generateLayoutReport('cfa_with_errors', model, positions, expected.expectedRanks)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<svg')
      writeLayoutReport('cfa_with_errors.html', html)
    })

    it('eps_x1 and eps_x3 should be detected as error nodes (rank < indicator rank)', () => {
      const positions = autoLayout(model)
      expect(positions['eps_x1'].rank).toBeLessThan(positions['x_1'].rank!)
      expect(positions['eps_x3'].rank).toBeLessThan(positions['x_3'].rank!)
    })

    it('eps_x1 and eps_x3 should be visually below x_1 and x_3', () => {
      const positions = autoLayout(model)
      expect(positions['eps_x1'].y).toBeGreaterThan(positions['x_1'].y)
      expect(positions['eps_x3'].y).toBeGreaterThan(positions['x_3'].y)
    })

    it('x_2 should NOT be detected as an error node (it has a self-loop)', () => {
      // x_2 has its own free self-loop, so condition 4b (target has no self-loop) fails
      // for any hypothetical node driving x_2.  But x_2 itself is the problem case:
      // x_2 has a self-loop AND incoming from F_1, so conditions 2+3 both fail.
      // Either way x_2 stays at indicator rank 0, not below.
      const positions = autoLayout(model)
      expect(positions['x_2'].rank).toBe(positions['x_1'].rank)
    })

    it('F_1 should NOT be detected as an error node (fixed self-loop, multiple outgoing)', () => {
      const positions = autoLayout(model)
      // F_1 must be above the indicators
      expect(positions['F_1'].y).toBeLessThan(positions['x_1'].y)
    })

    it('all six nodes should have finite, distinct coordinates', () => {
      const positions = autoLayout(model)
      for (const [label, pos] of Object.entries(positions)) {
        expect(isFinite(pos.x), `${label}.x is not finite`).toBe(true)
        expect(isFinite(pos.y), `${label}.y is not finite`).toBe(true)
      }
      const coords = Object.values(positions).map(p => `${p.x},${p.y}`)
      const unique = new Set(coords)
      expect(unique.size).toBe(Object.keys(positions).length)
    })
  })

  describe('structural_disturbance: F1→F2→X1-X3 with D_F2 disturbance (beside)', () => {
    // Fixture: tests/fixtures/models/layout/structural_disturbance.json
    // F1 → F2 → X1/X2/X3; D_F2 is the RAM-style disturbance on endogenous factor F2.
    // D_F2 has: one free self-loop, no incoming paths, one fixed-1.0 path to F2.
    // F2 is non-terminal (loads on X1/X2/X3) → placement = 'beside'.

    let model: GraphSchema
    let expected: any
    beforeAll(() => {
      model = loadFixture('structural_disturbance.json')
      expected = loadExpectedLayout('structural_disturbance.expected.json')
    })

    it('should return positions for all six variable nodes', () => {
      const positions = autoLayout(model)
      expect(Object.keys(positions)).toHaveLength(6)
    })

    it('should match expected rank assignments', () => {
      const positions = autoLayout(model)
      Object.entries(expected.expectedRanks).forEach(([label, expectedRank]) => {
        expect(positions[label]?.rank, `rank of ${label}`).toBe(expectedRank)
      })
    })

    it('should generate valid HTML report', () => {
      const positions = autoLayout(model)
      const html = generateLayoutReport('structural_disturbance', model, positions, expected.expectedRanks)
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<svg')
      writeLayoutReport('structural_disturbance.html', html)
    })

    it('D_F2 should be at the same rank as F2 (beside placement)', () => {
      const positions = autoLayout(model)
      expect(positions['D_F2'].rank).toBe(positions['F2'].rank)
    })

    it('D_F2 should be at the same y as F2', () => {
      const positions = autoLayout(model)
      expect(positions['D_F2'].y).toBe(positions['F2'].y)
    })

    it('D_F2 should not share the same x as F2', () => {
      const positions = autoLayout(model)
      expect(positions['D_F2'].x).not.toBe(positions['F2'].x)
    })

    it('F2 rank should be between F1 and the indicators', () => {
      const positions = autoLayout(model)
      expect(positions['F1'].y).toBeLessThan(positions['F2'].y)
      expect(positions['F2'].y).toBeLessThan(positions['X1'].y)
    })
  })

  // Update metadata after all tests complete
  afterAll(() => {
    updateTestMetadata()
  })
})
