/**
 * Shared utilities for test report generation
 */

const fs = require('fs')
const path = require('path')

/**
 * Get the last modified timestamp from a directory of files
 */
function getDirectoryTimestamp(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return null
    const files = fs.readdirSync(dirPath)
    if (files.length === 0) return null
    
    const stats = files.map(f => {
      const fullPath = path.join(dirPath, f)
      return fs.statSync(fullPath).mtime
    })
    
    return new Date(Math.max(...stats.map(s => s.getTime())))
  } catch (e) {
    return null
  }
}

/**
 * Get the last test run timestamp from test-results.json if it exists
 */
function getLastTestTimestamp(reportsDir) {
  try {
    const resultsPath = path.join(reportsDir, 'test-results.json')
    if (!fs.existsSync(resultsPath)) return null
    
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'))
    return results.timestamp || null
  } catch (e) {
    return null
  }
}

/**
 * Get test metadata including layout and SVG test timestamps
 */
function getTestMetadata(reportsDir) {
  try {
    const metadataPath = path.join(reportsDir, 'test-metadata.json')
    if (!fs.existsSync(metadataPath)) return null
    
    return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
  } catch (e) {
    return null
  }
}

/**
 * Format a date for display
 */
function formatDate(date) {
  if (!date) return 'unknown'
  return date.toLocaleString()
}

/**
 * Generate HTML documentation badge
 */
function generateBadge(status, message) {
  const colors = {
    success: '#28a745',
    info: '#17a2b8',
    warning: '#ffc107',
    error: '#dc3545'
  }
  
  const color = colors[status] || colors.info
  
  return `<span style="display: inline-block; background: ${color}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 0.85rem; font-weight: 500;">${message}</span>`
}

/**
 * Scan a directory for files matching a pattern
 */
function scanDirectory(dirPath, pattern) {
  try {
    if (!fs.existsSync(dirPath)) return []
    
    const files = fs.readdirSync(dirPath)
      .filter(f => pattern.test(f))
      .sort()
    
    return files
  } catch (e) {
    return []
  }
}

/**
 * Read file content
 */
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch (e) {
    console.error(`Error reading file ${filePath}:`, e.message)
    return null
  }
}

/**
 * Write file content
 */
function writeFile(filePath, content) {
  const dir = path.dirname(filePath)
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (e) {
    console.error(`Error writing file ${filePath}:`, e.message)
    return false
  }
}

module.exports = {
  getDirectoryTimestamp,
  getLastTestTimestamp,
  getTestMetadata,
  formatDate,
  generateBadge,
  scanDirectory,
  readFile,
  writeFile,
}
