# Admin Sidebar Menu Structure — Final Preview

## Complete Menu Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                      JURNALKU                           │
│                  Admin Dashboard                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  DASHBOARD                                              │
│    🏠 Dashboard                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  MASTER DATA                                            │
│    👥 Data Siswa                                        │
│    👨‍💼 Data GTK                                          │
│    📚 Mata Pelajaran                                    │
│    📦 Rombongan Belajar                                 │
│    📅 Kalender KBM                                      │
│    🎓 Tahun Ajaran                                      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  AKADEMIK                                               │
│    📅 Jadwal Pelajaran ▼                                │
│       • Kelola Jadwal                                   │
│       • Jadwal Ujian                                    │
│       • Pengajar                                        │
│    ✓ Absensi ▼                                          │
│       • Presensi Siswa                                  │
│       • Absensi QR Siswa                                │
│       • Absensi Guru (Geolokasi)                        │
│       • Rekapitulasi                                    │
│       • Ekstrakurikuler                                 │
│       • Absensi Ekskul                                  │
│       • Absensi Jamaah                                  │
│       • Absensi Kokurikuler                             │
│       • Absensi Kegiatan                                │
│    📍 Ceklok & Rekap                                    │
│    ✓ Absensi Saya                                       │
│    📋 Jurnal Mengajar                                   │
│    📄 Rapor Siswa                                       │
│    📊 Ledger Nilai                                      │
│    📋 Rekap Nilai per Mapel                             │
│    ❓ Ujian & Bank Soal ▼                               │
│       • Bank Soal                                       │
│       • Kisi-kisi Soal                                  │
│       • Paket Ujian                                     │
│    📝 Catatan Kepribadian                               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  LAYANAN                                                │
│    📚 Perpustakaan Digital                              │
│    ✨ Generator AI Guru                                 │
│    📄 Posting                                           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  KEUANGAN & OPERASIONAL                                 │
│    💰 Keuangan ▼                                        │
│       • Tagihan & Pembayaran                            │
│       • Tabungan Siswa                                  │
│    🍽️ E-Kantin & Cashless ▼                             │
│       • Menu Kantin                                     │
│       • Order Kantin                                    │
│       • Verifikasi Topup Manual                         │
│       • Konfigurasi Bank Transfer                       │
│       • Kasir QR Scanner                                │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  KOMUNIKASI                                             │
│    💬 WhatsApp ▼                                        │
│       • Broadcast                                       │
│       • Konfigurasi Gateway                             │
│       • Notifikasi Otomatis                             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  MANAJEMEN LEMBAGA                                      │
│    ⚙️ Pengaturan                                        │
│    👤 Manajemen Pengguna                                │
│    🏫 Manajemen Lembaga ◄── Changed from "Modul Sistem" │
│    💾 Backup & Restore                                  │
│    </> REST API Developer                               │
│    🌐 Kelola Website                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Key Changes from Reference

✅ **Menu Grouping:**
- Terbagi menjadi 7 kategori (DASHBOARD, MASTER DATA, AKADEMIK, LAYANAN, KEUANGAN & OPERASIONAL, KOMUNIKASI, MANAJEMEN LEMBAGA)
- Setiap kategori memiliki header dengan styling UPPERCASE + font-semibold

✅ **Hierarchy:**
- Parent items dapat di-expand/collapse
- Submenu items indented dengan border-left visual indicator
- Chevron icon menunjukkan expand/collapse state

✅ **"Modul Sistem" → "Manajemen Lembaga":**
- Category header diganti sesuai request
- Items tetap sama (Pengaturan, User, Backup, API, Website)
- Lebih meaningful untuk fungsi-fungsi admin

✅ **Feature Flags:**
- Setiap menu item di-filter berdasarkan subscription/feature access
- Menu parent tidak tampil jika semua children disabled
- Empty submenu tidak ditampilkan

---

## Implementation Details

### File Structure
```
src/
├── components/
│   ├── AdminSidebar.tsx         [NEW] 181 lines
│   └── layout/
│       └── DashboardLayout.tsx   [MODIFIED] +6 lines
├── lib/
│   └── menuItems.tsx            [EXISTING] — no changes
└── pages/
    └── admin/
        └── AdminDashboard.tsx   [EXISTING] — no changes
```

### Component Props & State
```typescript
// AdminSidebar.tsx
interface SidebarMenuItem extends MenuItem {
  isExpanded?: boolean
  isActive?: boolean
}

// State management
const [expandedMenus, setExpandedMenus] = useState<string[]>([
  // Auto-expand any parent with active child route
])

// Functions
const toggleMenu = (label: string) => { /* expand/collapse */ }
const isPathActive = (path?: string) => { /* check if route matches */ }
const getMenuItemByLabel = (label: string) => { /* find menu item */ }
```

### CSS Classes Used
```
Layout:
- lg:flex lg:flex-col    — desktop sidebar visible
- w-80                   — 320px width
- h-screen overflow-y-auto — full height with scroll
- border-r border-gray-200 — right border

Header:
- p-6 border-b           — padding + border bottom
- text-xl font-bold      — title styling
- text-xs text-gray-500  — subtitle styling

Groups:
- space-y-6              — vertical gap between groups
- px-4 py-4              — padding for each group

Items:
- px-3 py-2.5            — compact padding
- rounded-lg             — border radius
- text-sm font-medium    — typography
- gap-3                  — icon-text spacing
- transition-all         — smooth hover

Active:
- bg-primary/10          — subtle background
- text-primary           — primary color text

Submenu:
- ml-3 pl-3              — indentation
- border-l               — left border indicator
- text-xs                — smaller font
```

---

## User Interaction Flow

### 1. Page Load (Admin login)
```
1. Role detected: admin/super_admin/operator/tata_usaha/tu
2. DashboardLayout renders AdminSidebar (not Sidebar)
3. Auto-expand groups with active child routes
4. Current page highlighted in primary color
5. Sidebar visible on lg: breakpoint
```

### 2. Menu Navigation
```
Click on "Jadwal Pelajaran" (with children)
  → Expand/collapse submenu
  → Chevron rotates 180°
  → Submenu items fade in/out

Click on "Data Siswa" (no children)
  → Navigate to /admin/siswa
  → Highlight active
  → Close expanded menus if needed (optional)
```

### 3. Route Change
```
Navigate to new page
  → Route pathname changes
  → isPathActive() recalculates
  → Previous highlight removed
  → New item highlighted
  → Parent auto-expands if needed (initial render)
```

### 4. Responsive Behavior
```
Mobile (< 1024px):
  → AdminSidebar hidden (hidden lg:flex)
  → BottomNavigation visible for navigation
  → User can still navigate via links

Desktop (≥ 1024px):
  → AdminSidebar visible (lg:flex)
  → Main content margin-left = 320px
  → Smooth layout adjustment
```

---

## Testing Checklist

For local verification (before VPS deployment):

- [ ] Build successful: `npm run build` ✓ (done)
- [ ] Component imports correctly
- [ ] Dev server runs: `npm run dev` ✓ (done)
- [ ] Browser: http://localhost:5173
  - [ ] Admin sidebar renders (not mobile Sidebar)
  - [ ] Menu items display in correct groups
  - [ ] Icons visible for each item
  - [ ] Parent items with chevron show expand/collapse
- [ ] Functionality:
  - [ ] Click parent menu → expand/collapse works
  - [ ] Chevron rotates smoothly
  - [ ] Hover effects work (subtle bg change)
- [ ] Routing:
  - [ ] Navigate to /admin/siswa → "Data Siswa" highlighted
  - [ ] Navigate to /admin/jadwal → "Jadwal Pelajaran" auto-expands + "Kelola Jadwal" highlighted
  - [ ] Previous highlight removed
- [ ] Submenu items:
  - [ ] Indentation visible (border-left)
  - [ ] Different styling (smaller, muted)
  - [ ] Click leads to correct route
- [ ] Dark mode:
  - [ ] Toggle dark mode → colors adjust
  - [ ] Contrast still readable
- [ ] Responsive:
  - [ ] Resize to mobile (< 1024px) → sidebar hidden
  - [ ] Back to desktop → sidebar visible
  - [ ] Main content margin adjusts correctly

---

## Status Summary

```
✅ Component created:     AdminSidebar.tsx (181 lines)
✅ Integration done:       DashboardLayout updated (+6 lines)
✅ Build successful:       2662 modules, 1.62s
✅ Dev server tested:      Running on localhost:5173
✅ Documentation:          3 markdown files created

❌ NOT DEPLOYED TO VPS:    Waiting for your review
```

---

**Ready for your review!** 🎉

Next steps after you verify locally:
1. Review the sidebar appearance and menu organization
2. Test navigation and highlighting
3. Confirm styling matches your expectations
4. If approved → git commit + push to VPS (jurnal.cc.cd + jurnalmadrasah.web.id)
5. If changes needed → will update component based on feedback
