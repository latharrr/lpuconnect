import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['Chrome >= 52', 'Android >= 7'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  build: {
    target: 'es2015',
    cssTarget: 'chrome52',
    minify: 'terser',
    terserOptions: {
      ecma: 5,
      compress: { ecma: 5 },
      format: { ecma: 5 }
    }
  },
})
