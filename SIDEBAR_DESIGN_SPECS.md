# AdminSidebar Visual Design Details

## Layout Specifications

### Sidebar Dimensions
- **Width:** 320px (w-80 in Tailwind)
- **Position:** Fixed left side, full screen height
- **Display:** Hidden on mobile, visible on lg: (1024px+)
- **Scrollable:** Overflow-y-auto dengan scrollbar

### Header Section
- **Background:** White (light mode) / Gray-900 (dark mode)
- **Border-bottom:** 1px gray-200 / gray-800
- **Padding:** px-6 py-4
- **Typography:**
  - Title "Jurnalku": text-xl font-bold
  - Subtitle "Admin Dashboard": text-xs text-gray-500

### Menu Group Section
- **Vertical Spacing:** py-4 (antar group)
- **Left Padding:** px-4
- **Group Label:**
  - Font size: text-[11px]
  - Style: UPPERCASE font-semibold
  - Color: text-gray-500 / dark:text-gray-400
  - Tracking-wider (letter spacing)
  - Margin bottom: mb-2

### Menu Items
**Parent Menu (dengan atau tanpa submenu):**
- **Height:** py-2.5 (compact, 10px padding top-bottom)
- **Padding:** px-3 (left-right padding untuk icon + label)
- **Border-radius:** rounded-lg
- **Font:** text-sm font-medium
- **Spacing:** gap-3 antara icon dan text

**States:**
1. **Inactive hover:**
   - Background: bg-gray-100 / dark:bg-gray-800
   - Color: text-gray-700 / dark:text-gray-300

2. **Active (current route):**
   - Background: bg-primary/10 / dark:bg-primary/20
   - Color: text-primary / dark:text-primary
   - Indicates current page with highlight

3. **Submenu parent (dengan children):**
   - Right side: ChevronDown icon (16px)
   - Rotate 180° saat expanded
   - Transition smooth

**Submenu Items:**
- **Margin-left:** ml-3 (additional indentation)
- **Padding-left:** pl-3 + border-left (visual hierarchy)
- **Border-left:** 1px border-gray-200 / dark:border-gray-700
- **Font:** text-xs (smaller than parent)
- **Padding:** py-2 px-3

### Icon Specifications
- **Parent menu icons:** 20px size (lucide-react)
- **Chevron icon:** 16px size
- **Color:** Inherits text color (gray-700 inactive, primary active)

## Color Scheme

### Light Mode
- Background: white
- Text primary: gray-900
- Text secondary: gray-500
- Border: gray-200
- Hover bg: gray-100
- Active bg: primary/10
- Active text: primary

### Dark Mode (Supported)
- Background: gray-900
- Text primary: white
- Text secondary: gray-400
- Border: gray-800
- Hover bg: gray-800
- Active bg: primary/20
- Active text: primary

## Interactivity

### Click Behavior
1. **Menu item tanpa children:**
   - Link ke route path terkait
   - Auto-highlight jika route match

2. **Menu item dengan children:**
   - Button toggle untuk expand/collapse
   - State tracked di `expandedMenus` useState
   - Submenu items muncul/hilang dengan smooth transition

### Transition Effects
- Duration: smooth (default Tailwind)
- Rotate chevron: 180° transform
- Hover: subtle bg color change
- Active scale: (tidak ada, hanya highlight warna)

## Feature Flags Integration

Setiap menu item di-filter berdasarkan:
1. Feature subscription check (via `pathEnabled()`)
2. Jika menu parents semua children disable → parent item tidak ditampilkan
3. Jika parent enable tapi beberapa children disable → hanya children enabled yang tampil di submenu

## Responsive Behavior

- **Mobile (< 1024px):** Sidebar hidden completely
  → Mobile navigation via BottomNav atau hamburger menu
- **Desktop (≥ 1024px):** Sidebar visible sebagai fixed sidebar
  → Main content area ml-80 (margin-left 320px)

## Typography Stack

- **Font family:** Default (sans-serif dari Tailwind)
- **Font sizes:**
  - Group label: 11px (text-[11px])
  - Menu item: 14px (text-sm)
  - Submenu: 12px (text-xs)
- **Font weights:**
  - Group label: 600 (font-semibold)
  - Menu item: 500 (font-medium)
  - Submenu: 500 (font-medium)

## Example Menu Item States

### Inactive Menu
```
┌─────────────────────────┐
│ [📊] Data Siswa        │  ← gray text, gray-100 hover
│      (py-2.5 px-3)     │
└─────────────────────────┘
```

### Active Menu
```
┌─────────────────────────┐
│ [📊] Data Siswa        │  ← primary text, primary/10 bg
│      (current route)   │
└─────────────────────────┘
```

### Expandable Menu (Collapsed)
```
┌──────────────────────┐
│ [📅] Jadwal   [▼]   │  ← chevron down (normal)
│                     │
└──────────────────────┘
```

### Expandable Menu (Expanded)
```
┌──────────────────────┐
│ [📅] Jadwal   [▲]   │  ← chevron rotated 180°
├──────────────────────┤
│  │ Kelola Jadwal    │  ← submenu, smaller, indented
│  │ Jadwal Ujian     │
│  │ Pengajar         │
└──────────────────────┘
```

## Animation & Transitions

1. **Sidebar margin-left:** transition-all duration-300
2. **Chevron rotation:** rotate-180 (Tailwind with transition)
3. **Color changes:** smooth (no explicit duration)
4. **Submenu toggle:** instant (CSS show/hide via conditional render)

---

**File:** `/home/aljadugh/jurnalku/src/components/AdminSidebar.tsx`
**Main Layout:** `/home/aljadugh/jurnalku/src/components/layout/DashboardLayout.tsx`
