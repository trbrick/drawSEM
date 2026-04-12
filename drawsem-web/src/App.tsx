import React from 'react'
import CanvasTool from './components/CanvasTool'
import { useAdapter } from './context/AdapterContext'
import type { GraphSchema } from './core/types'

interface AppProps {
  viewMode?: 'widget' | 'shiny' | 'full'
}

export default function App({ viewMode = 'full' }: AppProps): JSX.Element {
  const adapter = useAdapter()

  // In Shiny mode, sync every model edit back to R via adapter.save().
  // In standalone mode we do NOT call adapter.save() on every change — that
  // would trigger a file download on every keystroke.
  const handleModelChange = viewMode === 'shiny'
    ? (schema: GraphSchema) => { adapter.save(schema) }
    : undefined

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900">
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 bg-white overflow-hidden flex flex-col">
          <CanvasTool viewMode={viewMode} onModelChange={handleModelChange} />
        </div>
      </main>
    </div>
  )
}
