/**
 * Pure viewBox math for canvas zoom and pan, and wheel-input classification.
 *
 * Zoom and pan are view state: while editing they change only the canvas
 * <svg>'s viewBox. They are not model edits (no undo step, no per-edit sync to
 * a host). The current view is written into the model's `visualization`
 * (`viewport`, `activeLayer`, `offLayerVisibility`) only at explicit
 * serialization points: standalone Save, and Done in the RStudio addin.
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

/**
 * The subset of a WheelEvent that `isTrackpadWheel` reads. `wheelDeltaX` /
 * `wheelDeltaY` are the legacy (non-standard) properties that Chromium and
 * Safari still set.
 */
export interface WheelLike {
  deltaX: number
  deltaY: number
  deltaMode: number
  wheelDeltaX?: number
  wheelDeltaY?: number
}

/**
 * Best-effort guess whether a (non-pinch) wheel event came from a trackpad
 * two-finger scroll (true) or from a mouse wheel (false). Browsers expose no
 * device type, so this uses the usual heuristics, in order:
 *
 *  1. `deltaMode` is lines or pages: a notched mouse wheel (Firefox reports
 *     mouse wheels in lines on most platforms). -> mouse
 *  2. Movement on both axes at once: only a touch surface does that. -> trackpad
 *  3. The legacy `wheelDeltaY` (or `wheelDeltaX`, for a horizontal-only
 *     scroll) is set (Chromium, Safari): a trackpad reports exactly
 *     `wheelDeltaY === -3 * deltaY`; a mouse notch reports +-120 (or a
 *     multiple) against a deltaY of about 100 that does not satisfy it.
 *  4. Otherwise (Firefox in pixel mode): a fractional delta is a smooth
 *     (trackpad) delta -> trackpad; whole numbers -> mouse.
 *
 * How it can misfire:
 *  - A mouse wheel on macOS without acceleration can emit small whole-pixel
 *    deltas (e.g. deltaY 4, wheelDeltaY -12) that satisfy the -3x rule, so it
 *    is taken for a trackpad (pans instead of zooming).
 *  - Mice with smooth/high-resolution scrolling (Logitech free-spin, Windows
 *    "smooth scrolling" in Firefox) can send fractional pixel deltas and be
 *    taken for a trackpad.
 *  - Some trackpad drivers (older Windows touchpads, Linux/X11) send
 *    whole-notch, one-axis deltas and are taken for a mouse (zoom instead of
 *    pan).
 *  - Horizontal-only deltas (tilt wheel, or Shift+wheel, which some
 *    browsers turn into deltaX) go through rules 3/4 and can land either way.
 *    The canvas treats Shift+wheel as a pan regardless.
 *  - A Magic Mouse is a touch surface and is (reasonably) treated as a trackpad.
 * Each event is classified on its own; nothing is latched across a gesture.
 */
export function isTrackpadWheel(e: WheelLike): boolean {
  if (e.deltaMode !== 0) return false
  if (e.deltaX !== 0 && e.deltaY !== 0) return true
  // the one axis that moved (deltaY when neither did)
  const horizontal = e.deltaY === 0 && e.deltaX !== 0
  const delta = horizontal ? e.deltaX : e.deltaY
  const legacy = horizontal ? e.wheelDeltaX : e.wheelDeltaY
  if (typeof legacy === 'number' && legacy !== 0) return legacy === -3 * delta
  return !Number.isInteger(delta)
}

/** The viewBox rounded to 2 decimals, for storing in the schema. */
export function roundViewBox(vb: ViewBox): ViewBox {
  const r = (v: number) => Math.round(v * 100) / 100 || 0 // no -0
  return { x: r(vb.x), y: r(vb.y), width: r(vb.width), height: r(vb.height) }
}

/**
 * A stored `visualization.viewport` as a usable ViewBox, or null when it is
 * absent or malformed (non-finite, or a non-positive size).
 */
export function viewBoxFromViewport(v: unknown): ViewBox | null {
  if (!v || typeof v !== 'object') return null
  const { x, y, width, height } = v as Record<string, unknown>
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  if ((width as number) <= 0 || (height as number) <= 0) return null
  return { x: x as number, y: y as number, width: width as number, height: height as number }
}
