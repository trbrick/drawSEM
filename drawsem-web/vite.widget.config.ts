import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

/**
 * Widget-specific Vite config for htmlwidgets UMD build.
 * Used with: npm run build:widget
 * 
 * Outputs UMD module to inst/htmlwidgets/lib/app/
 */
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'src/main-widget.tsx'),
      output: {
        dir: '../inst/htmlwidgets/lib/app',
        entryFileNames: 'widget.js',
        assetFileNames: 'widget.[extname]',
        format: 'umd',
        name: 'drawSEM',
        inlineDynamicImports: true
      }
    }
  }
})

