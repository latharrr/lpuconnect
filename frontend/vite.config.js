import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// Modern browsers load the ES2020 bundle; only old Android WebViews fetch the legacy one.
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['Chrome >= 61', 'Android >= 7'],
      modernPolyfills: false,
      renderLegacyChunks: true,
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    target: 'es2020',
    cssTarget: 'chrome61',
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
