import React from 'react'
import CanvasTool from './components/CanvasTool'

interface AppProps {
  viewMode?: 'widget' | 'shiny' | 'full'
}

export default function App({ viewMode = 'full' }: AppProps): JSX.Element {
  const showChrome = viewMode !== 'widget'

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900">
      {showChrome && (
        <header className="bg-white shadow p-4">
          <h1 className="text-lg font-semibold">drawSEM Canvas</h1>
        </header>
      )}
      <main className="flex-1 p-4 overflow-hidden flex flex-col">
        {showChrome && (
          <p className="mb-4 text-sm text-slate-600">A minimal visual canvas tool (rectangle draw & drag).</p>
        )}
        <div className="flex-1 border rounded-lg bg-white overflow-hidden flex flex-col">
          <CanvasTool viewMode={viewMode} />
        </div>
      </main>
    </div>
  )
}
