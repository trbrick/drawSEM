import React, { useEffect, useRef } from 'react'

/**
 * Keyboard shortcuts scoped to one editor instance.
 *
 * A page can hold several editors (e.g. a Quarto or R Markdown document with
 * several widgets), so a keypress is handled only by the instance the user is
 * interacting with: the one containing the focused element. The editor's root
 * element is focusable (tabIndex -1), so clicking anywhere in it focuses it.
 *
 * When the editor is the whole page (standalone, Shiny app, RStudio addin),
 * `acceptUnfocused` also lets it handle keys pressed while nothing at all is
 * focused (the event target is <body>), so shortcuts work right after load.
 *
 * Keys typed into a text field, select or contenteditable are never handled.
 */

export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** Cmd on macOS, Ctrl elsewhere (either is accepted, as for the existing shortcuts). */
export function hasPrimaryModifier(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey
}

export function ownsKeyEvent(e: KeyboardEvent, container: HTMLElement | null, acceptUnfocused: boolean): boolean {
  if (!container) return false
  const target = e.target as Node | null
  if (target && container.contains(target)) return true
  if (!acceptUnfocused) return false
  const doc = container.ownerDocument
  return target === doc.body || target === doc.documentElement || (target as unknown) === doc
}

export function useEditorKeyboard(
  containerRef: React.RefObject<HTMLElement>,
  handler: (e: KeyboardEvent) => void,
  options: { acceptUnfocused: boolean }
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const acceptRef = useRef(options.acceptUnfocused)
  acceptRef.current = options.acceptUnfocused

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return
      if (!ownsKeyEvent(e, containerRef.current, acceptRef.current)) return
      if (isTextEntryTarget(e.target)) return
      handlerRef.current(e)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [containerRef])
}
