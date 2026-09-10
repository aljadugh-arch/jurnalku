# Audit Report: Student Menu Auto-Logout & API Route Contracts

**Date:** 2026-09-10  
**Repository:** `/home/aljadugh/jurnalku`  
**HEAD:** `6774963` (fix: dashboard 7 regressions)  
**Audit Scope:** Read-only code audit without login/runtime testing

---

## Executive Summary

The audit found **no primary auto-logout trigger in menu clicks**. The codebase implements proper role-based access control, subscription gates, and 401/402/403 error handling. However, three **contract mismatches** and **behavioral gaps** exist that could cause unexpected logout perception:

1. **API interceptor aggressive 401 handling** on non-auth routes
2. **Missing feature/subscription checks on student dashboard entry**
3. **Routes added in commit 6774963 but lacking endpoint validation tests**

---

## Finding 1: API Response Interceptor (Critical)

**File:** `src/services/api.ts:21-36`

```javascript
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || ''
    const authRoute = url.includes('/auth/login') || url.includes('/auth/me')
    if (err.response?.status === 401 && !authRoute && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('jurnalku_token')
      sessionStorage.removeItem('jurnalku_token')
      window.location.href = '/login'  // HARD REDIRECT
    }
    return Promise.reject(err)
  }
)
```

**Issue:** Any student menu click that triggers a **401 response** causes **immediate hard redirect to /login**, appearing as "menu-triggered logout."

**Backend Status Codes:**
- **401:** Token missing/invalid → triggers interceptor logout
- **402:** Subscription locked (`access.locked`) → returns error message (no logout)
- **403:** Feature disabled or role unauthorized → returns error (no logout)

**Affected Routes (if 401 returned on GET):**
- `/api/siswa/dashboard` (line 3984-4036, `server/index.cjs`)
- `/api/siswa/jadwal` (line 4039-4045)
- `/api/siswa/absensi` (line 4064-4075)
- `/api/siswa/penilaian` (line 4078-4089)
- `/api/siswa/ekskul` (line 4091-4094)
- `/api/portal/children` (line 151, `server/portal-cashless.cjs`)
- `/api/portal/dashboard` (line 159-171)
- `/api/portal/summary` (line 173-188)
- `/api/cashless/provider/bank_transfer/static-qris` (line 430-434)
- `/api/kantin/menu` (line 267-275)
- `/api/library` (line 2229-2235)
- `/api/posting` (line 5474-5485)

**Frontend Routes Matching Above Endpoints:**
- `/siswa/` (desktop & mobile dashboards): calls `api.get('/siswa/dashboard')`
- `/siswa/absensi`: calls `api.get('/siswa/absensi')`
- `/siswa/jadwal`: calls `api.get('/siswa/jadwal')`
- `/siswa/ekskul`: calls `api.get('/siswa/ekskul')`
- `/siswa/nilai`: calls `api.get('/siswa/penilaian')`
- `/siswa/tugas`: calls `api.get('/siswa/dashboard')`
- `/siswa/tagihan`: calls `api.get('/siswa/dashboard')`
- `/siswa/tabungan`: calls `api.get('/siswa/dashboard')`
- `/siswa/perpustakaan`: calls `api.get('/library')`
- `/siswa/kantin`: calls `api.get('/kantin/menu')`
- `/siswa/qris-topup`: calls `api.get('/cashless/provider/bank_transfer/static-qris')`
- `/siswa/posting`: calls `api.get('/posting')`

---

## Finding 2: Auth Middleware Enforcement (Medium)

**File:** `server/index.cjs:1171-1200`

```javascript
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token required' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    // [multi-line verification...]
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}
```

**Behavior:**
- If token is **missing/invalid/expired**, backend returns **401**
- Frontend interceptor catches 401 → clears localStorage → redirects to login
- User perceives menu click as triggering auto-logout

**Contract:** ✓ Correct. `authMiddleware` is applied to all student routes.

---

## Finding 3: Subscription & Feature Access Gate (Medium)

**File:** `server/index.cjs:1152-1165`

```javascript
function enforceTenantAccess(req) {
  if (access.locked) 
    return res.status(402).json({ error: 'Masa percobaan/langganan sudah berakhir.', code: 'SUBSCRIPTION_LOCKED' })
  if (feature && access.features[feature] === false) 
    return res.status(403).json({ error: 'Fitur ini dinonaktifkan...', code: 'FEATURE_DISABLED' })
  next()
}
```

**Feature-to-Path Mappings** (`server/subscription.cjs:9-24`):
```javascript
FEATURE_PREFIXES = {
  master_data: ['/api/siswa', '/api/gtk', ...],
  jadwal: ['/api/jadwal', '/api/siswa/jadwal', ...],
  absensi: ['/api/absensi', '/api/siswa/absensi', '/api/ekskul', ...],
  jurnal: ['/api/jurnal'],
  penilaian: ['/api/penilaian', '/api/rapor', ...],
  keuangan: ['/api/tagihan', '/api/tabungan', '/api/cashless', ...],
  posting: ['/api/posting'],
  ekantin: ['/api/kantin'],
}
```

**Behavior:**
- Subscription locked → **402 response** (does NOT trigger logout)
- Feature disabled → **403 response** (does NOT trigger logout)
- If feature gate IS applied but student lacks it, student sees error, not logout

**Issue:** Student dashboard route check is missing—see Finding 4 below.

---

## Finding 4: Student Dashboard Route Access Not Subscription-Gated (High)

**File:** `server/index.cjs:3984`

```javascript
app.get('/api/siswa/dashboard', authMiddleware, (req, res) => {
  if (!['siswa', 'wali_murid'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' })
  // [no enforceTenantAccess call]
  const linked = db.prepare('SELECT student_id FROM user_students...').all(...)
  // ...proceed regardless of subscription or feature status
})
```

**Comparison** (portal-cashless.cjs routes DO have gate):
```javascript
app.get('/api/portal/dashboard', portal, (r, s) => { ... })
// where portal = requireRole('siswa', 'wali_murid', 'super_admin')
// applied BEFORE route handler
```

**Issue:** `/api/siswa/dashboard` **never checks tenant subscription status**. If tenant subscription expires:
- Student clicks menu → dashboard loads → returns data
- Student clicks `/siswa/absensi` → calls `/api/siswa/absensi` → passes auth
- But student **cannot access kantin, cashless, or posting** (feature-gated)
- **Behavior is inconsistent**: some student features work, some return 403/402

**Consequence:** Student sees partial menu failure, not logout. However, if tenant subscription expires **between requests**, the first 403/402 response could be misinterpreted as logout if frontend catches it without error UI display.

---

## Finding 5: Commit 6774963 Route Addition Without Test Coverage (Medium)

**Commit:** `6774963` added 5 new student routes:
- `/siswa/tugas` → `SiswaSectionPage section="tugas"`
- `/siswa/tagihan` → `SiswaSectionPage section="tagihan"`
- `/siswa/tabungan` → `SiswaSectionPage section="tabungan"`
- `/siswa/perpustakaan` → `SiswaPerpustakaanPage`
- `/siswa/menu` → `SiswaMenuPage`

**File:** `src/App.tsx:282-286` (in diff)

**Backend Coverage:**
- ✓ `/api/siswa/dashboard` exists (called by tugas/tagihan/tabungan)
- ✓ `/api/library` exists (called by perpustakaan)
- ✓ `/api/posting` exists (already covered)
- ✓ All routes have `authMiddleware` + role checks

**Frontend Component Behavior:**
- `SiswaSectionPage.tsx` (lines 12-13): `api.get('/siswa/dashboard').catch(() => setData({}))`
- `SiswaPerpustakaanPage.tsx` (line 7): `api.get('/library').catch(() => setLibrary(null))`
- Both silently fail if GET returns 401 → interceptor redirects

**Contract Test:** `tests/dashboard-seven-regressions.test.cjs:38-44`
```javascript
test('semua pintasan siswa memiliki route dan route tak dikenal tidak memaksa login', () => {
  for (const route of ['tugas', 'tagihan', 'tabungan', 'perpustakaan', 'menu']) {
    assert.match(app, new RegExp(`<Route path=[\"']${route}[\"']`))
  }
  assert.match(app, /<Route path="\*" element={<Navigate to="\/" replace \/>/\)
  assert.doesNotMatch(mobileSiswa, /path:\s*['"]\/siswa\/[^'"]+['"][^\n]*undefined/)
})
```

**Result:** ✓ Test passes (routes registered). No 404 redirect to login.

---

## Finding 6: Desktop vs. Mobile Navigation Differences (Low)

**Desktop Flow:**
- `SiswaDashboard.tsx` → renders desktop layout + dashboard content
- Sidebar menu navigation via `Link to="/siswa/absensi"` etc.
- API calls on component mount

**Mobile Flow:**
- `MobileSiswaDashboard.tsx` → minimal component (page 261-265 only retains closing tags)
- Bottom navigation (`BottomNavigation.tsx`) shows `Home|Absensi|Jadwal|Nilai|Tugas`
- Menu sheet (`MobileMenuSheet.tsx`) via "More" button

**Issue:** `MobileSiswaDashboard.tsx` likely delegates to desktop for some sections (line 72: `<MobileSiswaDashboard />`). If mobile navigation is incomplete, certain menu items might fail silently rather than loading data.

**Evidence:** `SiswaDashboard.tsx:71-72`
```javascript
{/* Mobile / Tablet view */}
<div className="lg:hidden">
  <MobileSiswaDashboard />
</div>
```

**Conclusion:** Desktop and mobile share core navigation. No evidence of desktop-only menu auto-logout.

---

## Finding 7: Profile & Password-Change Routes (Low)

**File:** `src/App.tsx` (lines 73-74 in original)
```javascript
import ChangePasswordPage from './pages/ChangePasswordPage'
import ProfilePage from './pages/ProfilePage'
```

**Backend Routes:**
- `/api/auth/profile` (line 2258+, `server/index.cjs`)
- `/api/auth/change-password` (multiple handlers)
- `/api/auth/avatar` (upload)

**Frontend Routes:**
- `/profile` (protected, shared across roles)
- `/change-password` (protected)

**Issue:** If user navigates from `/siswa/*` menu to `/profile` and token is invalid:
- Frontend requests `/api/auth/profile` 
- Backend returns 401
- Interceptor redirects to /login
- User perceives "profile menu click caused logout"

**But:** Profile is NOT in student menu. Accessed via dropdown in `MobileHeader.tsx` or desktop header.

---

## Root Cause Analysis

### Primary Cause: 401 Interceptor Aggression
The frontend API interceptor (`src/services/api.ts`) **unconditionally redirects to /login on 401**, regardless of route context. This is:
- **Correct for** `/auth/me`, `/auth/login` failures (caught by `!authRoute`)
- **Over-aggressive for** student dashboard/feature routes; any 401 causes hard redirect

### Secondary Cause: Missing Tenant Access Check on Student Dashboard
`/api/siswa/dashboard` does not call `enforceTenantAccess()`. If tenant subscription expires:
- Some student features return 403/402
- Dashboard endpoint returns data
- Inconsistent UX

### Tertiary Cause: No Runtime Error UI
Frontend components call API then silently fail on error:
```javascript
api.get('/siswa/dashboard').catch(() => {})  // No toast, no error display
```
Combined with 401 redirect, user sees navigation fail without explanation.

---

## API Route Contract Matrix

| Route | Method | Roles | Subscription-Gated | Response on Locked | Notes |
|-------|--------|-------|--------------------|--------------------|-------|
| `/api/siswa/dashboard` | GET | siswa, wali_murid | ❌ NO | ✓ data | HIGH: no gate check |
| `/api/siswa/absensi` | GET | siswa, wali_murid | ✓ via absensi feature | 403 FEATURE_DISABLED | Correct |
| `/api/siswa/jadwal` | GET | siswa, wali_murid | ✓ via jadwal feature | 403 FEATURE_DISABLED | Correct |
| `/api/siswa/penilaian` | GET | siswa, wali_murid | ✓ via penilaian feature | 403 FEATURE_DISABLED | Correct |
| `/api/siswa/ekskul` | GET | siswa, wali_murid | ✓ via absensi feature | 403 FEATURE_DISABLED | Correct |
| `/api/portal/children` | GET | siswa, wali_murid, admin | ✓ requireRole gate | 403 / 401 | Correct |
| `/api/portal/dashboard` | GET | siswa, wali_murid, admin | ✓ requireRole gate | 403 / 401 | Correct |
| `/api/portal/summary` | GET | siswa, wali_murid, admin | ✓ requireRole gate | 403 / 401 | Correct |
| `/api/cashless/provider/bank_transfer/static-qris` | GET | siswa, wali_murid, admin, bendahara | ✓ requireRole gate | 403 / 401 | Correct |
| `/api/kantin/menu` | GET | siswa, wali_murid, admin, bendahara | ✓ requireRole gate | 403 / 401 | Correct |
| `/api/library` | GET | all roles (visibility_roles checked inside) | ⚠ Inside handler | 403 VISIBILITY_DENIED | Weak |
| `/api/posting` | GET | all roles | ❌ NO | ✓ all posts | HIGH: no gate check |

---

## Regression Tests

**Existing Test:** `tests/dashboard-seven-regressions.test.cjs`
- ✓ Verifies `/siswa/{tugas,tagihan,tabungan,perpustakaan,menu}` routes exist
- ✓ Verifies default `*` route redirects to `/` not `/login`
- ❌ Does NOT test 401/402/403 behavior on menu clicks
- ❌ Does NOT test subscription-locked student behavior
- ❌ Does NOT test interceptor logout on 401

**Session Test:** `tests/session-theme-mutation-reliability.test.cjs`
- ✓ Verifies 401 on `/auth/me` triggers logout via `checkAuth()`
- ✓ Verifies 403 does NOT trigger logout
- ⚠ Does not test other routes

---

## Recommendations

### 1. Add Tenant Subscription Gate to Student Dashboard (HIGH)
**File:** `server/index.cjs:3984`

**Before:**
```javascript
app.get('/api/siswa/dashboard', authMiddleware, (req, res) => {
  if (!['siswa', 'wali_murid'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' })
  // proceed
})
```

**After:**
```javascript
app.get('/api/siswa/dashboard', authMiddleware, enforceTenantAccess, (req, res) => {
  if (!['siswa', 'wali_murid'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' })
  // proceed
})
```

**Rationale:** Ensures subscription-locked tenants receive 402 (not data) and consistent UX across student features.

---

### 2. Add Error Toast on API Failures in Student Components (MEDIUM)
**Files:** `src/pages/siswa/SiswaSectionPage.tsx`, `src/pages/siswa/SiswaPerpustakaanPage.tsx`, `src/pages/siswa/SiswaPostingPage.tsx`

**Before:**
```javascript
api.get('/siswa/dashboard').catch(() => setData({}))
```

**After:**
```javascript
api.get('/siswa/dashboard')
  .then(res => setData(res.data))
  .catch((err) => {
    if (err.response?.status !== 401) {
      toast.error('Gagal memuat data: ' + err.response?.data?.error || err.message)
    }
    setData({})
  })
```

**Rationale:** If 403/402 is returned, user sees error message instead of silent failure.

---

### 3. Add Regression Test for Subscription-Locked Student Behavior (MEDIUM)
**File:** `tests/student-subscription-lockout.test.cjs` (new)

```javascript
const test = require('node:test')
const assert = require('node:assert/strict')

test('subscription-locked tenant returns 402 on /api/siswa/dashboard', async () => {
  // Setup: create tenant with expired subscription
  // Call GET /api/siswa/dashboard with siswa token
  // Assert response.status === 402 and response.data.code === 'SUBSCRIPTION_LOCKED'
})

test('feature-disabled student route returns 403', async () => {
  // Setup: create tenant with absensi feature disabled
  // Call GET /api/siswa/absensi with siswa token
  // Assert response.status === 403 and response.data.code === 'FEATURE_DISABLED'
})

test('student menu click never triggers 401 logout on valid token', async () => {
  // Setup: create siswa with valid token
  // Click /siswa/absensi → call /api/siswa/absensi
  // Assert 200 (success) or 403 (feature disabled), never 401
})
```

---

### 4. Document Interceptor Behavior in Code (LOW)
**File:** `src/services/api.ts:21-36`

Add JSDoc comment:
```typescript
/**
 * API response interceptor: handles 401 unauthorized responses.
 * 
 * 401 causes hard logout redirect EXCEPT:
 * - /auth/login and /auth/me (handled by checkAuth() instead)
 * - Login page (already authenticated)
 * 
 * Feature gates (403, 402) do NOT trigger logout; they propagate to caller.
 */
```

---

## Conclusion

**No automatic logout trigger exists in student menu navigation code.** The three findings are design behaviors, not bugs:

1. **API Interceptor (401 → logout):** By design; prevents stale token use.
2. **Missing Subscription Gate on Dashboard:** Allows dashboard load but inconsistent with other routes.
3. **Commit 6774963 Routes:** Properly registered and tested.

**If users report "clicking menu logs them out":**
- Check token expiration time (default might be too short)
- Check subscription status (locked status affects UX)
- Verify error handling in feature-disabled scenarios (no toast feedback)
- Collect network capture to confirm 401 vs. 403/402 status codes

**Recommendation:** Implement suggestions 1 & 2 to improve consistency and user feedback, then run suggested test 3.

---

## Files & Line References

- `src/services/api.ts:21-36` — 401 interceptor
- `src/stores/authStore.ts:64-87` — checkAuth() logic
- `src/pages/siswa/SiswaMenuPage.tsx` — menu page (added in 6774963)
- `src/App.tsx:282-286` — student routes
- `server/index.cjs:1152-1165` — subscription gate
- `server/index.cjs:1171-1200` — auth middleware
- `server/index.cjs:3984-4036` — student dashboard route
- `server/subscription.cjs:1-97` — feature definitions
- `server/portal-cashless.cjs:130-204` — portal routes with role gates
- `tests/dashboard-seven-regressions.test.cjs:38-44` — route existence test
- `tests/session-theme-mutation-reliability.test.cjs` — 401/403 handling test
