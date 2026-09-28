/** Photo looks applied on top of the 3D view (and baked into saved pictures). */
export type Look = { id: string; name: string; css: string; vignette: number }

export const LOOKS: Look[] = [
  { id: 'none', name: '원본', css: 'none', vignette: 0 },
  { id: 'film', name: '따뜻한 필름', css: 'sepia(0.14) saturate(0.95) contrast(0.98) brightness(0.99)', vignette: 0.28 },
  { id: 'pastel', name: '파스텔', css: 'saturate(0.78) contrast(0.88) brightness(1.08) hue-rotate(-6deg)', vignette: 0.15 },
  { id: 'mood', name: '저녁 무드', css: 'sepia(0.3) saturate(1.05) contrast(1.02) brightness(0.9)', vignette: 0.4 },
]

export const lookById = (id: string) => LOOKS.find((l) => l.id === id) ?? LOOKS[0]

/** Renders the canvas with the look applied into a PNG data URL. */
export function captureWithLook(source: HTMLCanvasElement, look: Look): string {
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const ctx = out.getContext('2d')!
  ctx.filter = look.css
  ctx.drawImage(source, 0, 0)
  ctx.filter = 'none'
  if (look.vignette > 0) {
    const r = Math.hypot(out.width, out.height) / 2
    const g = ctx.createRadialGradient(out.width / 2, out.height / 2, r * 0.45, out.width / 2, out.height / 2, r)
    g.addColorStop(0, 'rgba(40,25,20,0)')
    g.addColorStop(1, `rgba(40,25,20,${look.vignette})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, out.width, out.height)
  }
  return out.toDataURL('image/png')
}
