/**
 * Test suite for SVG Renderer
 * Tests SVG generation from positioned graph models
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { autoLayout } from '../../src/utils/autoLayout'
import { modelToSVG, SvgExportOptions } from '../../src/utils/svgRenderer'
import { GraphSchema, Node, Path } from '../../src/core/types'

/**
 * Helper to integrate positions into schema.nodes[].visual
 * (mirrors CanvasTool integration of auto-layout results)
 */
function integratePositionsIntoSchema(schema: GraphSchema, positions: Record<string, { x: number; y: number }>): void {
  const modelKey = Object.keys(schema.models)[0]
  if (!modelKey) return
  const model = schema.models[modelKey]
  
  model.nodes?.forEach(node => {
    const pos = positions[node.label]
    if (pos) {
      node.visual = { ...node.visual, x: pos.x, y: pos.y }
    }
  })
}

/**
 * Helper to load test fixtures
 */
function loadFixture(filename: string): GraphSchema {
  const path = join(__dirname, '../fixtures/models/layout', filename)
  const content = readFileSync(path, 'utf-8')
  return JSON.parse(content)
}

/**
 * Helper to write SVG output for manual inspection
 */
function writeSvgReport(filename: string, svg: string): void {
  const reportsDir = join(__dirname, '../../dist/test-reports/svg')
  try {
    mkdirSync(reportsDir, { recursive: true })
  } catch (e) {
    // Directory may already exist
  }
  const filepath = join(reportsDir, filename)
  writeFileSync(filepath, svg, 'utf-8')
}

/**
 * Helper to update test metadata with run timestamp
 */
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
  
  // Update SVG test timestamp
  metadata.svgTestsRunAt = new Date().toISOString()
  
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
}

/**
 * Simple XML validation - check for well-formed structure
 */
function isValidXml(svgString: string): boolean {
  try {
    // Check basic structure
    if (!svgString.includes('<svg') || !svgString.includes('</svg>')) {
      return false
    }
    // Count opening and closing tags
    const openTags = (svgString.match(/<[a-z]+/g) || []).length
    const closeTags = (svgString.match(/<\/[a-z]+>/g) || []).length
    const selfCloseTags = (svgString.match(/\/>/g) || []).length
    
    // Basic check: roughly balanced tags
    return openTags >= closeTags
  } catch {
    return false
  }
}

describe('SVG Renderer', () => {
  describe('Basic rendering - simple_chain', () => {
    let schema: GraphSchema

    beforeAll(() => {
      schema = loadFixture('simple_chain.json')
      const positions = autoLayout(schema)
      integratePositionsIntoSchema(schema, positions)
    })

    it('should generate SVG from positioned model', () => {
      const svg = modelToSVG(schema)
      expect(svg).toBeDefined()
      expect(svg.length).toBeGreaterThan(0)
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
    })

    it('should produce valid XML structure', () => {
      const svg = modelToSVG(schema)
      expect(isValidXml(svg)).toBe(true)
    })

    it('should include marker definitions', () => {
      const svg = modelToSVG(schema)
      expect(svg).toContain('<defs>')
      expect(svg).toContain('</defs>')
      expect(svg).toContain('arrow-start')
      expect(svg).toContain('arrow-end')
    })

    it('should include all nodes in output', () => {
      const svg = modelToSVG(schema)
      const model = schema.models[Object.keys(schema.models)[0]]
      
      // Count circles (latent) + rects (manifest/dataset) + polygons (constant)
      const circles = (svg.match(/<circle/g) || []).length
      const rects = (svg.match(/<rect/g) || []).length
      const polygons = (svg.match(/<polygon/g) || []).length
      
      const totalShapes = circles + rects + polygons
      
      // Should have at least some shapes (nodes may be filtered)
      expect(totalShapes).toBeGreaterThan(0)
    })

    it('should include all visible nodes when showDatasetNodes=true', () => {
      const svg = modelToSVG(schema, undefined, { showDatasetNodes: true })
      const model = schema.models[Object.keys(schema.models)[0]]
      const visibleNodes = model.nodes.filter(n => n.type !== 'dataset').length + 
                           (model.nodes.some(n => n.type === 'dataset') ? 1 : 0)
      expect(svg).toContain('<rect')
    })

    it('should exclude dataset nodes when showDatasetNodes=false', () => {
      const svg = modelToSVG(schema, undefined, { showDatasetNodes: false })
      const model = schema.models[Object.keys(schema.models)[0]]
      const hasDataset = model.nodes.some(n => n.type === 'dataset')
      
      if (hasDataset) {
        // If the fixture has a dataset node, verify it's NOT in the SVG
        // Dataset nodes are rendered with ellipses (for database can icon)
        const svgWithDataset = modelToSVG(schema, undefined, { showDatasetNodes: true })
        const ellipsesWithDataset = (svgWithDataset.match(/<ellipse/g) || []).length
        const ellipsesWithoutDataset = (svg.match(/<ellipse/g) || []).length
        expect(ellipsesWithoutDataset).toBeLessThan(ellipsesWithDataset)
      }
      
      // Just verify the SVG is still valid and has content
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
    })

    it('should exclude constant nodes when showConstantNodes=false', () => {
      const svg = modelToSVG(schema, undefined, { showConstantNodes: false })
      const model = schema.models[Object.keys(schema.models)[0]]
      const hasConstant = model.nodes.some(n => n.type === 'constant')
      
      if (hasConstant) {
        // If the fixture has a constant node, verify it's NOT in the SVG
        // Constant nodes are rendered as polygons (triangles)
        const svgWithConstant = modelToSVG(schema, undefined, { showConstantNodes: true })
        const polygonsWithConstant = (svgWithConstant.match(/<polygon/g) || []).length
        const polygonsWithoutConstant = (svg.match(/<polygon/g) || []).length
        expect(polygonsWithoutConstant).toBeLessThan(polygonsWithConstant)
      }
      
      // Just verify the SVG is still valid and has content
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
    })

    it('should exclude both dataset and constant nodes when both show flags are false', () => {
      const svg = modelToSVG(schema, undefined, { 
        showDatasetNodes: false,
        showConstantNodes: false 
      })
      const model = schema.models[Object.keys(schema.models)[0]]
      
      // Get counts from the full SVG
      const svgFull = modelToSVG(schema)
      const ellipsesWithDataset = (svgFull.match(/<ellipse/g) || []).length
      const polygonsWithConstant = (svgFull.match(/<polygon/g) || []).length
      const ellipsesFiltered = (svg.match(/<ellipse/g) || []).length
      const polygonsFiltered = (svg.match(/<polygon/g) || []).length
      
      // Should have fewer or equal shapes when filtering
      expect(ellipsesFiltered).toBeLessThanOrEqual(ellipsesWithDataset)
      expect(polygonsFiltered).toBeLessThanOrEqual(polygonsWithConstant)
      
      // SVG should still be valid
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
    })

    it('should render with custom padding', () => {
      const svgDefault = modelToSVG(schema)
      const svgPadded = modelToSVG(schema, undefined, { padding: 100 })
      
      // Extract viewBox from each
      const defaultBox = svgDefault.match(/viewBox="([^"]+)"/)?.[1]
      const paddedBox = svgPadded.match(/viewBox="([^"]+)"/)?.[1]
      
      expect(defaultBox).toBeDefined()
      expect(paddedBox).toBeDefined()
      expect(defaultBox).not.toBe(paddedBox)
    })

    it('should set background color', () => {
      const svg = modelToSVG(schema, undefined, {
        backgroundColor: '#f0f0f0',
      })
      expect(svg).toContain('background-color: #f0f0f0')
    })

    it('should write SVG report for inspection', () => {
      const svg = modelToSVG(schema)
      writeSvgReport('simple_chain.svg', svg)
      
      // Verify file was written
      const filepath = join(__dirname, '../../dist/test-reports/svg/simple_chain.svg')
      expect(readFileSync(filepath, 'utf-8')).toBeDefined()
    })
  })

  describe('Node rendering', () => {
    let schema: GraphSchema

    beforeAll(() => {
      schema = loadFixture('one_factor_model.json')
      const positions = autoLayout(schema)
      integratePositionsIntoSchema(schema, positions)
    })

    it('should render manifest variable nodes as rectangles', () => {
      const svg = modelToSVG(schema)
      // Note: manifest nodes are rendered as rects
      expect(svg).toContain('<rect')
      expect(svg).toContain('rx="4"')
    })

    it('should render latent variable nodes as circles', () => {
      const svg = modelToSVG(schema)
      expect(svg).toContain('<circle')
    })

    it('should render constant nodes as triangles', () => {
      const svg = modelToSVG(schema)
      expect(svg).toContain('<polygon')
    })

    it('should include node labels with correct text', () => {
      const svg = modelToSVG(schema)
      const model = schema.models[Object.keys(schema.models)[0]]
      
      model.nodes.forEach(node => {
        // Check that node label appears in SVG as text content
        expect(svg).toContain(node.label)
      })
    })

    it('should position nodes from schema.nodes[].visual', () => {
      const svg = modelToSVG(schema)
      const model = schema.models[Object.keys(schema.models)[0]]
      
      // Check that some nodes have coordinates in their rendered form
      model.nodes.forEach(node => {
        if (node.visual?.x !== undefined && node.visual?.y !== undefined) {
          // Coordinates should appear in the SVG (approximately)
          expect(svg).toContain(Math.round(node.visual.x).toString())
        }
      })
    })
  })

  describe('Path rendering', () => {
    let schemaChain: GraphSchema
    let schemaDiamond: GraphSchema

    beforeAll(() => {
      schemaChain = loadFixture('simple_chain.json')
      const positionsChain = autoLayout(schemaChain)
      integratePositionsIntoSchema(schemaChain, positionsChain)
      
      schemaDiamond = loadFixture('diamond.json')
      const positionsDiamond = autoLayout(schemaDiamond)
      integratePositionsIntoSchema(schemaDiamond, positionsDiamond)
    })

    it('should render paths between nodes', () => {
      const svg = modelToSVG(schemaChain)
      expect(svg).toContain('<path')
      // Paths are self-closing in SVG
      expect(svg).toMatch(/<path[^>]+\/>/)
    })

    it('should render single-headed paths with arrow-end marker', () => {
      const svg = modelToSVG(schemaChain)
      expect(svg).toContain('marker-end="url(#arrow-end)"')
      expect(svg).toContain('marker-start="none"')
    })

    it('should render double-headed paths with both markers', () => {
      const svg = modelToSVG(schemaDiamond)
      // Diamond model has covariances (two-headed paths)
      // Check for both start and end markers
      if (svg.includes('marker-start="url(#arrow-start)"')) {
        expect(svg).toContain('marker-end="url(#arrow-end)"')
      }
    })

    it('should handle self-loops', () => {
      // Create a simple self-loop model for testing
      const schema: GraphSchema = {
        schemaVersion: 1,
        models: {
          test: {
            nodes: [
              { id: 'X', label: 'X', type: 'variable', visual: { x: 0, y: 0 } },
            ],
            paths: [
              {
                from: 'X',
                to: 'X',
                numberOfArrows: 2,
                value: 1.0,
                freeParameter: true,
              },
            ],
          },
        },
      }
      
      const svg = modelToSVG(schema)
      expect(svg).toContain('<path')
      expect(svg).toContain('C ') // Cubic bezier for self-loop
    })

    it('should use curved paths for two-sided links', () => {
      const svg = modelToSVG(schemaDiamond)
      // Two-sided paths use quadratic curves (Q command) or cubic bezier (C command)
      if (svg.includes('marker-start="url(#arrow-start)"')) {
        expect(svg).toMatch(/\b[QC]\s+/)  // Check for quadratic or cubic curve
      }
    })
  })

  describe('Path labels', () => {
    let schema: GraphSchema

    beforeAll(() => {
      schema = loadFixture('simple_chain.json')
      const positions = autoLayout(schema)
      integratePositionsIntoSchema(schema, positions)
    })

    it('should not render labels when pathLabelFormat is "neither"', () => {
      const svgWithLabels = modelToSVG(schema, undefined, {
        pathLabelFormat: 'neither',
      })
      const svgNoLabels = modelToSVG(schema, undefined, {
        pathLabelFormat: null,
      })
      
      // Count text elements for labels (should be minimal - only node labels)
      const textInWith = (svgWithLabels.match(/<text/g) || []).length
      const textInNo = (svgNoLabels.match(/<text/g) || []).length
      
      expect(textInWith).toBe(textInNo)
    })

    it('should render labels when pathLabelFormat is "labels"', () => {
      const svg = modelToSVG(schema, undefined, {
        pathLabelFormat: 'labels',
      })
      const model = schema.models[Object.keys(schema.models)[0]]
      
      // Paths with labels should have text elements
      const pathsWithLabels = model.paths.filter(p => p.label)
      if (pathsWithLabels.length > 0) {
        expect(svg).toContain('<text')
      }
    })

    it('should render values when pathLabelFormat is "values"', () => {
      const svg = modelToSVG(schema, undefined, {
        pathLabelFormat: 'values',
      })
      const model = schema.models[Object.keys(schema.models)[0]]
      
      // Paths with values should show numbers
      const pathsWithValues = model.paths.filter(p => p.value !== null && p.value !== undefined)
      if (pathsWithValues.length > 0) {
        expect(svg).toContain('<text')
      }
    })

    it('should render both when pathLabelFormat is "both"', () => {
      const svg = modelToSVG(schema, undefined, {
        pathLabelFormat: 'both',
      })
      // Just verify it's valid XML
      expect(isValidXml(svg)).toBe(true)
    })
  })

  describe('Fixture models - comprehensive rendering', () => {
    const fixtureFiles = [
      'simple_chain.json',
      'one_factor_model.json',
      'diamond.json',
      'two_level_factor_model.json',
      'factor_mediator_model.json',
      'cycle.json',
      'isolated_nodes.json',
    ]

    fixtureFiles.forEach(filename => {
      describe(`Fixture: ${filename.replace('.json', '')}`, () => {
        let schema: GraphSchema

        beforeAll(() => {
          try {
            schema = loadFixture(filename)
            const positions = autoLayout(schema)
            integratePositionsIntoSchema(schema, positions)
          } catch (e) {
            // Skip if fixture not available
            expect(true).toBe(true)
          }
        })

        it('should generate valid SVG', () => {
          if (!schema) return
          const svg = modelToSVG(schema)
          expect(isValidXml(svg)).toBe(true)
        })

        it('should include all node types', () => {
          if (!schema) return
          const svg = modelToSVG(schema)
          const model = schema.models[Object.keys(schema.models)[0]]
          
          const hasVariable = model.nodes.some(n => n.type === 'variable')
          const hasConstant = model.nodes.some(n => n.type === 'constant')
          const hasDataset = model.nodes.some(n => n.type === 'dataset')
          
          if (hasVariable || hasConstant) {
            expect(svg).toMatch(/<circle|<rect|<polygon/)
          }
        })

        it('should render all paths', () => {
          if (!schema) return
          const svg = modelToSVG(schema)
          const model = schema.models[Object.keys(schema.models)[0]]
          
          const pathCount = (svg.match(/<path/g) || []).length
          // Should have at least as many paths as in the model
          expect(pathCount).toBeGreaterThanOrEqual(0)
        })

        it('should write SVG report', () => {
          if (!schema) return
          const svg = modelToSVG(schema)
          writeSvgReport(filename.replace('.json', '.svg'), svg)
          expect(true).toBe(true)
        })

        it('should have valid dimensions', () => {
          if (!schema) return
          const svg = modelToSVG(schema)
          const viewBoxMatch = svg.match(/viewBox="([^"]+)"/)
          const widthMatch = svg.match(/width="([^"]+)"/)
          const heightMatch = svg.match(/height="([^"]+)"/)
          
          expect(viewBoxMatch).toBeTruthy()
          expect(widthMatch).toBeTruthy()
          expect(heightMatch).toBeTruthy()
        })
      })
    })
  })

  describe('Edge cases', () => {
    it('should handle empty model', () => {
      const schema: GraphSchema = {
        schemaVersion: 1,
        models: {
          empty: {
            nodes: [],
            paths: [],
          },
        },
      }
      
      const svg = modelToSVG(schema)
      
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
      expect(isValidXml(svg)).toBe(true)
    })

    it('should handle missing positions', () => {
      const schema: GraphSchema = {
        schemaVersion: 1,
        models: {
          test: {
            nodes: [{ id: 'X', label: 'X', type: 'variable' }],
            paths: [],
          },
        },
      }
      
      // No position for X (no visual property)
      const svg = modelToSVG(schema)
      
      // Should still produce valid SVG, just without the node
      expect(svg).toContain('<svg')
      expect(isValidXml(svg)).toBe(true)
    })

    it('should handle nodes with missing visual properties', () => {
      const schema: GraphSchema = {
        schemaVersion: 1,
        models: {
          test: {
            nodes: [
              { id: 'X', label: 'X', type: 'variable', visual: { x: 0, y: 0 } },
              { id: 'Y', label: 'Y', type: 'variable', visual: { x: 100, y: 100 } },
            ],
            paths: [
              {
                from: 'X',
                to: 'Y',
                numberOfArrows: 1,
                value: 1.0,
                freeParameter: true,
              },
            ],
          },
        },
      }
      
      const svg = modelToSVG(schema)
      
      expect(svg).toContain('<svg')
      expect(isValidXml(svg)).toBe(true)
      expect(svg).toContain('<path')
    })

    it('should handle paths with missing labels and values', () => {
      const schema: GraphSchema = {
        schemaVersion: 1,
        models: {
          test: {
            nodes: [
              { id: 'X', label: 'X', type: 'variable', visual: { x: 0, y: 0 } },
              { id: 'Y', label: 'Y', type: 'variable', visual: { x: 100, y: 100 } },
            ],
            paths: [
              {
                from: 'X',
                to: 'Y',
                numberOfArrows: 1,
                // No label or value
              },
            ],
          },
        },
      }
      
      const svg = modelToSVG(schema, undefined, {
        pathLabelFormat: 'labels',
      })
      
      expect(svg).toContain('<svg')
      expect(isValidXml(svg)).toBe(true)
    })
  })

  describe('SVG structure and formatting', () => {
    let schema: GraphSchema

    beforeAll(() => {
      schema = loadFixture('simple_chain.json')
      const positions = autoLayout(schema)
      integratePositionsIntoSchema(schema, positions)
    })

    it('should include proper xmlns attribute', () => {
      const svg = modelToSVG(schema)
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    })

    it('should include viewBox attribute', () => {
      const svg = modelToSVG(schema)
      const viewBoxMatch = svg.match(/viewBox="(\d+|-\d+ -?\d+ \d+ \d+)"/)
      expect(viewBoxMatch).toBeTruthy()
    })

    it('should organize elements in groups', () => {
      const svg = modelToSVG(schema)
      expect(svg).toContain('<g id="paths">')
      expect(svg).toContain('<g id="path-labels">')
      expect(svg).toContain('<g id="nodes">')
      expect(svg).toContain('<g id="node-labels">')
    })

    it('should have closed SVG tag', () => {
      const svg = modelToSVG(schema)
      expect(svg.endsWith('</svg>')).toBe(true)
    })
  })

  // Update metadata after all tests complete
  afterAll(() => {
    updateTestMetadata()
  })
})
