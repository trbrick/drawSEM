/**
 * Pure viewBox math for canvas zoom and pan.
 *
 * Zoom and pan are view state only: they change the canvas <svg>'s viewBox and
 * nothing else. They are never written into the schema or sent to a host.
 *
 * All functions assume the canvas uses preserveAspectRatio="xMidYMid meet".
 */

export interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

/** Rectangle of the <svg> element on screen (a DOMRect is fine). */
export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Zoom limits, as the larger viewBox dimension in canvas units. A latent node is
 * 72 units across, so ZOOM_MIN_EXTENT shows roughly one node; ZOOM_MAX_EXTENT is
 * far beyond any realistic model.
 */
export const ZOOM_MIN_EXTENT = 60
export const ZOOM_MAX_EXTENT = 50000

export function parseViewBox(attr: string): ViewBox | null {
  const parts = attr.trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null
  const [x, y, width, height] = parts
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

export function formatViewBox(vb: ViewBox): string {
  return `${vb.x} ${vb.y} ${vb.width} ${vb.height}`
}

/**
 * Screen pixels per canvas unit for a viewBox shown in `rect` with
 * xMidYMid meet (the smaller of the two axis scales). Null when the element
 * has no size (not laid out, or jsdom).
 */
export function viewScale(vb: ViewBox, rect: ScreenRect): number | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null
  return Math.min(rect.width / vb.width, rect.height / vb.height)
}

/** Map a client (screen) point to canvas coordinates under xMidYMid meet. */
export function clientToViewBox(vb: ViewBox, rect: ScreenRect, clientX: number, clientY: number): { x: number; y: number } | null {
  const s = viewScale(vb, rect)
  if (s === null) return null
  // meet + xMidYMid: content is centred, with letterboxing on one axis
  const offX = (rect.width - vb.width * s) / 2
  const offY = (rect.height - vb.height * s) / 2
  return {
    x: vb.x + (clientX - rect.left - offX) / s,
    y: vb.y + (clientY - rect.top - offY) / s,
  }
}

/**
 * Scale the viewBox by `factor` about canvas point `center` (factor > 1 zooms
 * out, < 1 zooms in). The point under the cursor stays under the cursor: with
 * xMidYMid meet, uniformly scaling the viewBox about a point leaves that point's
 * screen position unchanged.
 *
 * The result is clamped so the larger dimension stays within [minExtent,
 * maxExtent]. A viewBox already outside the range (e.g. a fit of a huge model)
 * is not snapped; it can only move back towards the range.
 */
export function zoomViewBox(
  vb: ViewBox,
  factor: number,
  center: { x: number; y: number },
  limits: { minExtent?: number; maxExtent?: number } = {}
): ViewBox {
  const minExtent = limits.minExtent ?? ZOOM_MIN_EXTENT
  const maxExtent = limits.maxExtent ?? ZOOM_MAX_EXTENT
  if (!Number.isFinite(factor) || factor <= 0) return vb
  const extent = Math.max(vb.width, vb.height)
  let target = extent * factor
  if (factor > 1) target = Math.min(target, Math.max(extent, maxExtent))
  else target = Math.max(target, Math.min(extent, minExtent))
  const f = target / extent
  if (f === 1) return vb
  return {
    x: center.x - (center.x - vb.x) * f,
    y: center.y - (center.y - vb.y) * f,
    width: vb.width * f,
    height: vb.height * f,
  }
}

/** Shift the viewBox by a screen-pixel delta (content follows the pointer). */
export function panViewBox(vb: ViewBox, dxPx: number, dyPx: number, scale: number): ViewBox {
  if (!(scale > 0)) return vb
  return { ...vb, x: vb.x - dxPx / scale, y: vb.y - dyPx / scale }
}

/** Wheel delta in pixels, normalising line and page delta modes. */
export function wheelDeltaPx(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * 16 // DOM_DELTA_LINE
  if (deltaMode === 2) return delta * pageSize // DOM_DELTA_PAGE
  return delta
}

/**
 * Zoom factor for a Ctrl/Cmd+wheel or pinch delta (pixels). Trackpad pinch
 * sends small deltas, a mouse wheel notch about 100; the clamp keeps a notch to
 * about 1.28x per step.
 */
export function wheelZoomFactor(deltaPx: number): number {
  const d = Math.max(-25, Math.min(25, deltaPx))
  return Math.exp(d * 0.01)
}
