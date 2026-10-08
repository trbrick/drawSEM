import { useLayoutEffect, useRef } from 'react'

/**
 * Undo/redo history for the editor's document state.
 *
 * Snapshot-based: the editor's state updates are immutable, so a snapshot is
 * just a reference to the previous state object and costs nothing to keep.
 * History lives only in memory; it is never serialized, persisted or sent
 * anywhere. Restoring a snapshot goes through the editor's normal state, so
 * whatever already syncs that state (e.g. to R) sees an undo like any edit.
 */

/** Coalescing key. Compared with ===; `undefined` never coalesces. */
export type HistoryKey = unknown

export const DEFAULT_HISTORY_LIMIT = 100

/**
 * Pure undo/redo stacks (no React). `record` is called with the state as it
 * was *before* a change; consecutive changes with the same key coalesce into
 * one step (the earliest "before" state is kept) while they are no more than
 * `windowMs` apart.
 */
export class UndoStack<T> {
  private past: T[] = []
  private future: T[] = []
  private lastKey: HistoryKey = undefined
  private lastTime = 0

  constructor(private readonly limit: number = DEFAULT_HISTORY_LIMIT) {}

  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }
  get undoDepth(): number { return this.past.length }
  get redoDepth(): number { return this.future.length }

  record(before: T, key: HistoryKey = undefined, windowMs: number = Infinity, now: number = Date.now()): void {
    this.future = []
    if (key !== undefined && key === this.lastKey && this.past.length > 0 && now - this.lastTime <= windowMs) {
      this.lastTime = now
      return
    }
    this.past.push(before)
    if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit)
    this.lastKey = key
    this.lastTime = now
  }

  /** Returns the state to restore, or undefined when there is nothing to undo. */
  undo(current: T): T | undefined {
    const target = this.past.pop()
    if (target === undefined) return undefined
    this.future.push(current)
    this.lastKey = undefined
    return target
  }

  /** Returns the state to restore, or undefined when there is nothing to redo. */
  redo(current: T): T | undefined {
    const target = this.future.pop()
    if (target === undefined) return undefined
    this.past.push(current)
    this.lastKey = undefined
    return target
  }

  /** The next change starts a new step even if its key matches the last one. */
  breakCoalescing(): void {
    this.lastKey = undefined
  }

  clear(): void {
    this.past = []
    this.future = []
    this.lastKey = undefined
  }
}

const fieldIds = new WeakMap<Element, number>()
let nextFieldId = 1

/**
 * A coalescing key for typing into one form field: the same element editing
 * the same thing (`scope`, e.g. the selected element's id) yields the same key,
 * so a run of keystrokes is one undo step.
 */
export function fieldKey(el: Element, scope: string): string {
  let id = fieldIds.get(el)
  if (id === undefined) {
    id = nextFieldId++
    fieldIds.set(el, id)
  }
  return `field:${id}:${scope}`
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => Object.is(a[k], b[k]))
}

type Pending = { key: HistoryKey; windowMs: number } | 'silent'

export interface DocumentHistory<T> {
  /**
   * Declare that a user edit is about to be applied (call it where the edit is
   * dispatched). The change is recorded when it commits. `key` coalesces it
   * with the previous step; without one, edits dispatched in the same task
   * (e.g. a node and its variance path) still form one step.
   */
  markChange(key?: HistoryKey, windowMs?: number): void
  /** Run `fn` so that any change it dispatches uses this key (overrides markChange's). */
  withKey(key: HistoryKey, windowMs: number, fn: () => void): void
  /** Run `fn` so that changes it dispatches are not undo steps (e.g. derived metadata). */
  silently(fn: () => void): void
  /** Forget all history (a new document was loaded). */
  reset(): void
  breakCoalescing(): void
  /** Restore the previous step. Returns the restored state, or undefined. */
  undo(): T | undefined
  redo(): T | undefined
  readonly canUndo: boolean
  readonly canRedo: boolean
}

/**
 * Track `state` (an object of immutable parts compared shallowly, e.g.
 * `{ models, currentModelId }`) and record the state before each committed
 * user change. `restore` applies a snapshot back to the editor.
 *
 * A committed change that was not announced with `markChange` (a model load,
 * an undo/redo itself, a `silently` update) just becomes the new baseline.
 */
export function useDocumentHistory<T extends Record<string, unknown>>(
  state: T,
  restore: (snapshot: T) => void,
  options: { limit?: number } = {}
): DocumentHistory<T> {
  const stackRef = useRef<UndoStack<T> | null>(null)
  if (stackRef.current === null) stackRef.current = new UndoStack<T>(options.limit ?? DEFAULT_HISTORY_LIMIT)
  const committedRef = useRef<T>(state)
  const pendingRef = useRef<Pending | null>(null)
  const overrideRef = useRef<{ key: HistoryKey; windowMs: number } | null>(null)
  const silentDepthRef = useRef(0)
  const tickKeyRef = useRef<object | null>(null)
  const restoreRef = useRef(restore)
  restoreRef.current = restore

  // Runs after every commit. A pending mark that produced no change (e.g. an
  // updater that returned the same state) is dropped here too.
  useLayoutEffect(() => {
    const before = committedRef.current
    const pending = pendingRef.current
    pendingRef.current = null
    if (shallowEqual(before, state)) return
    committedRef.current = state
    if (pending && pending !== 'silent') {
      stackRef.current!.record(before, pending.key, pending.windowMs)
    }
  })

  const historyRef = useRef<DocumentHistory<T> | null>(null)
  if (historyRef.current === null) {
    const stack = () => stackRef.current!
    historyRef.current = {
      markChange(key?: HistoryKey, windowMs: number = Infinity) {
        if (silentDepthRef.current > 0) {
          if (pendingRef.current === null) pendingRef.current = 'silent'
          return
        }
        if (overrideRef.current) {
          pendingRef.current = { ...overrideRef.current }
          return
        }
        if (key === undefined) {
          // One key per task: dispatches from one handler coalesce.
          if (tickKeyRef.current === null) {
            const token = {}
            tickKeyRef.current = token
            queueMicrotask(() => { if (tickKeyRef.current === token) tickKeyRef.current = null })
          }
          key = tickKeyRef.current
          windowMs = Infinity
        }
        pendingRef.current = { key, windowMs }
      },
      withKey(key, windowMs, fn) {
        const prev = overrideRef.current
        overrideRef.current = { key, windowMs }
        try { fn() } finally { overrideRef.current = prev }
      },
      silently(fn) {
        silentDepthRef.current++
        try { fn() } finally { silentDepthRef.current-- }
      },
      reset() {
        pendingRef.current = null
        stack().clear()
      },
      breakCoalescing() {
        stack().breakCoalescing()
      },
      undo() {
        const target = stack().undo(committedRef.current)
        if (target === undefined) return undefined
        committedRef.current = target
        pendingRef.current = null
        restoreRef.current(target)
        return target
      },
      redo() {
        const target = stack().redo(committedRef.current)
        if (target === undefined) return undefined
        committedRef.current = target
        pendingRef.current = null
        restoreRef.current(target)
        return target
      },
      get canUndo() { return stack().canUndo },
      get canRedo() { return stack().canRedo },
    }
  }
  return historyRef.current
}
