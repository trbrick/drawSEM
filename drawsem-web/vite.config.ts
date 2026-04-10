import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

/**
 * Multi-entry Vite configuration for dual-build mode:
 * - Standalone: ES module SPA for web distribution
 * - Widget: UMD module for htmlwidgets (Shiny/Quarto/RMarkdown)
 * 
 * Build with: npm run build (builds both)
 * Build standalone only: npm run build:standalone
 * Build widget only: npm run build:widget
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'src/main-standalone.tsx'),
      output: {
        dir: 'dist/standalone',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        format: 'es'
      }
    }
  }
})
