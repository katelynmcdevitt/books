import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/google-sheet-csv': {
        target: 'https://docs.google.com',
        changeOrigin: true,
        rewrite: (path) => {
          const gid = path.match(/^\/google-sheet-csv\/(\d+)$/)?.[1]
          return `/spreadsheets/d/1gLdN5dpgPDGgn_HA4Ll0gAUOSftuFmY9yMxQALSB_UY/export?format=csv&gid=${gid ?? '311097372'}`
        },
      },
    },
  },
})
