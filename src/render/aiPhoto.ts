/**
 * "Make it a photo": the 3D view decides where everything is; an image model makes it look photographed.
 * The request goes to the local dev server (server/aiPhoto.ts), which holds the OpenAI key.
 */

export const STYLE_CHIPS = [
  { label: '낮 햇살', text: 'bright late-morning daylight pouring in through the window, airy and fresh' },
  { label: '오후 골든아워', text: 'warm late-afternoon golden-hour sunlight with long soft shadows' },
  { label: '저녁 캔들', text: 'evening, lamps and candles lit, warm cozy glow, dark window' },
  { label: '필름 감성', text: 'soft film photograph look, slightly warm tones, gentle grain' },
]

export const DEFAULT_STYLE = 'romantic Korean "princess room" interior, pastel pink, cream and soft gray, ruffles and lace, gilded details'

export function buildPrompt(style: string, withRoomPhoto: boolean) {
  return [
    'Image 1 is a 3D mockup of a room. Turn it into a real photograph of the same room.',
    withRoomPhoto
      ? 'Image 2 is a real photo of this room, empty, from the same viewpoint. Keep its walls, floor, windows, the view outside and its lighting exactly, and furnish it with the furniture and decor from image 1.'
      : '',
    'Keep exactly: the camera position, angle and lens; the shape of the room, its ceiling height, moldings, windows and doors;',
    'every piece of furniture and decor in the same place, with the same size, shape and colors.',
    'Make everything look real: real fabrics with natural wrinkles, folds and drape, lace and ruffles, real wood grain and paint,',
    'natural light with soft bounce light and soft contact shadows, subtle everyday imperfections.',
    'It should look like a photo taken with a phone camera inside a real Korean apartment. No CGI or 3D-render look, no text, no people.',
    `Style and mood: ${style}.`,
  ]
    .filter(Boolean)
    .join(' ')
}

export class MissingKeyError extends Error {}

export async function requestAiPhoto(input: { layout: string; roomPhoto?: string; prompt: string; width: number; height: number }) {
  let r: Response
  try {
    r = await fetch('/api/ai-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('개발 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해주세요.')
  }
  if (r.status === 404) throw new Error('AI 사진 기능은 개발 서버(npm run dev)에서만 동작해요.')
  const json = (await r.json().catch(() => ({}))) as { image?: string; error?: string }
  if (json.error === 'missing-key') throw new MissingKeyError()
  if (!r.ok || !json.image) throw new Error(json.error ?? `오류 (${r.status})`)
  return json.image
}

/** JPEG data URL of a canvas, downscaled so the upload stays small. */
export function canvasToJpeg(canvas: HTMLCanvasElement, maxSide = 1600) {
  const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height))
  const out = document.createElement('canvas')
  out.width = Math.round(canvas.width * k)
  out.height = Math.round(canvas.height * k)
  out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height)
  return out.toDataURL('image/jpeg', 0.92)
}

/** Snapshot of a live view for the AI, taken with nothing selected so no selection box shows up in the photo. */
export async function snapshotForAi(snapshot: () => HTMLCanvasElement, clearSelection: () => void) {
  clearSelection()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const c = snapshot()
  return { layout: canvasToJpeg(c), width: c.width, height: c.height }
}
