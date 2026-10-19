import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One ES2020 bundle (Chrome/Edge 80+, Safari 14+, Firefox 80+). The legacy build was dropped (spec P8).
export default defineConfig({
  plugins: [
    react(),
  ],
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    target: 'es2020',
    cssTarget: ['chrome80', 'safari14'],
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          socket: ['socket.io-client'],
        },
      },
    },
  },
})
