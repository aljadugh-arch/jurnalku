'use strict'
// React memperingatkan (dan pada sebagian versi gagal merender) atribut SVG yang
// ditulis bergaris-hubung di JSX, mis. stroke-width. Yang benar camelCase:
// strokeWidth. Atribut dalam string (dokumen cetak / data-URL gambar) dikecualikan.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', 'src')
const ATTR_BERMASALAH = /(^|\s)(stroke-width|stroke-linecap|stroke-linejoin|stroke-dasharray|stroke-dashoffset|stroke-miterlimit|stroke-opacity|fill-rule|fill-opacity|clip-rule|stop-color|stop-opacity|text-anchor|pointer-events|shape-rendering|dominant-baseline|baseline-shift)=/

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else if (/\.tsx$/.test(e.name) && !e.name.includes('.bak')) out.push(p)
  }
  return out
}

test('atribut SVG di JSX memakai camelCase (bukan stroke-width)', () => {
  const pelanggar = []
  for (const f of walk(ROOT)) {
    const isi = fs.readFileSync(f, 'utf8')
    for (const m of isi.matchAll(/<svg\b[^>]*>/g)) {
      const tag = m[0]
      // Lewati SVG di dalam string/backtick (data-URL atau dokumen cetak).
      if (tag.includes('%22') || (tag.match(/"/g) || []).length > 20) continue
      const a = tag.match(ATTR_BERMASALAH)
      if (a) {
        const line = isi.slice(0, m.index).split('\n').length
        pelanggar.push(`${path.relative(ROOT, f)}:${line} (${a[2]})`)
      }
    }
  }
  assert.deepEqual(pelanggar, [], `atribut SVG bergaris-hubung di JSX: ${pelanggar.join(', ')}`)
})
