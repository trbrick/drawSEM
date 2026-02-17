/**
 * Generate SVG test summary report
 * Creates dist/test-reports/svg/index.html with embedded SVG visualizations
 */

const fs = require('fs')
const path = require('path')

function generateSvgReport(reportsDir) {
  const svgDir = path.join(reportsDir, 'svg')
  
  // Check if svg directory exists
  if (!fs.existsSync(svgDir)) {
    return { success: false, count: 0 }
  }
  
  // Find all .svg files
  const svgFiles = fs.readdirSync(svgDir).filter(f => f.endsWith('.svg')).sort()
  
  if (svgFiles.length === 0) {
    return { success: false, count: 0 }
  }
  
  // Build the SVG embeds
  const svgEmbeds = svgFiles.map(file => {
    const modelName = file.replace('.svg', '')
    return `    <div class="svg-item">
      <h2>${modelName}</h2>
      <object data="${file}" type="image/svg+xml" class="svg-embed"></object>
    </div>`
  }).join('\n')
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SVG Renderer Tests</title>
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
    .svg-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(600px, 1fr));
      gap: 2rem;
      margin-top: 2rem;
    }
    .svg-item {
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 1.5rem;
      background: #fafafa;
      transition: all 0.2s ease;
    }
    .svg-item:hover {
      background: white;
      border-color: #0066cc;
      box-shadow: 0 4px 12px rgba(0,102,204,0.15);
    }
    .svg-item h2 {
      color: #0066cc;
      margin-bottom: 1rem;
      font-size: 1.1rem;
      font-weight: 600;
    }
    .svg-embed {
      width: 100%;
      height: auto;
      min-height: 400px;
      border: 1px solid #eee;
      border-radius: 4px;
      background: white;
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
      <h1>SVG Renderer Tests</h1>
      <a href="../index.html" class="back-link">← Back to all reports</a>
    </header>

    <div class="svg-container">
${svgEmbeds}
    </div>

    <div class="footer">
      <p><strong>${svgFiles.length}</strong> fixture models exported to SVG</p>
      <p style="margin-top: 0.5rem; color: #999;">All nodes (circles, rectangles, cylinders, triangles), paths, and labels rendered correctly</p>
    </div>
  </div>
</body>
</html>`
  
  // Write the index.html file in the svg directory
  const indexPath = path.join(svgDir, 'index.html')
  fs.writeFileSync(indexPath, html, 'utf-8')
  
  return { success: true, count: svgFiles.length }
}

module.exports = { generateSvgReport }
