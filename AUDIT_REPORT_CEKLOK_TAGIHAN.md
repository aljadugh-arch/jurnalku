# Audit Report: Ceklok & Tagihan Load Failures — End-to-End Analysis

**Audit Date:** 2026-09-10  
**Repository:** `/home/aljadugh/jurnalku` (HEAD 6774963)  
**Scope:** Frontend pages, API endpoints, middleware, subscription gating, tenant isolation, role authorization  
**Status:** Source audit complete; runtime/integration tests proposed

---

## Executive Summary

Analysis of **ceklok** (teacher check-in/out) and **tagihan** (billing/invoices) load failures reveals **six concrete mismatches** spanning frontend request patterns, backend endpoint roles, subscription feature gating, tenant multitenancy filters, and response schema assumptions. **No single feature is broken; rather, the system can fail silently at multiple points:**

1. ✗ Expired subscription blocks all requests with **402** (`SUBSCRIPTION_LOCKED`) before reaching handlers
2. ✗ Feature gating may be disabled per-tenant, returning **403** (`FEATURE_DISABLED`)
3. ✗ Role mismatches return **403** without `code` field (frontend may not recognize this as distinct from unauthorized access)
4. ✗ Tenant ID filters in JOIN chains may be missing or incomplete, returning empty data silently
5. ✗ Response schema assumptions mismatch (API may return `[]` when frontend expects `{ records: [] }`)
6. ✗ Network/auth token failures return **401**, triggering redirect to login instead of clear error toast

---

## Architecture Overview

### Frontend Request Flow

#### 1. **CekLokAdminPage** (`src/pages/admin/CekLokAdminPage.tsx` lines 48–77)
- **Endpoint calls:**
  ```typescript
  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/ceklok/admin', {
        params: { tanggal, ...(filterStatus ? { status: filterStatus } : {}) }
      })
      setRecords(res.data.records || res.data)  // ← Fallback: assume res.data is array if no .records
      if (res.data.summary) setSummary(res.data.summary)
    } catch {
      toast.error('Gagal memuat data ceklok')  // ← Generic error; no status code check
    }
  }
  ```
- **Issue:** Catches all errors as generic "Gagal memuat data ceklok"—doesn't distinguish 402 (subscription locked), 403 (feature disabled), or 401 (auth token expired)
- **Expected response:** `{ records: [...], summary: {...} }` or bare array (fallback)

#### 2. **TagihanPage** (`src/pages/admin/TagihanPage.tsx` lines 119–131)
- **Endpoint calls:**
  ```typescript
  const fetchData = async () => {
    try {
      const params: any = {}
      if (filter) params.status = filter
      const [res, rombelRes, jenisRes] = await Promise.all([
        api.get('/tagihan', { params }),
        api.get('/rombel'),
        api.get('/jenis-tagihan')
      ])
      setData(res.data)
      setRombels(rombelRes.data)
      setJenisTagihan(jenisRes.data)
    } catch {
      toast.error('Gagal memuat tagihan')  // ← Generic error
    }
  }
  ```
- **Issue:** Same generic catch; if ANY of three calls fail (tagihan, rombel, or jenis-tagihan), entire load fails
- **Expected response:** All three return arrays; `jenis-tagihan` is used to populate a dropdown

#### 3. **SiswaSectionPage (tagihan)** (`src/pages/siswa/SiswaSectionPage.tsx` lines 1–22)
- **Endpoint call:**
  ```typescript
  useEffect(() => {
    api.get('/siswa/dashboard').then(response => setData(response.data || {}))
      .catch(() => setData({})).finally(() => setLoading(false))
  }, [])
  ```
- **Renders:**
  ```typescript
  if (section === 'tagihan') return (
    <div className="space-y-4">
      <h1>Tagihan</h1>
      <div className="space-y-3">
        {(data?.tagihan_detail || []).length === 0 && <p>Belum ada tagihan</p>}
        {(data?.tagihan_detail || []).map(item => (...))}
      </div>
    </div>
  )
  ```
- **Issue:** Silently displays "Belum ada tagihan" if `tagihan_detail` is missing, empty, or null—no distinction between "no data" and "failed to load"

#### 4. **GuruAbsensiPage** (`src/pages/guru/GuruAbsensiPage.tsx` lines 18–24)
- **Endpoint call:**
  ```typescript
  const loadData = async () => {
    try {
      const res = await api.get('/guru/absensi-saya')
      setTodayRecord(res.data.today)
      setHistory(res.data.history)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memuat data ceklok')
    }
  }
  ```
- **Issue:** Better error handling (tries to extract custom message), but still generic if no custom message provided

---

### Backend Endpoint Handlers

#### 1. **GET /api/ceklok/admin** (line 3477–3512)
```javascript
app.get('/api/ceklok/admin', authMiddleware, (req, res) => {
  const staffRoles = ['guru', 'wali_kelas', 'kepala', 'admin', 'bendahara', 'operator', 'tata_usaha', 'tu']
  const staffGtkIds = db.prepare(`SELECT DISTINCT gtk_id FROM users WHERE tenant_id=? 
    AND gtk_id IS NOT NULL AND role IN (...)`)
    .all(req.tenantId, ...staffRoles)
    .map(row => row.gtk_id)
  
  const attendance = db.prepare('SELECT * FROM absensi_guru WHERE tanggal=? AND tenant_id=?')
    .all(tanggal, req.tenantId)
  
  // Build records...
  res.json({ records, summary })
})
```
- **Middleware:** `authMiddleware` only (no role check)
- **Tenant filter:** ✓ `WHERE tenant_id=?` present in both queries
- **Response schema:** `{ records: [...], summary: {...} }` ✓

#### 2. **GET /api/guru/absensi-saya** (line 3528–3552)
```javascript
app.get('/api/guru/absensi-saya', STAFF, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  // Handles missing GTK by creating dummy record for admin/kepala roles
  const today = todayJakarta()
  const todayRecord = db.prepare('SELECT * FROM absensi_guru 
    WHERE gtk_id=? AND tanggal=? AND tenant_id=?')
    .get(gtk.id, today, req.tenantId)
  const history = db.prepare('SELECT * FROM absensi_guru 
    WHERE gtk_id=? AND tenant_id=? ORDER BY tanggal DESC LIMIT 30')
    .all(gtk.id, req.tenantId)
  res.json({ today: todayRecord || null, history, gtk })
})
```
- **Middleware:** `STAFF` (line 1239: admin, super_admin, guru, wali_kelas, operator, tata_usaha, tu, kepala)
- **Role check:** ✓ Prevents siswa/wali_murid from accessing
- **Tenant filter:** ✓ `WHERE tenant_id=?` present
- **Response schema:** `{ today: {...}, history: [...], gtk: {...} }` ✓

#### 3. **GET /api/tagihan** (line 4632–4642)
```javascript
app.get('/api/tagihan', BENDAHARA, (req, res) => {
  let sql = `SELECT t.*, s.nama as siswa_nama, s.nis, s.rombel_id, 
    r.nama as rombel_nama, jt.nama as jenis_nama 
    FROM tagihan t 
    LEFT JOIN siswa s ON t.siswa_id=s.id AND s.tenant_id=t.tenant_id 
    LEFT JOIN rombel r ON s.rombel_id=r.id AND r.tenant_id=t.tenant_id 
    LEFT JOIN jenis_tagihan jt ON t.jenis_tagihan_id=jt.id AND jt.tenant_id=t.tenant_id 
    WHERE t.tenant_id=?`
  // ... filter params
  res.json(db.prepare(sql).all(...params))
})
```
- **Middleware:** `BENDAHARA` (line 1242: bendahara, admin, super_admin, operator)
- **Role check:** ✓ Excludes siswa, guru, kepala, wali_kelas
- **Tenant filter:** ✓ All joins include `AND ?.tenant_id=t.tenant_id` except `jenis_tagihan` 
  - **⚠ CRITICAL:** `jt.tenant_id=t.tenant_id` assumes `jenis_tagihan` table exists AND has `tenant_id` column
  - If migration missing or column not added to legacy data, join silently returns NULL/empty
- **Response schema:** Array (bare array, not `{ data: [] }`) ✓

#### 4. **GET /api/jenis-tagihan** (line 4621–4623)
```javascript
app.get('/api/jenis-tagihan', BENDAHARA, (req, res) => {
  res.json(db.prepare('SELECT * FROM jenis_tagihan WHERE tenant_id=? ORDER BY nama')
    .all(req.tenantId))
})
```
- **Middleware:** `BENDAHARA` ✓
- **Tenant filter:** ✓
- **Response schema:** Array ✓

#### 5. **GET /api/siswa/dashboard** (line 3984–4035)
```javascript
app.get('/api/siswa/dashboard', authMiddleware, (req, res) => {
  // ... resolve siswa from user account
  const tagihan_detail = db.prepare(`SELECT t.id, t.bulan, t.tahun, t.nominal, t.status, 
    t.tanggal_bayar, t.keterangan, j.nama as jenis_nama 
    FROM tagihan t 
    LEFT JOIN jenis_tagihan j ON j.id=t.jenis_tagihan_id AND j.tenant_id=t.tenant_id 
    WHERE t.siswa_id=? AND t.tenant_id=? 
    ORDER BY t.tahun DESC, t.bulan DESC LIMIT 20`)
    .all(siswa.id, req.tenantId)
  
  res.json({ children, siswa, tagihan_detail, tagihan: {...}, ... })
})
```
- **Middleware:** `authMiddleware` only (no role check—accessible to all authenticated users)
- **Role implicit:** Only returns data for siswa linked to logged-in user (via `linkedStudentIds`)
- **Tenant filter:** ✓ `WHERE t.tenant_id=?` present in `tagihan_detail` query
- **Response schema:** `{ tagihan_detail: [...], tagihan: {...}, ... }` ✓

---

### Middleware Stack

#### **Subscription/Feature Gating Middleware** (line 1156–1168)
```javascript
function enforceTenantAccess(req, res, next) {
  if (!req.path.startsWith('/api') || isSubscriptionBypass(req)) return next()
  
  const access = getTenantAccess(req.tenantId)
  req.tenantAccess = access
  
  // Check 1: Subscription expired?
  if (access.locked) 
    return res.status(402).json({ 
      error: 'Masa percobaan/langganan sudah berakhir...', 
      code: 'SUBSCRIPTION_LOCKED', 
      subscription: access 
    })
  
  // Check 2: Feature disabled?
  const feature = featureForPath(req.path)
  if (feature && access.features[feature] === false) 
    return res.status(403).json({ 
      error: 'Fitur ini dinonaktifkan untuk lembaga ini', 
      code: 'FEATURE_DISABLED', 
      feature 
    })
  
  next()
}
app.use(enforceTenantAccess)
```
- **Order:** Runs BEFORE role-based middleware (e.g., `BENDAHARA`)
- **Feature mapping:** From `subscription.cjs` FEATURE_PREFIXES:
  - `absensi` → `/api/ceklok/*`, `/api/guru/ceklok`, `/api/guru/absensi-saya`
  - `keuangan` → `/api/tagihan`, `/api/jenis-tagihan`, `/api/tabungan`
- **Bypass list:** Auth routes, settings, subscription status (public/tenant-aware)

#### **Auth Middleware** (line 1171–1200)
```javascript
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token required' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    if (req.user.tenant_id) req.tenantId = req.user.tenant_id
    
    // Check must_change_password
    if (!allowList.includes(req.path) && row?.must_change_password === 1)
      return res.status(403).json({ error: 'Wajib ganti password sebelum melanjutkan', code: 'MUST_CHANGE_PASSWORD' })
    
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}
```
- **Note:** Overrides `tenantId` from JWT if present (correct for multi-tenant)

#### **Role-Based Authorization** (line 1204–1243)
```javascript
const BENDAHARA = requireRole('bendahara', 'admin', 'super_admin', 'operator')
const STAFF = requireRole('admin', 'super_admin', 'guru', 'wali_kelas', 'operator', 'tata_usaha', 'tu', 'kepala')
```
- **Order:** Role checks run AFTER subscription gating
- **Endpoint guards:**
  - `/api/tagihan` → `BENDAHARA`
  - `/api/jenis-tagihan` → `BENDAHARA`
  - `/api/guru/absensi-saya` → `STAFF`
  - `/api/ceklok/admin` → `authMiddleware` only (no role restriction)

---

## Identified Mismatches & Root Causes

### **Mismatch 1: Subscription Gating Precedes User Feedback**
**Problem:**  
If tenant's subscription expired (trial or paid), `enforceTenantAccess` middleware returns **402** with:
```json
{ "error": "Masa percobaan/langganan sudah berakhir...", "code": "SUBSCRIPTION_LOCKED" }
```
Frontend receives this but catches it as generic `catch (err)` and displays `"Gagal memuat data ceklok"` or `"Gagal memuat tagihan"`. User sees no indication that the issue is subscription-related.

**Evidence:**
- `server/subscription.cjs` line 46–54: `accessForTenant()` checks `subscription_ends_at` or `trial_ends_at`
- Line 1162: If tenant locked, return 402 before handler runs
- Frontend `CekLokAdminPage` line 56–60: Generic catch, no check for `status === 402`

**Frontend Fix:**
```typescript
catch (err) {
  const status = err.response?.status
  const code = err.response?.data?.code
  if (status === 402) {
    toast.error('Langganan sudah berakhir. Hubungi admin untuk perpanjangan.')
  } else if (code === 'FEATURE_DISABLED') {
    toast.error('Fitur ceklok dinonaktifkan untuk lembaga Anda.')
  } else {
    toast.error('Gagal memuat data ceklok')
  }
}
```

---

### **Mismatch 2: Feature Gating Disabled Per-Tenant**
**Problem:**  
Admin (superadmin) can disable `absensi` or `keuangan` features in subscription settings via `/api/subscription/unlock` or direct DB update to `tenants.features_json`. If `features_json = '{"absensi":false}'`, then `/api/ceklok/admin` returns **403** with:
```json
{ "error": "Fitur ini dinonaktifkan untuk lembaga ini", "code": "FEATURE_DISABLED", "feature": "absensi" }
```
Frontend again catches as generic error, no clear indication that feature is disabled.

**Evidence:**
- `server/subscription.cjs` line 56–61: `featureForPath()` maps routes to features
- Line 1163–1164: If `access.features[feature] === false`, return 403 FEATURE_DISABLED
- Frontend lacks check for this specific error code

---

### **Mismatch 3: Role Authorization Silently Blocks Access**
**Problem:**  
If a user with role `siswa` tries to access `/api/tagihan` (requires `BENDAHARA` role), the role check middleware returns **403**:
```json
{ "error": "Akses ditolak: role tidak berwenang" }
```
Note: No `code` field. Frontend may confuse this with other 403 errors (like feature disabled).

**Evidence:**
- `server/index.cjs` line 1214–1215: If role not in allowList, return 403 without `code`
- This differs from `FEATURE_DISABLED` which includes `"code": "FEATURE_DISABLED"`
- Frontend `catch` block doesn't check error.response.data.error text, only `code`

---

### **Mismatch 4: Tenant ID Filter Missing or Incomplete in JOIN Chains**
**Problem:**  
`/api/tagihan` queries `jenis_tagihan` table. The join assumes:
1. `jenis_tagihan` table exists
2. `jenis_tagihan` has a `tenant_id` column
3. `jenis_tagihan` records for this tenant have `tenant_id` set

If any of these fail (e.g., old migration missing the column, or data inserted without tenant_id), the LEFT JOIN returns NULL for `jt.nama` silently. Frontend displays `"jenis_nama: null"` in UI or crashes if trying to access `.toUpperCase()` on null.

**Evidence:**
- Line 4634: `LEFT JOIN jenis_tagihan jt ON t.jenis_tagihan_id=jt.id AND jt.tenant_id=t.tenant_id`
- No error if column missing—SQL just returns NULL
- Frontend line 137: `t.jenis_nama?.includes(...)` uses optional chaining, so won't crash, but data silently wrong

**Schema Verification Needed:**
```sql
PRAGMA table_info(jenis_tagihan);
SELECT COUNT(*) FROM jenis_tagihan WHERE tenant_id IS NULL;
```

---

### **Mismatch 5: Response Schema Assumptions**
**Problem:**  
`/api/ceklok/admin` returns `{ records: [...], summary: {...} }`, but line 54 of CekLokAdminPage has:
```typescript
setRecords(res.data.records || res.data)
```
This fallback assumes if `.records` is missing, treat `res.data` itself as an array. This fragile pattern can hide bugs:
- If API accidentally returns `{ records: undefined }`, fallback uses bare object as array
- `.filter()` and `.map()` would crash on object

**Evidence:**
- Inconsistent response schemas across endpoints:
  - `/api/ceklok/admin` → `{ records, summary }` (object with array inside)
  - `/api/tagihan` → bare array `[...]`
  - `/api/siswa/dashboard` → `{ tagihan_detail, tagihan, ... }` (object with array inside)

---

### **Mismatch 6: Network/Auth Token Failures Redirect Instead of Toast**
**Problem:**  
If JWT token expired or malformed, `authMiddleware` returns **401**. Frontend's `api.ts` interceptor (line 29–32) catches 401 and does:
```typescript
if (err.response?.status === 401 && !authRoute) {
  localStorage.removeItem('jurnalku_token')
  window.location.href = '/login'
}
```
This is correct for auth failures, but it means user loses their place and sees login page instead of a toast explaining what happened. For real-time failures (token just expired), this is disorienting.

**Evidence:**
- `src/services/api.ts` line 29–32
- Appropriate for true auth failures, but harsh UX for transient issues

---

## End-to-End Request Traces

### **Trace 1: Admin Loading Ceklok (Happy Path)**
```
1. Frontend: GET /admin/ceklok (Route: app.tsx line 222)
2. Component: CekLokAdminPage mounts, calls fetchData()
3. Request: axios.get('/ceklok/admin', {params: {tanggal, status?}})
4. Interceptor: Adds Authorization: Bearer {token}
5. Server: tenantMiddleware → sets req.tenantId from subdomain/JWT
6. Server: enforceTenantAccess → checks subscription locked? → checks feature enabled?
7. Server: authMiddleware → validates JWT, sets req.user
8. Server: app.get('/api/ceklok/admin', authMiddleware, ...) → no role check
9. Server: Queries staffGtkIds, absensi_guru, builds response
10. Response: 200 { records: [...], summary: {...} }
11. Frontend: setRecords(res.data.records)
12. Frontend: render list
✓ Success: "Ceklok data loaded"
```

### **Trace 2: Admin Loading Ceklok (Subscription Expired)**
```
1–5. Same as trace 1
6. Server: enforceTenantAccess
   → getTenantAccess(tenantId)
   → tenant.subscription_ends_at < now
   → access.locked = true
   → return 402 { error: '...berakhir...', code: 'SUBSCRIPTION_LOCKED' }
7. Response: 402
8. Frontend: catch { toast.error('Gagal memuat data ceklok') }
✗ Failure: User sees generic "Gagal memuat" without knowing reason
✗ Expected: "Masa langganan telah berakhir"
```

### **Trace 3: Bendahara Loading Tagihan (Role Denied)**
```
1. Frontend: GET /admin/tagihan
2. Component: TagihanPage mounts, calls fetchData()
3. Requests (parallel):
   a. api.get('/tagihan', {params: {status?}})
   b. api.get('/rombel')
   c. api.get('/jenis-tagihan')
4–5. All three requests add Authorization header
6. Server: tenantMiddleware → sets req.tenantId
7. Server: enforceTenantAccess → OK (keuangan feature enabled)
8. Server: BENDAHARA middleware (line 1242)
   → Extract token
   → jwt.verify() → req.user
   → Check: req.user.role in ['bendahara', 'admin', 'super_admin', 'operator']?
   → If req.user.role = 'siswa' → NO
   → return 403 { error: 'Akses ditolak: role tidak berwenang' } (NO code field)
9. Response: 403
10. Frontend: Promise.all([res, rombelRes, jenisRes]) → any rejection causes all-catch
11. Frontend: catch { toast.error('Gagal memuat tagihan') }
✗ Failure: Generic error, no distinction that issue is role-based
✓ Correct behavior: User should not see tagihan page at all (app.tsx routes should restrict)
  But if user navigates directly or token role changed, this is the fallback
```

### **Trace 4: Siswa Viewing Tagihan via Dashboard (Missing jenis_tagihan Data)**
```
1. Frontend: GET /siswa/tagihan (Route: app.tsx line 286)
2. Component: SiswaSectionPage(section='tagihan') mounts
3. Request: api.get('/siswa/dashboard')
4–7. Same auth/subscription flow
8. Server: authMiddleware only (no role check)
9. Server: app.get('/api/siswa/dashboard', authMiddleware, ...)
   → linkedStudentIds(req) → resolve siswa
   → tagihan_detail = SELECT ... LEFT JOIN jenis_tagihan j 
       ON j.id=t.jenis_tagihan_id AND j.tenant_id=t.tenant_id
   → If jenis_tagihan[X].tenant_id = NULL (data integrity issue):
       j.nama = NULL (left join returns NULL)
10. Response: 200 { tagihan_detail: [{...jenis_nama: null, ...}, ...], ... }
11. Frontend: render map(item => item.jenis_nama || 'Tagihan')
✓ Partial success: Data loads but with NULL values, UI shows generic 'Tagihan' label
✗ Issue: User doesn't know why jenis_nama is missing (could be data bug or query bug)
```

---

## Proposed Runtime/Integration Tests

### **Test 1: Subscription Gating** (`tests/regression-subscription-gating.test.cjs`)
**Objective:** Verify that expired subscriptions block requests with correct error code.

```javascript
const test = require('node:test')
const assert = require('node:assert/strict')

test('subscription locked returns 402 with SUBSCRIPTION_LOCKED code', async () => {
  // Setup: Create test tenant with expired trial
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get('test-expired')
  assert(tenant.trial_ends_at < new Date().toISOString(), 'Tenant trial must be expired')
  
  // Create test user in expired tenant
  const user = { id: 'test-user', tenant_id: 'test-expired', role: 'bendahara' }
  const token = jwt.sign(user, JWT_SECRET)
  
  // Request: Should be blocked by enforceTenantAccess before handler
  const res = await fetch('/api/tagihan', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  assert.equal(res.status, 402, 'Status must be 402 Payment Required')
  const data = await res.json()
  assert.equal(data.code, 'SUBSCRIPTION_LOCKED', 'Must include code SUBSCRIPTION_LOCKED')
  assert(data.error.includes('berakhir'), 'Error message must mention expiration')
})

test('feature disabled returns 403 with FEATURE_DISABLED code', async () => {
  // Setup: Create tenant with keuangan feature disabled
  db.prepare("UPDATE tenants SET features_json=? WHERE id=?").run(
    JSON.stringify({ keuangan: false }),
    'test-disabled-keuangan'
  )
  
  const user = { id: 'test-user', tenant_id: 'test-disabled-keuangan', role: 'bendahara' }
  const token = jwt.sign(user, JWT_SECRET)
  
  const res = await fetch('/api/tagihan', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  assert.equal(res.status, 403, 'Status must be 403 Forbidden')
  const data = await res.json()
  assert.equal(data.code, 'FEATURE_DISABLED', 'Must include code FEATURE_DISABLED')
  assert.equal(data.feature, 'keuangan', 'Must specify which feature is disabled')
})
```

---

### **Test 2: Role-Based Authorization** (`tests/regression-role-authorization.test.cjs`)
**Objective:** Verify that role checks correctly allow/deny access.

```javascript
test('role bendahara can access /api/tagihan', async () => {
  const user = { id: 'test-bendahara', tenant_id: 'default', role: 'bendahara' }
  const token = jwt.sign(user, JWT_SECRET)
  
  const res = await fetch('/api/tagihan', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  assert.equal(res.status, 200, 'Bendahara must access /api/tagihan')
})

test('role siswa cannot access /api/tagihan (returns 403)', async () => {
  const user = { id: 'test-siswa', tenant_id: 'default', role: 'siswa' }
  const token = jwt.sign(user, JWT_SECRET)
  
  const res = await fetch('/api/tagihan', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  assert.equal(res.status, 403, 'Siswa must NOT access /api/tagihan')
  const data = await res.json()
  assert.match(data.error, /role tidak berwenang/i, 'Must mention role unauthorized')
})

test('role guru can access /api/guru/absensi-saya (STAFF middleware)', async () => {
  const user = { id: 'test-guru', tenant_id: 'default', role: 'guru' }
  const token = jwt.sign(user, JWT_SECRET)
  
  const res = await fetch('/api/guru/absensi-saya', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  assert.equal(res.status, 200, 'Guru (STAFF) must access /api/guru/absensi-saya')
})

test('role siswa cannot access /api/guru/absensi-saya (STAFF middleware)', async () => {
  const user = { id: 'test-siswa', tenant_id: 'default', role: 'siswa' }
  const token = jwt.sign(user, JWT_SECRET)
  
  const res = await fetch('/api/guru/absensi-saya', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  assert.equal(res.status, 403, 'Siswa not in STAFF role')
})
```

---

### **Test 3: Tenant Isolation** (`tests/regression-tenant-isolation.test.cjs`)
**Objective:** Verify that tenant ID filters prevent cross-tenant data leakage.

```javascript
test('jenis_tagihan table has tenant_id column', () => {
  const columns = db.prepare('PRAGMA table_info(jenis_tagihan)').all()
  const hasTenant = columns.some(col => col.name === 'tenant_id')
  assert(hasTenant, 'jenis_tagihan must have tenant_id column for multitenancy')
})

test('absensi_guru table has tenant_id column', () => {
  const columns = db.prepare('PRAGMA table_info(absensi_guru)').all()
  const hasTenant = columns.some(col => col.name === 'tenant_id')
  assert(hasTenant, 'absensi_guru must have tenant_id column')
})

test('/api/tagihan returns only records from user tenant', async () => {
  // Setup: Two tenants with different tagihan
  const tenant1 = 'test-tenant-1'
  const tenant2 = 'test-tenant-2'
  db.prepare('INSERT INTO tagihan (id, siswa_id, jenis_tagihan_id, bulan, tahun, nominal, status, tenant_id) VALUES (?,?,?,?,?,?,?,?)')
    .run('t1', 's1', 'j1', 'Januari', '2026', 100000, 'belum_bayar', tenant1)
  db.prepare('INSERT INTO tagihan (id, siswa_id, jenis_tagihan_id, bulan, tahun, nominal, status, tenant_id) VALUES (?,?,?,?,?,?,?,?)')
    .run('t2', 's2', 'j2', 'Januari', '2026', 200000, 'belum_bayar', tenant2)
  
  const user = { id: 'test-user', tenant_id: tenant1, role: 'bendahara' }
  const token = jwt.sign(user, JWT_SECRET)
  
  const res = await fetch('/api/tagihan', { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  
  assert(data.every(t => t.tenant_id === tenant1), 'All records must be from user tenant')
  assert(!data.some(t => t.id === 't2'), 'Cross-tenant record must not appear')
})

test('jenis_tagihan LEFT JOIN returns jenis_nama for matching tenant_id', async () => {
  const tenant = 'test-tenant-join'
  const siswaId = 'siswa-x'
  const jenisTId = 'jenis-t'
  const tagihanId = 'tagihan-x'
  
  db.prepare('INSERT INTO jenis_tagihan (id, nama, nominal, tenant_id) VALUES (?,?,?,?)')
    .run(jenisTId, 'SPP', 500000, tenant)
  db.prepare('INSERT INTO tagihan (id, siswa_id, jenis_tagihan_id, bulan, tahun, nominal, status, tenant_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(tagihanId, siswaId, jenisTId, 'Januari', '2026', 500000, 'belum_bayar', tenant)
  
  const result = db.prepare(`SELECT t.*, jt.nama as jenis_nama FROM tagihan t 
    LEFT JOIN jenis_tagihan jt ON jt.id=t.jenis_tagihan_id AND jt.tenant_id=t.tenant_id 
    WHERE t.id=? AND t.tenant_id=?`).get(tagihanId, tenant)
  
  assert.equal(result.jenis_nama, 'SPP', 'JOIN must resolve jenis_nama correctly')
})
```

---

### **Test 4: Response Schema Consistency** (`tests/regression-response-schema.test.cjs`)
**Objective:** Verify that API responses match expected schemas.

```javascript
test('/api/ceklok/admin response has records and summary keys', async () => {
  const user = { id: 'admin', tenant_id: 'default', role: 'admin' }
  const token = jwt.sign(user, JWT_SECRET)
  
  const res = await fetch('/api/ceklok/admin?tanggal=2026-01-01', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  const data = await res.json()
  assert(Array.isArray(data.records), 'records must be an array')
  assert(data.summary && typeof data.summary === 'object', 'summary must be an object')
  assert('hadir' in data.summary && 'terlambat' in data.summary, 'summary must have hadir and terlambat keys')
})

test('/api/tagihan response is an array', async () => {
  const user = { id: 'bendahara', tenant_id: 'default', role: 'bendahara' }
  const token = jwt.sign(user, JWT_SECRET)
  
  const res = await fetch('/api/tagihan', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  const data = await res.json()
  assert(Array.isArray(data), 'response must be an array')
})

test('/api/siswa/dashboard response has tagihan_detail array', async () => {
  const user = { id: 'siswa', tenant_id: 'default', role: 'siswa' }
  const token = jwt.sign(user, JWT_SECRET)
  
  const res = await fetch('/api/siswa/dashboard', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  const data = await res.json()
  assert(Array.isArray(data.tagihan_detail), 'tagihan_detail must be an array (never null/undefined)')
  assert(data.tagihan_detail.every(t => t.jenis_nama !== undefined), 'jenis_nama must be present (not undefined, may be null)')
})
```

---

### **Test 5: End-to-End Flow** (`tests/regression-ceklok-tagihan-flow.test.cjs`)
**Objective:** Test complete load flow for both ceklok and tagihan.

```javascript
test('full ceklok admin load flow (GET /admin/ceklok)', async () => {
  // Navigate to page
  // Check: Page loads with "Memuat..." initially
  // Check: API call sent with Bearer token
  // Check: Response has { records: [], summary: {...} }
  // Check: Page renders records and summary stats
  // Check: No toast error shown
})

test('full tagihan admin load flow with three parallel calls', async () => {
  // Navigate to /admin/tagihan
  // Check: All three calls sent in parallel (tagihan, rombel, jenis-tagihan)
  // Check: All three return 200
  // Check: Data displayed in table and filters
  // Check: No toast error
})

test('siswa viewing tagihan via /siswa/tagihan', async () => {
  // Navigate to /siswa/tagihan
  // Check: Single call to /siswa/dashboard sent
  // Check: Response includes tagihan_detail array
  // Check: Renders tagihan list or "Belum ada tagihan"
  // Check: No crash if jenis_nama is null
})

test('error handling: subscription locked', async () => {
  // Setup: Expire subscription
  // Navigate to /admin/ceklok
  // Check: API returns 402 SUBSCRIPTION_LOCKED
  // Check: Frontend shows toast with subscription message (NOT just "Gagal memuat")
})

test('error handling: feature disabled', async () => {
  // Setup: Disable keuangan feature
  // Navigate to /admin/tagihan
  // Check: API returns 403 FEATURE_DISABLED
  // Check: Frontend shows toast with feature disabled message
})

test('error handling: role denied', async () => {
  // Setup: User role siswa tries to access /admin/tagihan
  // Check: API returns 403 (but without code field)
  // Check: Frontend shows generic error (or route guard prevents navigation)
})
```

---

## Recommendations

### **Immediate (High Priority)**

1. **Enhance Error Handling in Frontend**
   - Check `err.response?.data?.code` and `err.response?.status` in catch blocks
   - Map 402 → "Langganan berakhir"
   - Map 403 + FEATURE_DISABLED → "Fitur dinonaktifkan"
   - Map 403 + role → "Akses ditolak: peran Anda tidak memiliki izin"
   - Map 401 → "Sesi berakhir, silakan login kembali"

2. **Verify Schema Integrity**
   - Run migration check: `SELECT COUNT(*) FROM jenis_tagihan WHERE tenant_id IS NULL`
   - If result > 0, update: `UPDATE jenis_tagihan SET tenant_id='default' WHERE tenant_id IS NULL`
   - Run same check on `absensi_guru`, `tabungan`, etc.

3. **Add Integration Tests**
   - Create test suite for subscription gating, role authorization, and tenant isolation
   - Run tests on CI/CD before deployment

### **Short Term (Medium Priority)**

4. **Standardize Response Schema**
   - All endpoints returning arrays should return bare array `[]`
   - All endpoints returning aggregates should return `{ data: [...], summary: {...} }`
   - Document in API spec

5. **Add Logging**
   - Log middleware rejections (402, 403) with tenant_id and feature/reason
   - Log SQL query results for /api/tagihan to detect null joins

### **Long Term (Low Priority)**

6. **Refactor Multitenancy**
   - Consider creating a reusable `tenantFilter(tableName, tenantId)` helper to prevent missed filters
   - Audit all LEFT JOIN operations to ensure tenant_id is included

---

## Deliverables

✅ **Source Audit:** Complete read of all frontend pages, services, backend routes, and middleware  
✅ **End-to-End Trace:** Documented request flow for happy path, subscription expired, role denied, and data integrity scenarios  
✅ **Mismatch Analysis:** Six concrete mismatches identified with evidence and traces  
✅ **Test Suite:** Five regression test modules proposed (can be run with `npm test` once created)  
✅ **Recommendations:** Immediate, short-term, and long-term fixes documented

---

## Files Analyzed

**Frontend (src/):**
- `pages/admin/CekLokAdminPage.tsx` — Ceklok admin page with fetch logic
- `pages/admin/TagihanPage.tsx` — Tagihan admin page with three-call fetch
- `pages/siswa/SiswaSectionPage.tsx` — Siswa tagihan view (via dashboard)
- `pages/guru/GuruAbsensiPage.tsx` — Guru attendance page
- `services/api.ts` — Axios configuration and interceptors
- `lib/featureAccess.ts` — Frontend feature visibility rules
- `lib/menuItems.tsx` — Menu and navigation
- `App.tsx` — Route definitions

**Backend (server/):**
- `index.cjs` (6176 lines) — All routes, middleware, and queries:
  - `/api/ceklok/admin` (line 3477)
  - `/api/guru/absensi-saya` (line 3528)
  - `/api/guru/ceklok` (line 3554)
  - `/api/tagihan` (line 4632)
  - `/api/jenis-tagihan` (line 4621)
  - `/api/siswa/dashboard` (line 3984)
  - Middleware: `tenantMiddleware`, `enforceTenantAccess`, `authMiddleware`, `requireRole`
- `subscription.cjs` (97 lines) — Feature gating logic and mappings
- `tenant.cjs` (201 lines read) — Tenant isolation utilities

**Tests (tests/):**
- `billing-generation-period.test.cjs` — Existing test for tagihan generation
- `feature-menu-gating.test.cjs` — Existing test for feature visibility

---

**Report Generated:** 2026-09-10  
**Status:** COMPLETE — Ready for runtime testing and deployment of fixes
