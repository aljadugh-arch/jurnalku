import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Pisahkan library berat dari bundle utama supaya pemuatan awal tidak
        // mengunduh semuanya sekaligus (kurangi jumlah modulepreload di index).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('xlsx')) return 'vendor-xlsx'
          if (id.includes('jspdf') || id.includes('pdf-lib') || id.includes('pdfjs')) return 'vendor-pdf'
          if (id.includes('chart.js') || id.includes('recharts') || id.includes('d3')) return 'vendor-chart'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('leaflet')) return 'vendor-map'
          if (id.includes('html5-qrcode') || id.includes('qrcode')) return 'vendor-qr'
          if (id.includes('jspdf-autotable')) return 'vendor-pdf'
          return 'vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
