/**
 * Shared node rendering utilities for both SVG export and canvas display
 * Ensures visual consistency across all rendering contexts
 */

import { Node } from '../core/types'
import { LATENT_RADIUS, MANIFEST_DEFAULT_W, MANIFEST_DEFAULT_H, DATASET_DEFAULT_W, DATASET_DEFAULT_H } from './constants'

/**
 * Display styling constants (shared between CanvasTool and exports)
 */
export const DISPLAY_COLORS = {
  fill: '#fff',
  stroke: '#000',
  selectedStroke: '#ff0000',
  selectedStrokeWidth: 2.5,
  defaultStrokeWidth: 1.5,
}

/**
 * Escape XML special characters for safe text embedding in SVG
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Determine if a variable node should render as manifest or latent
 */
export function getVariableRenderType(node: Node): 'manifest' | 'latent' {
  if (node.type !== 'variable') return 'manifest'
  
  // First priority: explicit variableCharacteristics.manifestLatent lock
  // This is set by R code when creating GraphModel and takes precedence
  if (node.variableCharacteristics?.manifestLatent) {
    return node.variableCharacteristics.manifestLatent
  }

  // Default: latent (circle) unless explicitly marked as manifest or has visual dimensions
  return 'latent'
}

/**
 * Render a latent variable node as SVG circle
 */
export function renderLatentNodeSvg(pos: { x: number; y: number }): string {
  return `<circle cx="${pos.x}" cy="${pos.y}" r="${LATENT_RADIUS}" fill="${DISPLAY_COLORS.fill}" stroke="${DISPLAY_COLORS.stroke}" stroke-width="${DISPLAY_COLORS.defaultStrokeWidth}" />`
}

/**
 * Render a manifest variable node as SVG rounded rectangle
 */
export function renderManifestNodeSvg(node: Node, pos: { x: number; y: number }): string {
  const width = node.visual?.width ?? MANIFEST_DEFAULT_W
  const height = node.visual?.height ?? MANIFEST_DEFAULT_H
  const x = pos.x - width / 2
  const y = pos.y - height / 2
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="${DISPLAY_COLORS.fill}" stroke="${DISPLAY_COLORS.stroke}" stroke-width="${DISPLAY_COLORS.defaultStrokeWidth}" />`
}

/**
 * Render a dataset node as SVG cylinder (database can icon)
 * Cylinder consists of: top ellipse cap, rectangular body, bottom ellipse cap, and side strokes
 */
export function renderDatasetNodeSvg(node: Node, pos: { x: number; y: number }): string {
  const w = node.visual?.width ?? DATASET_DEFAULT_W
  const h = node.visual?.height ?? DATASET_DEFAULT_H
  
  // Ellipse height proportional to cylinder width (mimics CanvasTool logic)
  const topEllipseRy = Math.max(5, Math.round(h * 0.18))
  const rx = w / 2
  
  // Calculate positions relative to center
  const bottomEllipseCy = h / 2 + topEllipseRy
  const topEllipseCy = -h / 2 + topEllipseRy / 2
  const rectY = -h / 2 + topEllipseRy / 2
  const rectHeight = h - topEllipseRy
  
  // Bottom ellipse (drawn first)
  const bottomEllipse = `<ellipse cx="${pos.x}" cy="${pos.y + bottomEllipseCy}" rx="${rx}" ry="${topEllipseRy}" fill="${DISPLAY_COLORS.fill}" stroke="${DISPLAY_COLORS.stroke}" stroke-width="${DISPLAY_COLORS.defaultStrokeWidth}" />`
  
  // Rectangle body (hides top of bottom ellipse)
  const body = `<rect x="${pos.x - rx}" y="${pos.y + rectY}" width="${w}" height="${rectHeight}" fill="${DISPLAY_COLORS.fill}" stroke="none" />`
  
  // Vertical side strokes (left and right edges)
  const leftStroke = `<line x1="${pos.x - rx}" y1="${pos.y + rectY}" x2="${pos.x - rx}" y2="${pos.y + bottomEllipseCy}" stroke="${DISPLAY_COLORS.stroke}" stroke-width="${DISPLAY_COLORS.defaultStrokeWidth}" />`
  const rightStroke = `<line x1="${pos.x + rx}" y1="${pos.y + rectY}" x2="${pos.x + rx}" y2="${pos.y + bottomEllipseCy}" stroke="${DISPLAY_COLORS.stroke}" stroke-width="${DISPLAY_COLORS.defaultStrokeWidth}" />`
  
  // Top ellipse (drawn last, stroke only)
  const topEllipse = `<ellipse cx="${pos.x}" cy="${pos.y + topEllipseCy}" rx="${rx}" ry="${topEllipseRy}" fill="${DISPLAY_COLORS.fill}" stroke="${DISPLAY_COLORS.stroke}" stroke-width="${DISPLAY_COLORS.defaultStrokeWidth}" />`
  
  return `<g>${bottomEllipse}${body}${leftStroke}${rightStroke}${topEllipse}</g>`
}

/**
 * Render a constant node as SVG triangle (polygon)
 */
export function renderConstantNodeSvg(pos: { x: number; y: number }): string {
  // Points: top (0, -22), bottom-right (19, 11), bottom-left (-19, 11)
  const pts = `${pos.x},${pos.y - 22} ${pos.x + 19},${pos.y + 11} ${pos.x - 19},${pos.y + 11}`
  return `<polygon points="${pts}" fill="${DISPLAY_COLORS.fill}" stroke="${DISPLAY_COLORS.stroke}" stroke-width="${DISPLAY_COLORS.defaultStrokeWidth}" />`
}

/**
 * Render any node as SVG based on its type
 */
export function renderNodeSvg(node: Node, pos: { x: number; y: number }): string {
  if (node.type === 'variable') {
    const renderType = getVariableRenderType(node)
    return renderType === 'latent' ? renderLatentNodeSvg(pos) : renderManifestNodeSvg(node, pos)
  }

  if (node.type === 'dataset') {
    return renderDatasetNodeSvg(node, pos)
  }

  // constant
  return renderConstantNodeSvg(pos)
}
