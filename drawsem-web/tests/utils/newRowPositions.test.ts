import { describe, it, expect } from 'vitest'
import { newRowPositions } from '../../src/utils/helpers'

// "Add all as nodes" placement: one row, appended to the busiest manifest row,
// else centred in the view.
describe('newRowPositions', () => {
  const center = { x: 500, y: 300 }

  it('with no manifests, centres the row in the view', () => {
    expect(newRowPositions(3, [], [{ x: 0, y: 0 }], center, 100, 20)).toEqual([
      { x: 400, y: 300 }, { x: 500, y: 300 }, { x: 600, y: 300 },
    ])
  })

  it('appends to the row with the most manifests, past every node on it', () => {
    const manifests = [
      { x: 0, y: 200 }, { x: 100, y: 205 }, { x: 200, y: 198 },   // three at about y = 200
      { x: 0, y: 0 }, { x: 100, y: 0 },                           // two at y = 0
    ]
    const occupied = [...manifests, { x: 350, y: 201 }, { x: 900, y: 0 }]   // a latent on the busy row
    const pos = newRowPositions(2, manifests, occupied, center, 100, 20)
    expect(pos.map((p) => p.x)).toEqual([450, 550])
    for (const p of pos) expect(p.y).toBeCloseTo(201)
  })

  it('on a tie, uses the lower row', () => {
    const manifests = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 300 }, { x: 100, y: 300 }]
    expect(newRowPositions(1, manifests, manifests, center, 100, 20)).toEqual([{ x: 200, y: 300 }])
  })
})
