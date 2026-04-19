import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'models', dest: '.' },
        { src: 'audio', dest: '.' },
        { src: 'images', dest: '.' },
        { src: 'species_data.json', dest: '.' },
      ],
    }),
  ],
})
