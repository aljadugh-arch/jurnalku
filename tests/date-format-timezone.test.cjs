const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadDateFormat() {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/dateFormat.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  const wrapper = vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Intl, Date })
  wrapper(name => name === 'xlsx' ? { SSF: { parse_date_code: () => null } } : require(name), module, module.exports)
  return module.exports
}

test('formatTanggal constructs date-only values at UTC noon before WIB formatting', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/dateFormat.ts'), 'utf8')
  assert.match(source, /Date\.UTC\([^\n]*,\s*12\)\)/)
  const { formatTanggal } = loadDateFormat()
  assert.equal(formatTanggal('2026-08-24'), '24 Agustus 2026')
})
