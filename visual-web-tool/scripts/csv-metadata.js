#!/usr/bin/env node
// Stream a CSV file and compute per-column metadata (headers, counts, numeric stats)
// Usage: node scripts/csv-metadata.js path/to/data.csv
// Outputs JSON to stdout.

const fs = require('fs')
const path = require('path')
const parse = require('csv-parse')

function makeStat() {
  return {
    name: null,
    count: 0,
    missing: 0,
    numericCount: 0,
    sum: 0,
    mean: 0,
    m2: 0,
    min: Infinity,
    max: -Infinity,
    distinctSet: new Set(),
    distinctLimited: false,
    distinctLimit: 10000
  }
}

function finalizeStat(s) {
  const out = {
    name: s.name,
    count: s.count,
    missing: s.missing
  }
  if (s.numericCount > 0) {
    const variance = s.numericCount > 1 ? s.m2 / (s.numericCount - 1) : 0
    out.numericCount = s.numericCount
    out.mean = s.mean
    out.std = Math.sqrt(variance)
    out.min = s.min === Infinity ? null : s.min
    out.max = s.max === -Infinity ? null : s.max
  }
  // distinct cardinality (may be limited)
  out.distinct = s.distinctLimited ? { approx: s.distinctSize } : { exact: s.distinctSize }
  return out
}

async function processFile(filePath) {
  return new Promise((resolve, reject) => {
    const instream = fs.createReadStream(filePath)
    const parser = parse({ relax_quotes: true, skip_empty_lines: true })

    let headers = null
    let stats = []

    parser.on('readable', () => {
      let record
      while ((record = parser.read()) !== null) {
        if (!headers) {
          headers = record.map((h, i) => (h == null || String(h).trim() === '' ? `V${i + 1}` : String(h)))
          stats = headers.map((h) => {
            const s = makeStat()
            s.name = h
            return s
          })
          continue
        }

        // process data row
        for (let i = 0; i < headers.length; i++) {
          const s = stats[i]
          const raw = record[i]
          s.count += 1
          const v = raw == null ? '' : String(raw).trim()
          if (v === '') {
            s.missing += 1
            continue
          }
          // track distinct up to limit
          if (!s.distinctLimited) {
            s.distinctSet.add(v)
            if (s.distinctSet.size > s.distinctLimit) {
              s.distinctLimited = true
              s.distinctSize = s.distinctSet.size
              s.distinctSet = null
            }
          } else {
            s.distinctSize = (s.distinctSize || 0) + 1
          }

          // numeric check
          const vnum = Number(v)
          if (!Number.isNaN(vnum) && v.trim() !== '') {
            s.numericCount += 1
            // Welford for mean/std
            const delta = vnum - s.mean
            s.mean += delta / s.numericCount
            const delta2 = vnum - s.mean
            s.m2 += delta * delta2
            s.sum += vnum
            if (vnum < s.min) s.min = vnum
            if (vnum > s.max) s.max = vnum
          }
        }
      }
    })

    parser.on('error', (err) => reject(err))

    parser.on('end', () => {
      // finalize
      const out = stats.map((s) => {
        if (s.distinctSet) s.distinctSize = s.distinctSet.size
        return finalizeStat(s)
      })
      resolve({ headers, columns: out })
    })

    instream.pipe(parser)
  })
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: node scripts/csv-metadata.js path/to/data.csv')
    process.exit(2)
  }
  const p = path.resolve(arg)
  if (!fs.existsSync(p)) {
    console.error('File not found:', p)
    process.exit(2)
  }
  try {
    const res = await processFile(p)
    console.log(JSON.stringify(res, null, 2))
  } catch (e) {
    console.error('Error processing CSV:', e && e.message ? e.message : e)
    process.exit(3)
  }
}

if (require.main === module) main()
