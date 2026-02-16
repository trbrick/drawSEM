/**
 * Generate layout test reports for visual validation
 * Run: npm run test:reports
 */

const fs = require('fs')
const path = require('path')

// Import the functions we need
const autoLayout = require('../dist/standalone/index.js')?.autoLayout || (() => { throw new Error('Build first: npm run build') })()

const FIXTURES_DIR = path.join(__dirname, '../tests/fixtures/models/layout')
const LAYOUTS_DIR = path.join(__dirname, '../tests/fixtures/layouts')
const REPORTS_DIR = path.join(__dirname, '../dist/test-reports')

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
}

// List of test fixtures
const fixtures = [
  'simple_chain.json',
  'one_factor_model.json',
  'two_level_factor_model.json',
  'diamond.json',
  'cycle.json',
  'isolated_nodes.json',
  'factor_mediator_model.json'
]

// Generate reports data
const reports = []

fixtures.forEach(filename => {
  const modelName = filename.replace('.json', '')
  const modelPath = path.join(FIXTURES_DIR, filename)
  const layoutPath = path.join(LAYOUTS_DIR, `${modelName}.expected.json`)

  if (!fs.existsSync(modelPath) || !fs.existsSync(layoutPath)) {
    console.warn(`⚠️  Missing files for ${modelName}`)
    return
  }

  try {
    const model = JSON.parse(fs.readFileSync(modelPath, 'utf-8'))
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf-8'))

    // For now, just record that the fixture exists
    // Full HTML generation requires running through the algorithm
    reports.push({
      name: modelName,
      file: `${modelName}.html`,
      model: model.meta?.title || modelName,
      description: model.meta?.description || 'Test model',
      status: fs.existsSync(path.join(REPORTS_DIR, `${modelName}.html`)) ? '✓' : '○'
    })
  } catch (e) {
    console.warn(`⚠️  Error processing ${modelName}:`, e.message)
  }
})

// Generate index.html
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Layout Test Reports</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 2rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 2rem;
    }
    h1 {
      color: #333;
      margin-bottom: 0.5rem;
      font-size: 2rem;
    }
    .subtitle {
      color: #666;
      margin-bottom: 2rem;
      font-size: 0.95rem;
    }
    .reports-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-top: 2rem;
    }
    .report-card {
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 1.5rem;
      background: #fafafa;
      transition: all 0.2s ease;
      text-decoration: none;
      color: inherit;
      display: block;
    }
    .report-card:hover {
      background: white;
      border-color: #0066cc;
      box-shadow: 0 4px 12px rgba(0,102,204,0.15);
      transform: translateY(-2px);
    }
    .report-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: #0066cc;
      margin-bottom: 0.5rem;
    }
    .report-desc {
      font-size: 0.9rem;
      color: #666;
      margin-bottom: 1rem;
      line-height: 1.4;
    }
    .report-status {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .status-generated {
      background: #d4edda;
      color: #155724;
    }
    .status-pending {
      background: #fff3cd;
      color: #856404;
    }
    .info {
      background: #e7f3ff;
      border-left: 4px solid #0066cc;
      padding: 1rem;
      margin-bottom: 2rem;
      border-radius: 4px;
      font-size: 0.9rem;
      color: #004085;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>RAMPath Layout Test Reports</h1>
    <p class="subtitle">Visual validation of automatic path diagram layouts</p>

    <div class="info">
      <strong>ℹ️ Generated reports:</strong> Reports are created when running the test suite.
      Each report shows the node positions, ranks, and layout details.
      Open a report to visually inspect the layout results.
    </div>

    <div class="reports-grid">
${reports.map(report => `      <a href="${report.file}" class="report-card">
        <div class="report-title">${report.name}</div>
        <div class="report-desc">${report.model}</div>
        <p style="font-size: 0.85rem; color: #888; margin-bottom: 0.75rem;">${report.description}</p>
        <span class="report-status ${report.status === '✓' ? 'status-generated' : 'status-pending'}">
          ${report.status === '✓' ? '✓ Generated' : '○ Pending'}
        </span>
      </a>`).join('\n')}
    </div>

    <div style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid #eee; color: #666; font-size: 0.9rem;">
      <p><strong>To regenerate reports:</strong> Run <code style="background: #f0f0f0; padding: 0.2rem 0.5rem; border-radius: 3px;">npm run test</code></p>
      <p style="margin-top: 0.5rem;">Last updated: ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>`

fs.writeFileSync(path.join(REPORTS_DIR, 'index.html'), indexHtml, 'utf-8')
console.log(`✓ Generated index at dist/test-reports/index.html`)
console.log(`✓ Ready to view reports:`)
console.log(`  - Open: dist/test-reports/index.html`)
console.log(`  - Or run: npm run preview`)
