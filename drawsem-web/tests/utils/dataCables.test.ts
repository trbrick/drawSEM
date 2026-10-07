import { describe, it, expect } from 'vitest'
import { modelToSVG } from '../../src/utils/svgRenderer'
import { exportModelToSVG } from '../../src/main-widget'
import { CABLE_COLOR } from '../../src/utils/dataCables'
import type { GraphSchema } from '../../src/core/types'

// Image export draws data paths as data cables, like the canvas, and lays out
// positionless models with the editor's layout (layoutModel).

function model(positioned: boolean): GraphSchema {
  const pos = (x: number, y: number) => (positioned ? { visual: { x, y } } : {})
  return {
    schemaVersion: 0,
    models: {
      m: {
        nodes: [
          { label: 'F', type: 'variable', ...pos(100, 0) },
          { label: 'x1', type: 'variable', ...pos(0, 150) },
          { label: 'x2', type: 'variable', ...pos(200, 150) },
          { label: '1', type: 'constant', ...pos(100, 300) },
          { label: 'data', type: 'dataset', ...pos(100, 400) },
        ],
        paths: [
          { from: 'F', to: 'x1', numberOfArrows: 1 },
          { from: 'F', to: 'x2', numberOfArrows: 1 },
          { from: '1', to: 'x1', numberOfArrows: 1 },
          { from: 'data', to: 'x1', type: 'data', label: 'x1' },
          { from: 'data', to: 'x2', type: 'data', label: 'x2' },
        ],
      },
    },
  } as GraphSchema
}

const pathEls = (svg: string) => svg.match(/<path [^>]*\/>/g) ?? []

describe('image export draws data cables', () => {
  it('one trunk per dataset plus a branch per data path, without arrowheads', () => {
    const svg = modelToSVG(model(true), 'm', { pathLabelFormat: 'labels' })
    const cables = pathEls(svg).filter((p) => p.includes(`stroke="${CABLE_COLOR}"`))
    expect(cables).toHaveLength(3) // trunk + 2 branches
    cables.forEach((c) => expect(c).not.toContain('marker'))
    const others = pathEls(svg).filter((p) => !p.includes(`stroke="${CABLE_COLOR}"`) && p.includes('marker-end'))
    expect(others).toHaveLength(3) // F->x1, F->x2, 1->x1
    expect(svg).toContain('>x1<')    // data path labels still drawn
  })

  it('hidden datasets hide their cables', () => {
    const svg = modelToSVG(model(true), 'm', { showDatasetNodes: false })
    expect(pathEls(svg).filter((p) => p.includes(`stroke="${CABLE_COLOR}"`))).toHaveLength(0)
  })
})

describe('image export lays out a positionless model like the editor', () => {
  it('places every node, with the dataset to the side', () => {
    const svg = exportModelToSVG(model(false), 'm')
    // every node is drawn (constants and datasets were left unplaced before)
    expect(svg).toContain('>1<')
    expect(svg).toContain('>data<')
    expect(pathEls(svg).filter((p) => p.includes(`stroke="${CABLE_COLOR}"`))).toHaveLength(3)
  })

  it('does not move nodes that already have positions', () => {
    const doc = model(true)
    ;(doc.models.m.nodes[1] as any).visual = undefined // x1 unplaced
    const svg = exportModelToSVG(doc, 'm')
    // F keeps its position: its label is drawn at x=100
    expect(svg).toMatch(/<text x="100" y="5"[^>]*>F</)
  })
})
