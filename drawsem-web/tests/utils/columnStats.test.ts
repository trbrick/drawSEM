import { describe, it, expect } from 'vitest'
import { summarizeColumns, makeColumnAccumulator, addColumnValue, finalizeColumn, DISTINCT_LIMIT, LEVELS_LIMIT } from '../../src/utils/columnStats'

describe('column summaries', () => {
  it('count every row, missing ones (null, empty, blank) separately, and summarize the numeric values', () => {
    const [a] = summarizeColumns([{ a: 1 }, { a: null }, { a: '3' }, { a: '  ' }, {}], ['a'])
    expect(a).toMatchObject({ name: 'a', count: 5, missing: 3, numericCount: 2, mean: 2, min: 1, max: 3, distinct: { exact: 2 } })
    expect(a.std).toBeCloseTo(Math.SQRT2)
  })

  it('give text columns no numeric statistics, and a single number no SD', () => {
    const [t, one] = summarizeColumns([{ t: 'u', one: 5 }, { t: 'v' }, { t: 'u' }], ['t', 'one'])
    expect(t).toMatchObject({ numericCount: 0, mean: null, std: null, min: null, max: null, distinct: { exact: 2 } })
    expect(one).toMatchObject({ numericCount: 1, mean: 5, std: null })
  })

  it('treat booleans and numeric text alike from JSON and CSV ("true" is not a number)', () => {
    const [fromJson] = summarizeColumns([{ b: true }, { b: false }], ['b'])
    const [fromCsv] = summarizeColumns([{ b: 'true' }, { b: 'false' }], ['b'])
    expect(fromJson).toEqual(fromCsv)
    expect(fromJson.numericCount).toBe(0)
  })

  it('count values: numeric ascending, otherwise in order of first appearance', () => {
    const [likert, lvl] = summarizeColumns(
      [{ l: 3, v: 'Low' }, { l: 1, v: 'High' }, { l: 2, v: 'Low' }, { l: 1, v: 'Medium' }],
      ['l', 'v']
    )
    expect(likert.levels).toEqual([{ value: '1', count: 2 }, { value: '2', count: 1 }, { value: '3', count: 1 }])
    expect(lvl.levels!.map((l) => l.value)).toEqual(['Low', 'High', 'Medium'])
  })

  it(`report value counts only up to ${LEVELS_LIMIT} distinct values`, () => {
    const rows = (k: number) => Array.from({ length: k }, (_, i) => ({ x: i }))
    expect(summarizeColumns(rows(LEVELS_LIMIT), ['x'])[0].levels).toHaveLength(LEVELS_LIMIT)
    const [many] = summarizeColumns(rows(LEVELS_LIMIT + 1), ['x'])
    expect(many.levels).toBeUndefined()
    expect(many.distinct).toEqual({ exact: LEVELS_LIMIT + 1 })
  })

  it(`stop tracking distinct values past ${DISTINCT_LIMIT}`, () => {
    const acc = makeColumnAccumulator('id')
    for (let i = 0; i <= DISTINCT_LIMIT + 5; i++) addColumnValue(acc, i)
    const s = finalizeColumn(acc)
    expect(s.distinct).toEqual({ atLeast: DISTINCT_LIMIT })
    expect(s.count).toBe(DISTINCT_LIMIT + 6)
    expect(s.max).toBe(DISTINCT_LIMIT + 5)
  })
})
