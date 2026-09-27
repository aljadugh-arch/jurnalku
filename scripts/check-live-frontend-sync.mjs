#!/usr/bin/env node

const domains = process.argv.slice(2)
const expectedPath = '/siswa/bulk-import'
const stalePath = '/api/siswa/bulk-import'

if (domains.length === 0) {
  console.error('Usage: node scripts/check-live-frontend-sync.mjs <domain> [...]')
  process.exit(2)
}

let failed = false

for (const domain of domains) {
  try {
    const origin = domain.startsWith('http') ? domain : `https://${domain}`
    const htmlResponse = await fetch(`${origin}/admin/data-siswa`, { redirect: 'follow' })
    if (!htmlResponse.ok) throw new Error(`HTML HTTP ${htmlResponse.status}`)
    const html = await htmlResponse.text()
    const mainAsset = html.match(/src="([^"']*\/assets\/index-[^"']+\.js)"/)?.[1]
    if (!mainAsset) throw new Error('main asset tidak ditemukan')

    const mainResponse = await fetch(new URL(mainAsset, origin))
    if (!mainResponse.ok) throw new Error(`main asset HTTP ${mainResponse.status}`)
    const mainJs = await mainResponse.text()
    const pageAssetName = mainJs.match(/DataSiswaPage-[A-Za-z0-9_-]+\.js/)?.[0]
    if (!pageAssetName) throw new Error('DataSiswaPage chunk tidak ditemukan')

    const pageResponse = await fetch(`${origin}/assets/${pageAssetName}`)
    if (!pageResponse.ok) throw new Error(`DataSiswaPage asset HTTP ${pageResponse.status}`)
    const pageJs = await pageResponse.text()
    const hasExpected = pageJs.includes(expectedPath)
    const hasStale = pageJs.includes(stalePath)

    if (!hasExpected || hasStale) {
      failed = true
      console.error(`FAIL ${domain}: chunk=${pageAssetName}, expected=${hasExpected}, stale=${hasStale}`)
    } else {
      console.log(`PASS ${domain}: ${pageAssetName} memakai ${expectedPath}`)
    }
  } catch (error) {
    failed = true
    console.error(`FAIL ${domain}: ${error.message}`)
  }
}

process.exit(failed ? 1 : 0)
