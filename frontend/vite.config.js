import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 / Rolldown requires manualChunks as a function, not an object.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router-dom/') ||
            id.includes('/@tanstack/react-query/') ||
            id.includes('/zustand/')
          ) {
            return 'vendor';
          }
          if (id.includes('/recharts/') || id.includes('/d3')) {
            return 'charts';
          }
        }
      }
    }
  }
})
