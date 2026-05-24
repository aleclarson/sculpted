import { defineConfig } from '@pandacss/dev'

export default defineConfig({
  preflight: true,
  jsxFramework: 'preact',
  include: ['./src/**/*.{ts,tsx,js,jsx}'],
  exclude: [],
  outdir: 'styled-system',
  theme: {
    extend: {
      tokens: {
        colors: {
          brand: {
            50: { value: '#eef8ff' },
            100: { value: '#d8edff' },
            500: { value: '#1683d8' },
            700: { value: '#0f5f9e' }
          }
        }
      }
    }
  }
})
