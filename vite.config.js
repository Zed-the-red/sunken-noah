import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  optimizeDeps: {
    exclude: ['express', 'cors'],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'models', dest: '.' },
        { src: 'audio', dest: '.' },
        { src: 'images', dest: '.' },
        { src: 'species_data.json', dest: '.' },
        { src: 'draco', dest: '.' },
      ],
    }),
  ],
})
