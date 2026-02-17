/**
 * Generate index.html landing page linking to all test reports
 */

const path = require('path')
const { writeFile, getLastTestTimestamp, getTestMetadata, formatDate } = require('./reportUtils')

function generateIndexReport(reportsDir, reports) {
  const lastTestTime = getLastTestTimestamp(reportsDir)
  const metadata = getTestMetadata(reportsDir)
  
  // Build report cards
  let reportCards = ''
  
  if (reports.layout.success) {
    reportCards += `    <a href="layout/index.html" class="report-card">
      <div class="card-header layout-header">
        <div class="card-icon">📐</div>
        <h3>Layout Tests</h3>
      </div>
      <p class="card-desc">RAMPath algorithm position calculations</p>
      <div class="card-meta">
        <span class="badge">${reports.layout.count} fixture models</span>
        <span class="badge">31 test cases</span>
      </div>
      <div class="card-link">View layout reports →</div>
    </a>\n`
  } else {
    reportCards += `    <div class="report-card disabled">
      <div class="card-header layout-header">
        <div class="card-icon">📐</div>
        <h3>Layout Tests</h3>
      </div>
      <p class="card-desc">RAMPath algorithm position calculations</p>
      <div class="card-meta"><span class="badge warning">No artifacts found</span></div>
      <div class="card-note">Run: npm run test</div>
    </div>\n`
  }
  
  if (reports.svg.success) {
    reportCards += `    <a href="svg/index.html" class="report-card">
      <div class="card-header svg-header">
        <div class="card-icon">🎨</div>
        <h3>SVG Tests</h3>
      </div>
      <p class="card-desc">Graph model export to SVG strings</p>
      <div class="card-meta">
        <span class="badge">${reports.svg.count} fixture models</span>
        <span class="badge">68 test cases</span>
      </div>
      <div class="card-link">View SVG reports →</div>
    </a>`
  } else {
    reportCards += `    <div class="report-card disabled">
      <div class="card-header svg-header">
        <div class="card-icon">🎨</div>
        <h3>SVG Tests</h3>
      </div>
      <p class="card-desc">Graph model export to SVG strings</p>
      <div class="card-meta"><span class="badge warning">No artifacts found</span></div>
      <div class="card-note">Run: npm run test</div>
    </div>`
  }
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Reports</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      min-height: 100vh;
      padding: 3rem 2rem;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 3rem;
      color: white;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      font-weight: 700;
    }
    .subtitle {
      font-size: 1.1rem;
      opacity: 0.95;
      font-weight: 300;
      letter-spacing: 0.5px;
    }
    .reports-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 2rem;
      margin-bottom: 3rem;
    }
    .report-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 2rem;
      transition: all 0.3s ease;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      border: 2px solid transparent;
    }
    .report-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      border-color: #0066cc;
    }
    .report-card.disabled {
      opacity: 0.7;
      pointer-events: none;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .card-icon {
      font-size: 2.5rem;
    }
    .card-header h3 {
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0;
    }
    .layout-header {
      color: #0066cc;
    }
    .svg-header {
      color: #9c27b0;
    }
    .card-desc {
      color: #666;
      margin-bottom: 1.5rem;
      line-height: 1.5;
      flex-grow: 1;
    }
    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .badge {
      display: inline-block;
      background: #f0f0f0;
      color: #333;
      padding: 0.4rem 0.8rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .badge.warning {
      background: #fff3cd;
      color: #856404;
    }
    .card-link {
      color: #0066cc;
      font-weight: 600;
      font-size: 0.95rem;
    }
    .card-note {
      color: #999;
      font-size: 0.9rem;
      font-style: italic;
    }
    .info-box {
      background: white;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 3rem;
    }
    .info-box h3 {
      color: #333;
      margin-bottom: 1rem;
      font-size: 1.1rem;
    }
    .info-box p {
      color: #666;
      line-height: 1.6;
      margin-bottom: 0.5rem;
    }
    .info-box code {
      background: #f5f5f5;
      padding: 0.2rem 0.5rem;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9rem;
    }
    .footer {
      text-align: center;
      color: white;
      padding: 2rem;
      font-size: 0.9rem;
    }
    .footer p {
      margin: 0.5rem 0;
    }
    .timestamp {
      color: rgba(255,255,255,0.9);
      font-size: 0.85rem;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Test Reports</h1>
      <p class="subtitle">OpenMx WebUI visualization test suite</p>
    </div>

    <div class="info-box">
      <h3>Welcome</h3>
      <p>This page displays visual test reports for the graph model visualization and export system.</p>
      <p>Run <code>npm run test</code> to execute the test suite and generate artifacts, then <code>npm run test:report</code> to create these summary pages.</p>
    </div>

    <div class="reports-grid">
${reportCards}
    </div>

    <div class="info-box">
      <h3>Workflow</h3>
      <p><strong>Step 1:</strong> Run tests → <code>npm run test</code></p>
      <p><strong>Step 2:</strong> Generate reports → <code>npm run test:report</code></p>
      <p><strong>Step 3:</strong> View reports in a browser</p>
    </div>

    <div class="footer">
      <p><strong>Test execution times:</strong></p>
      <ul style="margin: 0.5rem 0 0 1.5rem;">
        <li>Layout tests: ${metadata && metadata.layoutTestsRunAt ? new Date(metadata.layoutTestsRunAt).toLocaleString() : 'Not run'}</li>
        <li>SVG tests: ${metadata && metadata.svgTestsRunAt ? new Date(metadata.svgTestsRunAt).toLocaleString() : 'Not run'}</li>
      </ul>
      <div class="timestamp">
        <p style="margin-top: 1rem;">All times in your local timezone</p>
      </div>
    </div>
  </div>
</body>
</html>`
  
  const outputPath = path.join(reportsDir, 'index.html')
  const success = writeFile(outputPath, html)
  
  if (success) {
    console.log(`✓ Generated main index.html`)
  }
  
  return success
}

module.exports = { generateIndexReport }
