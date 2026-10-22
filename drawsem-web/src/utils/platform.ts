/**
 * Platform-dependent pointer rules. Pure, except that the platform is read
 * from `navigator` by default.
 *
 * On macOS, Ctrl+click is the system's secondary (right) click, so there:
 *   - Ctrl + left press acts exactly like a right-button press;
 *   - only Shift and Cmd toggle an element in the selection.
 * Elsewhere Shift, Ctrl and Cmd/Meta all toggle. Keyboard shortcuts are not
 * affected (Cmd and Ctrl are both accepted there).
 */

type NavigatorLike = {
  userAgentData?: { platform?: string }
  platform?: string
  userAgent?: string
}

/** True on macOS (and iOS/iPadOS, which follow the same conventions). */
export function isMacPlatform(nav: NavigatorLike | undefined = typeof navigator !== 'undefined' ? (navigator as NavigatorLike) : undefined): boolean {
  if (!nav) return false
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

type PressLike = { button: number; ctrlKey: boolean }
type ModifierLike = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }

/** A right-button press, or (macOS only) a Ctrl + left press. */
export function isSecondaryPress(e: PressLike, mac: boolean): boolean {
  return e.button === 2 || (mac && e.button === 0 && e.ctrlKey)
}

/** Whether a click/press with these modifiers toggles an element in the selection. */
export function isToggleModifier(e: ModifierLike, mac: boolean): boolean {
  return e.shiftKey || e.metaKey || (!mac && e.ctrlKey)
}
