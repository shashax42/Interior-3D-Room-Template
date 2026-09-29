// Opens the app in a throwaway headless Chrome profile, lays out a preset, and saves screenshots of the realtime
// tour view and of the photoreal render. For checking what the renders actually look like.
//
//   node scripts/snap.mjs <outDir> [presetIndex=2] [samples]

import puppeteer from 'puppeteer-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2] ?? '.'
const preset = Number(process.argv[3] ?? 2)
const url = process.env.APP_URL ?? 'http://localhost:5178/'

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: mkdtempSync(join(tmpdir(), 'room-snap-')),
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1400,860'],
  defaultViewport: { width: 1400, height: 860 },
  // The path tracer keeps the page busy; give slow calls room.
  protocolTimeout: 900000,
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(url, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => window.__dev?.useStore)

await page.evaluate(async (i) => {
  const { useStore } = window.__dev
  const mod = await import('/src/furniture/presets.ts')
  const s = useStore.getState()
  const room = s.project.room
  const p = mod.PRESETS[i].build(room)
  s.setProject({ ...s.project, photos: [], room: { ...room, ...p.room }, furniture: p.furniture.map((f, k) => ({ ...f, id: 's' + k })) })
  s.setStep('tour')
}, preset)
await new Promise((r) => setTimeout(r, 6000))
await page.screenshot({ path: join(out, `realtime-${preset}.jpg`), quality: 85 })
console.log('realtime saved')
console.log('gpu:', await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2')
  const ext = gl?.getExtension('WEBGL_debug_renderer_info')
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
}))
if (process.env.SKIP_TRACE) {
  await browser.close()
  process.exit(0)
}

// Photoreal render of the same view.
await page.evaluate(() => [...document.querySelectorAll('.tour-bar button')].find((b) => b.textContent.includes('실사'))?.click())
const t0 = Date.now()
await page.waitForFunction(() => {
  const t = document.querySelector('.trace-progress span')?.textContent ?? ''
  return t.includes('완성') || t.includes('못했')
}, { timeout: 900000, polling: 4000 })
console.log('photoreal took', Math.round((Date.now() - t0) / 1000), 's:', await page.$eval('.trace-progress span', (e) => e.textContent))
const canvas = await page.$('.trace-canvas')
await canvas.screenshot({ path: join(out, `photoreal-${preset}.jpg`), quality: 90 })
console.log('photoreal saved')
await browser.close()
