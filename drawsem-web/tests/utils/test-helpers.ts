import * as fs from 'fs';
import * as path from 'path';

// Load a fixture file
export function loadFixture(filePath: string) {
  const fullPath = path.join(__dirname, '../fixtures', filePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content);
}

// Load all fixtures from a directory
export function loadFixturesFromDir(dirPath: string) {
  const fullPath = path.join(__dirname, '../fixtures', dirPath);
  const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.json'));
  return files.map(file => ({
    name: file.replace('.json', ''),
    data: loadFixture(path.join(dirPath, file).replace(/\\/g, '/')),
  }));
}

/**
 * Structural diff of two JSON-like values. Returns the list of paths (e.g.
 * `models.m.nodes[0].visual.x`) at which they differ; an empty list means deep
 * equal. Keys whose value is `undefined` are treated as absent (JSON semantics).
 */
export function deepDiff(a: unknown, b: unknown, path = ''): string[] {
  if (Object.is(a, b)) return []
  const isObj = (v: unknown) => typeof v === 'object' && v !== null
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) return [path || '(root)']
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    const out: string[] = []
    const n = Math.max(a.length, bb.length)
    for (let i = 0; i < n; i++) {
      if (i >= a.length || i >= bb.length) out.push(`${path}[${i}]`)
      else out.push(...deepDiff(a[i], bb[i], `${path}[${i}]`))
    }
    return out
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)].filter((k) => ao[k] !== undefined || bo[k] !== undefined))
  const out: string[] = []
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k
    if (ao[k] === undefined || bo[k] === undefined) out.push(p)
    else out.push(...deepDiff(ao[k], bo[k], p))
  }
  return out
}
