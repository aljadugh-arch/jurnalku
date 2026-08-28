const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')

const app = read('src/App.tsx')

const installPrompt = read('src/components/PwaInstallPrompt.tsx')
const developerPage = read('src/pages/admin/DeveloperApiPage.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')
const bottomNavigation = read('src/components/layout/BottomNavigation.tsx')
const menuItems = read('src/lib/menuItems.tsx')
const server = read('server/index.cjs')
const serviceWorker = read('public/sw.js')

test('aplikasi menangkap event instalasi dan menyediakan tombol install yang dipicu pengguna', () => {
  assert.match(installPrompt, /beforeinstallprompt/)
  assert.match(installPrompt, /appinstalled/)
  assert.match(installPrompt, /deferredPrompt\.prompt\(\)/)
  assert.match(installPrompt, /Menginstall/)
  assert.match(installPrompt, /disabled=\{installing\}/)
  assert.match(installPrompt, /Tambah ke Layar Utama/)
  assert.match(installPrompt, /navigator\.standalone/)
  assert.match(app, /<PwaInstallPrompt\s*\/>/)
})

test('manifest tenant memakai endpoint ikon persegi dengan ukuran yang benar', () => {
  assert.match(server, /\/api\/pwa\/icon\/192/)
  assert.match(server, /\/api\/pwa\/icon\/512/)
  assert.match(server, /sizes: '192x192'/)
  assert.match(server, /sizes: '512x512'/)
  assert.match(server, /purpose: 'any maskable'/)
  assert.match(server, /sharp\(/)
  assert.doesNotMatch(server, /sizes: '256x256'[\s\S]{0,100}sizes: '512x512'/)
})

test('service worker melakukan aktivasi segera dan tidak menyimpan respons API', () => {
  assert.match(serviceWorker, /self\.skipWaiting\(\)/)
  assert.match(serviceWorker, /self\.clients\.claim\(\)/)
  assert.match(serviceWorker, /pathname\.startsWith\('\/api\/'\)/)
})

test('halaman Developer API dapat dijangkau dari route dan menu admin', () => {
  assert.match(app, /path="developer-api"/)
  assert.match(app, /<DeveloperApiPage\s*\/>/)
  assert.match(sidebar, /REST API Developer.*\/admin\/developer-api/)
  assert.match(bottomNavigation, /REST API.*\/admin\/developer-api/)
  assert.match(menuItems, /REST API Developer.*\/admin\/developer-api/)
})

test('halaman Developer API mengelola key dan mendokumentasikan endpoint v1', () => {
  assert.match(developerPage, /api\.get\('\/external\/api-keys'/)
  assert.match(developerPage, /api\.post\('\/external\/api-keys'/)
  assert.match(developerPage, /api\.delete\(`\/external\/api-keys\/\$\{id\}`\)/)
  assert.match(developerPage, /X-API-Key/)
  assert.match(developerPage, /\/api\/external\/v1\/siswa/)
  assert.match(developerPage, /\/api\/external\/webhook\/cashless/)
  assert.match(developerPage, /API key hanya ditampilkan satu kali/)
})
