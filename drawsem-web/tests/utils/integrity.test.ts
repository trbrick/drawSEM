import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeMD5 } from '../../src/utils/integrity'

describe('computeMD5', () => {
  it('returns known MD5 for a simple string', async () => {
    await expect(computeMD5('hello')).resolves.toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('returns known MD5 for bundled sample CSV content', async () => {
    const sampleCsv = readFileSync(join(__dirname, '../../examples/sample.csv'), 'utf-8')

    await expect(computeMD5(sampleCsv)).resolves.toBe('c485b2427a903bc4796012df9226b479')
  })
})
