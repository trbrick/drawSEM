/**
 * Generate layout test summary report with iframe embeds
 * Creates dist/test-reports/layout/index.html with embedded layout visualizations
 */

const fs = require('fs')
const path = require('path')

function generateLayoutReport(reportsDir) {
  const layoutDir = path.join(reportsDir, 'layout')
  
  // Check if layout directory exists
  if (!fs.existsSync(layoutDir)) {
    return { success: false, count: 0 }
  }
  
  // Find all .html files except index.html
  const allFiles = fs.readdirSync(layoutDir).filter(f => f.endsWith('.html'))
  const layoutFiles = allFiles.filter(f => f !== 'index.html').sort()
  
  if (layoutFiles.length === 0) {
    return { success: false, count: 0 }
  }
  
  // Generate HTML with iframes for each layout
  const iframesHtml = layoutFiles.map(file => {
    const title = file.replace('.html', '').replace(/_/g, ' ')
    return `    <div class="layout-item">
      <h2><a href="${file}" class="item-link">${title}</a></h2>
      <iframe src="${file}#visualization" class="layout-iframe" title="${title} layout visualization"></iframe>
    </div>`
  }).join('\n')
  
  const html = `<!DOCTYPE html>
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
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 2rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      border-bottom: 2px solid #eee;
      padding-bottom: 1rem;
    }
    h1 {
      color: #333;
      font-size: 2rem;
    }
    .back-link {
      color: #0066cc;
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 500;
    }
    .back-link:hover {
      text-decoration: underline;
    }
    .content {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(600px, 1fr));
      gap: 2rem;
      margin-top: 2rem;
    }
    .layout-item {
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 1.5rem;
      background: #fafafa;
      transition: all 0.2s ease;
    }
    .layout-item:hover {
      background: white;
      border-color: #0066cc;
      box-shadow: 0 4px 12px rgba(0,102,204,0.15);
    }
    .layout-item h2 {
      color: #0066cc;
      margin-bottom: 1rem;
      font-size: 1.1rem;
      font-weight: 600;
    }
    .item-link {
      color: #0066cc;
      text-decoration: none;
    }
    .item-link:hover {
      text-decoration: underline;
    }
    .layout-iframe {
      width: 100%;
      height: 400px;
      border: 1px solid #eee;
      border-radius: 4px;
    }
    .footer {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #eee;
      color: #666;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>RAMPath Layout Tests</h1>
      <a href="../index.html" class="back-link">← Back to all reports</a>
    </header>

    <div class="content">
${iframesHtml}
    </div>

    <div class="footer">
      <p><strong>${layoutFiles.length}</strong> layout test ${layoutFiles.length === 1 ? 'model' : 'models'} rendered</p>
      <p style="margin-top: 0.5rem; color: #999;">Each frame shows the node positions and path routing computed by the RAMPath algorithm</p>
    </div>
  </div>
</body>
</html>`

  // Write the index.html file in the layout directory
  const indexPath = path.join(layoutDir, 'index.html')
  fs.writeFileSync(indexPath, html, 'utf-8')
  
  return { success: true, count: layoutFiles.length }
}

module.exports = { generateLayoutReport }
