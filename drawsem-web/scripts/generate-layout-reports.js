/**
 * Generate comprehensive test reports for visual validation
 * Run: npm run test:report
 *
 * This script scans test artifacts and generates human-readable HTML summaries.
 * Reports are generated AFTER tests have run, so ensure you've run 'npm run test' first.
 */

const path = require('path')
const fs = require('fs')

// Import report generators
const { generateLayoutReport } = require('./report-generators/layoutReportGenerator')
const { generateSvgReport } = require('./report-generators/svgReportGenerator')
const { generateIndexReport } = require('./report-generators/indexReportGenerator')

const REPORTS_DIR = path.join(__dirname, '../dist/test-reports')
const LAYOUT_DIR = path.join(REPORTS_DIR, 'layout')
const SVG_DIR = path.join(REPORTS_DIR, 'svg')

// Ensure all report directories exist
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
}
if (!fs.existsSync(LAYOUT_DIR)) {
  fs.mkdirSync(LAYOUT_DIR, { recursive: true })
}
if (!fs.existsSync(SVG_DIR)) {
  fs.mkdirSync(SVG_DIR, { recursive: true })
}

console.log('\n🔍 Scanning test artifacts...\n')

// Generate layout reports
const layoutResult = generateLayoutReport(REPORTS_DIR)

// Generate SVG reports
const svgResult = generateSvgReport(REPORTS_DIR)

// Generate main index
const indexResult = generateIndexReport(REPORTS_DIR, {
  layout: layoutResult,
  svg: svgResult
})

// Summary
console.log('\n📊 Report Generation Summary')
console.log('═'.repeat(50))
console.log(`Layout reports: ${layoutResult.success ? '✓' : '✗'} (${layoutResult.count} fixtures)`)
console.log(`SVG reports:    ${svgResult.success ? '✓' : '✗'} (${svgResult.count} fixtures)`)
console.log(`Main index:     ${indexResult ? '✓' : '✗'}`)
console.log('═'.repeat(50))

if (layoutResult.success || svgResult.success) {
  console.log('\n✓ Reports ready at:')
  console.log('  dist/test-reports/index.html')
  console.log('\n💡 Tip: Open the index.html file in a browser to view all reports')
} else {
  console.log('\n⚠️  No test artifacts found!')
  console.log('   Run: npm run test')
  console.log('   Then: npm run test:report')
  process.exit(1)
}
