import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AdapterContext } from './context/AdapterContext'
import { createShinyAdapter } from './adapters/shiny/shinyAdapter'
import './index.css'

const el = document.getElementById('root')
if (!el) throw new Error('Root element not found')

// Create the adapter instance for Shiny mode
const adapter = createShinyAdapter()

createRoot(el).render(
  <React.StrictMode>
    <AdapterContext.Provider value={adapter}>
      <App />
    </AdapterContext.Provider>
  </React.StrictMode>
)
