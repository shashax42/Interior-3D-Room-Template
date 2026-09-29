// Times the photoreal renderer on this machine at a given size and sample count, then saves the result
// (before and after denoising) so its quality can be judged.
//
//   node scripts/trace-bench.mjs <outDir> <presetIndex> <width> <samples>

import puppeteer from 'puppeteer-core'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [out = '.', preset = '2', width = '640', samples = '32'] = process.argv.slice(2)
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: mkdtempSync(join(tmpdir(), 'room-bench-')),
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
  defaultViewport: { width: 1400, height: 860 },
  protocolTimeout: 1800000,
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
page.on('console', (m) => m.type() === 'log' && m.text().startsWith('[bench]') && console.log(m.text()))
await page.goto(process.env.APP_URL ?? 'http://localhost:5178/', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => window.__dev?.useStore)
await page.evaluate(async (i) => {
  const { useStore } = window.__dev
  const mod = await import('/src/furniture/presets.ts')
  const s = useStore.getState()
  const room = s.project.room
  const p = mod.PRESETS[i].build(room)
  s.setProject({ ...s.project, photos: [], room: { ...room, ...p.room }, furniture: p.furniture.map((f, k) => ({ ...f, id: 'b' + k })) })
  s.setStep('tour')
}, Number(preset))
await page.waitForFunction(() => window.__view, { timeout: 60000 })
if (process.env.SKIP_DENOISE) await page.evaluate(() => (window.__skipDenoise = true))
await new Promise((r) => setTimeout(r, 6000))

const result = await page.evaluate(async (w, n) => {
  const pr = await import('/src/render/photoreal.ts')
  const dn = await import('/src/render/denoise.ts')
  const mat = await import('/src/scene/materials.ts')
  await mat.surfacesReady()
  const view = window.__view
  console.log('[bench] building scene')
  const scene = pr.buildTraceScene(view.scene, { daylight: 1.2 })
  let tris = 0
  scene.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 })
  console.log(`[bench] scene: ${scene.children.length} objects, ${Math.round(tris)} triangles`)
  const cam = view.camera.clone()
  const h = Math.round(w / cam.aspect)
  const t0 = performance.now()
  let last = -1
  setInterval(() => {
    const t = window.__tracer
    console.log(`[bench] alive ${((performance.now() - t0) / 1000).toFixed(0)}s samples=${t?.samples?.toFixed(2)} compiling=${t?.isCompiling} paused=${t?.pausePathTracing}`)
  }, 15000)
  const canvas = await new Promise((resolve, reject) => {
    const job = pr.startTrace({
      scene, camera: cam, width: w, height: h, samples: n,
      onProgress: (s) => { if (s !== last) { last = s; console.log(`[bench] ${s}/${n} samples, ${((performance.now() - t0) / 1000).toFixed(0)}s`) } },
      onDone: resolve, onError: reject,
    })
    // Show the render like the app does; a hidden canvas lets headless Chrome stop producing frames.
    Object.assign(job.canvas.style, { position: 'fixed', inset: '0', zIndex: '9999', width: '100%' })
    document.body.appendChild(job.canvas)
  })
  const traceSecs = (performance.now() - t0) / 1000
  const raw = canvas.toDataURL('image/jpeg', 0.9)
  let denoised = null
  let denoiseSecs = null
  if (!window.__skipDenoise) try {
    const t1 = performance.now()
    denoised = (await dn.denoiseCanvas(canvas)).toDataURL('image/jpeg', 0.9)
    denoiseSecs = (performance.now() - t1) / 1000
  } catch (e) {
    console.log('[bench] denoise failed: ' + e)
  }
  return { traceSecs, denoiseSecs, raw, denoised, size: [w, h] }
}, Number(width), Number(samples))

const save = (name, url) => url && writeFileSync(join(out, name), Buffer.from(url.split(',')[1], 'base64'))
save(`trace-${preset}-${width}-${samples}-raw.jpg`, result.raw)
save(`trace-${preset}-${width}-${samples}-denoised.jpg`, result.denoised)
console.log(`size ${result.size.join('x')}, trace ${result.traceSecs.toFixed(0)}s, denoise ${result.denoiseSecs?.toFixed(1) ?? 'n/a'}s`)
await browser.close()
