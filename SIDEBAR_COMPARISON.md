# Perbandingan: Sidebar Lama vs Sidebar Admin Baru

## SIDEBAR LAMA (Digunakan untuk Guru, Kepala, Bendahara)

**Karakteristik:**
- Collapsible toggle (isOpen state)
- Narrow: 64px (closed) → 256px (open)
- Hamburger menu untuk toggle
- Single-level menu (minimal submenu)
- Grid icon layout dengan animasi
- Mobile-first approach

**File:** `src/components/layout/Sidebar.tsx` (tidak berubah)

**Struktur menu:**
```
Dashboard
Posting
Data Siswa
Data GTK
Mata Pelajaran
Rombongan Belajar
[... item lainnya]
─────────────
Logout
```

**Kegunaan untuk role:**
- Guru
- Kepala Madrasah (admin mode)
- Bendahara
- Proktor
- Dan role non-admin lainnya

---

## SIDEBAR ADMIN BARU (Admin, Super Admin, Operator, TU)

**Karakteristik:**
- Fixed width (320px / w-80)
- Always expanded di desktop
- Grouped menu dengan category headers
- Hierarchical: parent item + submenu children
- Dedicated untuk admin/operator roles
- Better organization untuk menu yang banyak

**File:** `src/components/AdminSidebar.tsx` (NEW)

**Struktur menu:**
```
DASHBOARD
  Dashboard

MASTER DATA
  Data Siswa
  Data GTK
  Mata Pelajaran
  [...]

AKADEMIK
  Jadwal Pelajaran
    ├─ Kelola Jadwal
    ├─ Jadwal Ujian
    └─ Pengajar
  Absensi
    ├─ Presensi Siswa
    ├─ Absensi QR
    [...]
  [... item lainnya]

KEUANGAN & OPERASIONAL
  [...]

[... kategori lainnya]
```

---

## Perbandingan Detail

| Aspek | Sidebar Lama | Admin Sidebar Baru |
|-------|-------------|-------------------|
| **Width** | 64-256px (toggle) | Fixed 320px |
| **Display Mode** | Collapsible | Always expanded |
| **Toggle UI** | Hamburger button | N/A |
| **Menu Organization** | Flat list | Grouped by category |
| **Submenu** | Minimal/inline | Expandable hierarchy |
| **Active Route** | Highlight + icon glow | Highlight + color bg |
| **Mobile** | Full-screen modal | Hidden (BottomNav) |
| **Desktop** | lg:block (64-256px) | lg:block (320px fixed) |
| **Hover Effect** | Tooltip | Subtle bg color |
| **Scroll** | Auto overflow | Auto overflow |
| **Dark Mode** | ✓ Supported | ✓ Supported |
| **Animation** | Smooth collapse/expand | Chevron rotate |
| **Target Users** | Teachers, Leaders | Admin, Operators |
| **Total Menu Items** | ~15-20 items | ~30+ items (organized) |
| **Category Headers** | No | Yes (7 categories) |

---

## Visual Comparison

### SIDEBAR LAMA (Collapsed)
```
┌────────┐
│ [☰]    │  ← Hamburger toggle
│ [🏠]   │  ← Dashboard (icon only)
│ [📝]   │  ← Posting
│ [👥]   │  ← Data Siswa
│ [👨]   │  ← Data GTK
│ [📚]   │  ← Mata Pelajaran
│ ...    │
│ [🚪]   │  ← Logout (bottom)
└────────┘
  64px
```

### SIDEBAR LAMA (Expanded)
```
┌─────────────────────────────┐
│ ☰ Jurnalku                  │
├─────────────────────────────┤
│ [🏠] Dashboard              │
│ [📝] Posting                │
│ [👥] Data Siswa             │
│ [👨] Data GTK               │
│ [📚] Mata Pelajaran         │
│ ...                         │
│                             │
│         [🚪] Logout         │
└─────────────────────────────┘
  256px
```

### ADMIN SIDEBAR BARU (Always Expanded)
```
┌────────────────────────────────┐
│ Jurnalku                       │
│ Admin Dashboard                │
├────────────────────────────────┤
│ DASHBOARD                      │
│   [🏠] Dashboard               │
│                                │
│ MASTER DATA                    │
│   [👥] Data Siswa              │
│   [👨] Data GTK                │
│   [📚] Mata Pelajaran          │
│   [📦] Rombongan Belajar       │
│   [📅] Kalender KBM            │
│   [🎓] Tahun Ajaran            │
│                                │
│ AKADEMIK                       │
│   [📅] Jadwal Pelajaran   [▼]  │
│      │ Kelola Jadwal           │
│      │ Jadwal Ujian            │
│      │ Pengajar                │
│   [✓] Absensi            [▼]   │
│      │ Presensi Siswa          │
│      │ Absensi QR Siswa        │
│      │ ...                     │
│   [📍] Ceklok & Rekap          │
│   [📋] Jurnal Mengajar         │
│   [📄] Rapor Siswa             │
│   ...                          │
│                                │
│ LAYANAN                        │
│   [📚] Perpustakaan Digital    │
│   [✨] Generator AI Guru       │
│   [📄] Posting                 │
│                                │
│ KEUANGAN & OPERASIONAL         │
│   [💰] Keuangan           [▼]  │
│   [🍽️] E-Kantin & Cashless [▼] │
│                                │
│ [scroll ke bawah...]           │
└────────────────────────────────┘
  320px
```

---

## Integration Logic

**DashboardLayout.tsx:**
```typescript
const isAdminRole = ['admin', 'super_admin', 'operator', 'tata_usaha', 'tu'].includes(role)

return (
  <div>
    {isAdminRole ? <AdminSidebar /> : <Sidebar />}
    <div className={isAdminRole ? 'lg:ml-80' : isOpen ? 'lg:ml-64' : 'lg:ml-20'}>
      {/* content */}
    </div>
  </div>
)
```

**Flow:**
1. Admin/Operator login → role check → AdminSidebar rendered
2. Guru/Kepala/Bendahara login → role check → Sidebar (lama) rendered
3. Mobile: both hidden → BottomNav navigation
4. Desktop (lg): appropriate sidebar visible

---

## Menu Categories Mapping

| Category | Items Count | Purpose |
|----------|------------|---------|
| DASHBOARD | 1 | Quick access ke main dashboard |
| MASTER DATA | 6 | Setup data dasar sekolah/madrasah |
| AKADEMIK | 15+ | Teaching, grading, attendance, reporting |
| LAYANAN | 3 | Support services (library, AI, posting) |
| KEUANGAN & OPERASIONAL | 2 | Finance & operations (fees, cashless) |
| KOMUNIKASI | 1 | WhatsApp broadcast & config |
| MANAJEMEN LEMBAGA | 6 | System config, user management, backup |

---

## Backward Compatibility

✅ **Sidebar lama fully preserved:**
- No changes to `Sidebar.tsx` (existing component)
- Used for non-admin roles
- No breaking changes to any other page

✅ **New sidebar isolated:**
- Only rendered when `isAdminRole === true`
- Does not interfere with other pages
- Can be iterated/improved without affecting others

---

## Next Steps (Setelah review)

1. Manual testing di browser (admin login, navigate)
2. Test expand/collapse submenu functionality
3. Test active route highlighting
4. Test dark mode toggle
5. Test on different screen sizes (desktop)
6. If approved → commit & deploy to VPS

