import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

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
        name: 'graphTool',
        inlineDynamicImports: true
      }
    }
  }
})

