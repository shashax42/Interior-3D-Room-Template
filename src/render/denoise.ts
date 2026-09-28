import { initUNetFromURL, type UNet } from 'oidn-web'

/**
 * AI denoising (Intel Open Image Denoise, run on the GPU through WebGPU). A path-traced image is grainy until
 * hundreds of light samples have been averaged; the denoiser cleans up an image with a few dozen samples, which
 * turns a many-minute render into a short one.
 */

let unet: Promise<UNet> | null = null

export const denoiserAvailable = () => typeof navigator !== 'undefined' && 'gpu' in navigator

function loadUNet() {
  unet ??= initUNetFromURL(`${import.meta.env.BASE_URL}weights/rt_ldr.tza`)
  return unet
}

/** Starts downloading the model early so the denoise step doesn't wait for it. */
export function warmUpDenoiser() {
  if (denoiserAvailable()) loadUNet().catch(() => {})
}

/** Returns a denoised copy of a (tone-mapped) canvas. Rejects if WebGPU or the model is unavailable. */
export async function denoiseCanvas(source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const net = await loadUNet()
  const { width, height } = source
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')!
  ctx.drawImage(source, 0, 0)
  const noisy = ctx.getImageData(0, 0, width, height)
  return new Promise((resolve) => {
    net.tileExecute({
      color: noisy,
      progress: (_all, tile, t) => {
        if (tile) ctx.putImageData(tile as ImageData, t.x, t.y)
      },
      done: (denoised) => {
        ctx.putImageData(denoised as ImageData, 0, 0)
        resolve(out)
      },
    })
  })
}
