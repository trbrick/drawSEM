import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'
import { UndoStack, useDocumentHistory, fieldKey } from '../../src/hooks/useHistory'

describe('UndoStack', () => {
  it('undoes and redoes recorded states in order', () => {
    const s = new UndoStack<number>()
    s.record(0)
    s.record(1)
    expect(s.undo(2)).toBe(1)
    expect(s.undo(1)).toBe(0)
    expect(s.undo(0)).toBeUndefined()
    expect(s.redo(0)).toBe(1)
    expect(s.redo(1)).toBe(2)
    expect(s.redo(2)).toBeUndefined()
  })

  it('a new change clears the redo stack', () => {
    const s = new UndoStack<number>()
    s.record(0)
    expect(s.undo(1)).toBe(0)
    expect(s.canRedo).toBe(true)
    s.record(0)
    expect(s.canRedo).toBe(false)
  })

  it('coalesces consecutive changes with the same key, keeping the earliest state', () => {
    const s = new UndoStack<number>()
    s.record(0, 'k')
    s.record(1, 'k')
    s.record(2, 'k')
    expect(s.undoDepth).toBe(1)
    expect(s.undo(3)).toBe(0)
  })

  it('does not coalesce undefined keys or different keys', () => {
    const s = new UndoStack<number>()
    s.record(0)
    s.record(1)
    s.record(2, 'a')
    s.record(3, 'b')
    expect(s.undoDepth).toBe(4)
  })

  it('coalesces only within the time window, measured from the last change', () => {
    const s = new UndoStack<number>()
    s.record(0, 'k', 1000, 0)
    s.record(1, 'k', 1000, 900)
    s.record(2, 'k', 1000, 1800) // 900 after the previous: still one step
    expect(s.undoDepth).toBe(1)
    s.record(3, 'k', 1000, 3000) // a pause: new step
    expect(s.undoDepth).toBe(2)
  })

  it('undo, redo and breakCoalescing end a coalescing run', () => {
    const s = new UndoStack<number>()
    s.record(0, 'k')
    s.breakCoalescing()
    s.record(1, 'k')
    expect(s.undoDepth).toBe(2)
    s.undo(2)
    s.record(1, 'k')
    expect(s.undoDepth).toBe(2)
  })

  it('caps the depth, dropping the oldest steps', () => {
    const s = new UndoStack<number>(3)
    for (let i = 0; i < 10; i++) s.record(i)
    expect(s.undoDepth).toBe(3)
    expect(s.undo(10)).toBe(9)
    expect(s.undo(9)).toBe(8)
    expect(s.undo(8)).toBe(7)
    expect(s.undo(7)).toBeUndefined()
  })

  it('clear forgets everything', () => {
    const s = new UndoStack<number>()
    s.record(0)
    s.record(1)
    s.undo(2)
    s.clear()
    expect(s.canUndo).toBe(false)
    expect(s.canRedo).toBe(false)
  })
})

describe('fieldKey', () => {
  it('is stable per element and scope', () => {
    const a = document.createElement('input')
    const b = document.createElement('input')
    expect(fieldKey(a, 'x')).toBe(fieldKey(a, 'x'))
    expect(fieldKey(a, 'x')).not.toBe(fieldKey(a, 'y'))
    expect(fieldKey(a, 'x')).not.toBe(fieldKey(b, 'x'))
  })
})

// Separate user events are separate tasks; edits within one task share a step.
const nextTask = () => act(async () => { await Promise.resolve() })

function useDoc() {
  const [doc, setDoc] = useState<number[]>([])
  const history = useDocumentHistory({ doc }, (snap) => setDoc(snap.doc))
  const edit = (fn: (d: number[]) => number[]) => {
    history.markChange()
    setDoc(fn)
  }
  return { doc, setDoc, history, edit }
}

describe('useDocumentHistory', () => {
  it('records announced changes and restores them', async () => {
    const { result } = renderHook(() => useDoc())
    act(() => result.current.edit((d) => [...d, 1]))
    await nextTask()
    act(() => result.current.edit((d) => [...d, 2]))
    expect(result.current.doc).toEqual([1, 2])
    act(() => { result.current.history.undo() })
    expect(result.current.doc).toEqual([1])
    act(() => { result.current.history.undo() })
    expect(result.current.doc).toEqual([])
    expect(result.current.history.undo()).toBeUndefined()
    act(() => { result.current.history.redo() })
    act(() => { result.current.history.redo() })
    expect(result.current.doc).toEqual([1, 2])
  })

  it('edits dispatched in one task are one step', () => {
    const { result } = renderHook(() => useDoc())
    act(() => {
      result.current.edit((d) => [...d, 1])
      result.current.edit((d) => [...d, 2])
    })
    act(() => { result.current.history.undo() })
    expect(result.current.doc).toEqual([])
  })

  it('unannounced changes (loads) and silent changes are not undo steps', () => {
    const { result } = renderHook(() => useDoc())
    act(() => result.current.setDoc([5]))
    expect(result.current.history.canUndo).toBe(false)
    act(() => result.current.history.silently(() => result.current.edit((d) => [...d, 6])))
    expect(result.current.history.canUndo).toBe(false)
    act(() => result.current.edit((d) => [...d, 7]))
    act(() => { result.current.history.undo() })
    expect(result.current.doc).toEqual([5, 6])
  })

  it('withKey coalesces a run of changes into one step', async () => {
    const { result } = renderHook(() => useDoc())
    for (let i = 0; i < 5; i++) {
      act(() => result.current.history.withKey('nudge', 1000, () => result.current.edit((d) => [...d, i])))
      await nextTask()
    }
    expect(result.current.doc).toEqual([0, 1, 2, 3, 4])
    act(() => { result.current.history.undo() })
    expect(result.current.doc).toEqual([])
  })

  it('separate tasks without a key are separate steps', async () => {
    const { result } = renderHook(() => useDoc())
    act(() => result.current.edit((d) => [...d, 1]))
    await nextTask()
    act(() => result.current.edit((d) => [...d, 2]))
    act(() => { result.current.history.undo() })
    expect(result.current.doc).toEqual([1])
  })

  it('a change that leaves the state as it was is not a step', () => {
    const { result } = renderHook(() => useDoc())
    act(() => result.current.edit((d) => d))
    expect(result.current.history.canUndo).toBe(false)
  })

  it('reset forgets history', () => {
    const { result } = renderHook(() => useDoc())
    act(() => result.current.edit((d) => [...d, 1]))
    act(() => result.current.history.reset())
    expect(result.current.history.canUndo).toBe(false)
    expect(result.current.doc).toEqual([1])
  })
})
