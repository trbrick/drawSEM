import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ExporterContext } from './context/ExporterContext'
import { createLocalExporter } from './adapters/standalone/localExporter'
import './index.css'

const el = document.getElementById('root')
if (!el) throw new Error('Root element not found')

// Create the exporter instance for standalone mode
const exporter = createLocalExporter()

createRoot(el).render(
  <React.StrictMode>
    <ExporterContext.Provider value={exporter}>
      <App />
    </ExporterContext.Provider>
  </React.StrictMode>
)
