import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AdapterContext } from './context/ExporterContext'
import { createLocalAdapter } from './adapters/standalone/localExporter'
import './index.css'

const el = document.getElementById('root')
if (!el) throw new Error('Root element not found')

// Create the adapter instance for standalone mode
const adapter = createLocalAdapter()

createRoot(el).render(
  <React.StrictMode>
    <AdapterContext.Provider value={adapter}>
      <App />
    </AdapterContext.Provider>
  </React.StrictMode>
)
