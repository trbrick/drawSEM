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
