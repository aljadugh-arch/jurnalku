import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Pemecahan chunk menentukan apa yang HARUS diunduh sebelum layar pertama tampil.
//
// Aturan: setiap library berat yang hanya dipakai SATU fitur mendapat chunk
// sendiri, sehingga tidak ikut terbawa hanya karena modul lain kebetulan
// mengimpornya. Sebelumnya semua sisa library jatuh ke satu ember `vendor`
// berukuran 1,85 MB — dan karena satu modul awal menyentuh ember itu, seluruh
// isinya (tiptap, xlsx, exceljs, tesseract, docx, mammoth) terunduh di awal.
//
// Yang WAJIB ada di jalur awal hanya: react, react-dom, react-router, axios,
// zustand, clsx, lucide-react, react-hot-toast.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    // Peringatan ukuran chunk dinaikkan sedikit: chunk fitur (xlsx, tiptap)
    // memang besar tetapi TIDAK dimuat di awal — itu disengaja.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // ---- jalur awal (harus kecil) ----
          //
          // PENTING: pencocokan harus menyertakan `node_modules/` di depan.
          // Versi lama memakai `id.includes('/react/')` yang juga cocok dengan
          // `node_modules/@tiptap/react/...` — akibatnya seluruh editor masuk
          // chunk React dan terunduh sebelum layar pertama (vendor-react
          // 150 KB gzip, padahal React sendiri ~60 KB).
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler/')) return 'vendor-react'
          if (id.includes('node_modules/react-router')) return 'vendor-router'
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons'
          if (id.includes('node_modules/axios')) return 'vendor-http'
          if (id.includes('node_modules/zustand')) return 'vendor-state'
          if (id.includes('node_modules/react-hot-toast') || id.includes('node_modules/goober')) return 'vendor-toast'
          if (id.includes('node_modules/clsx')) return 'vendor-clsx'

          // ---- fitur berat ----
          //
          // JANGAN memaksa library berat ke chunk bernama. Sudah dicoba untuk
          // @tiptap dan hasilnya kontraproduktif: Rollup menaruh potongan
          // react/jsx-runtime DI DALAM chunk `fitur-editor`, sehingga `index`
          // mengimpornya sebagai dependensi statis dan index.html mem-preload
          // 131 KB chunk editor padahal belum ada yang membuka halaman posting.
          //
          // Biarkan Rollup menempatkannya di chunk halaman pemakainya. Semua
          // halaman pemakai sudah `lazy()`, jadi chunk-nya hanya diunduh saat
          // halaman itu dibuka.

          // Sisanya: jangan digabung jadi satu ember besar.
          return
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
