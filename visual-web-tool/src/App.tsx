import React from 'react'
import CanvasTool from './components/CanvasTool'

export default function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white shadow p-4">
        <h1 className="text-lg font-semibold">Visual Web Tool — Canvas</h1>
      </header>
      <main className="p-4">
        <p className="mb-4 text-sm text-slate-600">A minimal visual canvas tool (rectangle draw & drag).</p>
        <div className="border rounded-lg bg-white overflow-hidden">
          <CanvasTool />
        </div>
      </main>
    </div>
  )
}
