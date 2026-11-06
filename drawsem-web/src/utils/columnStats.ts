/**
 * Per-column summaries of a dataset, shown in the dataset details (popup and
 * the sidebar's Data pane). Display only: never part of the schema, and they
 * assume nothing about how a column is to be treated (continuous, ordinal,
 * ...), which the user assigns. One shape for every source: the file and
 * embedded loaders and the browser CSV import use the accumulator here; R's
 * `.columnSummary()` (R/shiny-app.R) computes the same fields for Shiny.
 */

/** Distinct values are tracked up to this many; beyond it only "at least". */
export const DISTINCT_LIMIT = 10000
/** Value counts (`levels`) are reported for columns with at most this many distinct values. */
export const LEVELS_LIMIT = 20

/**
 * Text that means "no value", as R reads it: `read.csv()`'s default
 * `na.strings`, and what `jsonToDataFrame()` (R/io.R) treats as NA. Empty
 * cells are missing too.
 */
export const MISSING_TOKENS: ReadonlySet<string> = new Set(['NA'])

export interface ColumnSummary {
  name: string
  /** Rows, missing ones included */
  count: number
  /** Rows with no value: null, empty after trimming, or "NA" (MISSING_TOKENS) */
  missing: number
  /** Values that read as numbers */
  numericCount: number
  /** Of the numeric values; null when there are none (std: fewer than two) */
  mean: number | null
  std: number | null
  min: number | null
  max: number | null
  distinct: { exact: number } | { atLeast: number }
  /**
   * Each distinct value and its count, when there are at most LEVELS_LIMIT:
   * ascending when every value is numeric, otherwise in order of first appearance.
   */
  levels?: { value: string; count: number }[]
}

export interface ColumnAccumulator {
  name: string
  count: number
  missing: number
  numericCount: number
  mean: number
  m2: number
  min: number
  max: number
  /** value -> count; null once more than DISTINCT_LIMIT distinct values were seen */
  values: Map<string, number> | null
}

export function makeColumnAccumulator(name: string): ColumnAccumulator {
  return { name, count: 0, missing: 0, numericCount: 0, mean: 0, m2: 0, min: Infinity, max: -Infinity, values: new Map() }
}

/** Add one cell (any raw value: string from a CSV, number/boolean/null from JSON). */
export function addColumnValue(acc: ColumnAccumulator, raw: unknown): void {
  acc.count += 1
  const v = raw == null ? '' : String(raw).trim()
  if (v === '' || MISSING_TOKENS.has(v)) {
    acc.missing += 1
    return
  }
  if (acc.values) {
    acc.values.set(v, (acc.values.get(v) ?? 0) + 1)
    if (acc.values.size > DISTINCT_LIMIT) acc.values = null
  }
  const num = Number(v)
  if (!Number.isNaN(num)) {
    // Welford
    acc.numericCount += 1
    const delta = num - acc.mean
    acc.mean += delta / acc.numericCount
    acc.m2 += delta * (num - acc.mean)
    if (num < acc.min) acc.min = num
    if (num > acc.max) acc.max = num
  }
}

export function finalizeColumn(acc: ColumnAccumulator): ColumnSummary {
  const n = acc.numericCount
  const out: ColumnSummary = {
    name: acc.name,
    count: acc.count,
    missing: acc.missing,
    numericCount: n,
    mean: n > 0 ? acc.mean : null,
    std: n > 1 ? Math.sqrt(acc.m2 / (n - 1)) : null,
    min: n > 0 ? acc.min : null,
    max: n > 0 ? acc.max : null,
    distinct: acc.values ? { exact: acc.values.size } : { atLeast: DISTINCT_LIMIT },
  }
  if (acc.values && acc.values.size > 0 && acc.values.size <= LEVELS_LIMIT) {
    const levels = Array.from(acc.values, ([value, count]) => ({ value, count }))
    if (levels.every((l) => !Number.isNaN(Number(l.value)))) levels.sort((a, b) => Number(a.value) - Number(b.value))
    out.levels = levels
  }
  return out
}

/** Summaries of `headers` over an array of row objects. */
export function summarizeColumns(rows: readonly Record<string, unknown>[], headers: readonly string[]): ColumnSummary[] {
  return headers.map((h) => {
    const acc = makeColumnAccumulator(h)
    for (const row of rows) addColumnValue(acc, row?.[h])
    return finalizeColumn(acc)
  })
}
