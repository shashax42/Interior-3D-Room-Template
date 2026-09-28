/**
 * "Make it a photo": the 3D view decides where everything is; an image model makes it look photographed.
 *
 * Two ways to run it:
 * - Free, by hand: the app prepares the 3D image and a request text; you paste both into the ChatGPT (or Gemini)
 *   app, then load the photo you get back to compare it with the 3D view.
 * - Automatic, with an OpenAI API key (paid per image): the local dev server (server/aiPhoto.ts) calls the API.
 */

export const STYLE_CHIPS = [
  { label: '낮 햇살', text: '늦은 오전의 밝은 햇살이 창으로 들어오는 산뜻한 분위기' },
  { label: '오후 골든아워', text: '늦은 오후의 따뜻한 황금빛 햇살과 길고 부드러운 그림자' },
  { label: '저녁 캔들', text: '저녁, 스탠드와 캔들을 켠 따뜻하고 아늑한 조명, 창밖은 어두움' },
  { label: '필름 감성', text: '살짝 따뜻한 톤에 은은한 필름 그레인이 있는 필름 사진 느낌' },
]

export const DEFAULT_STYLE = "로맨틱한 한국 '프린세스 룸' 감성, 파스텔 핑크·크림·연회색, 프릴과 레이스, 금장 디테일"

export function buildPrompt(style: string, withRoomPhoto: boolean) {
  return [
    '첫 번째 이미지는 방의 3D 모형이에요. 이걸 같은 방을 실제로 찍은 사진으로 바꿔주세요.',
    withRoomPhoto
      ? '두 번째 이미지는 이 방을 같은 자리에서 찍은 실제 빈 방 사진이에요. 벽, 바닥, 창문, 창밖 풍경, 빛은 이 사진 그대로 두고, 첫 번째 이미지의 가구와 소품을 들여놓아 주세요.'
      : '',
    '그대로 유지할 것: 카메라 위치·각도·화각, 방 구조(천장 높이, 몰딩, 창문, 문), 모든 가구와 소품의 위치·크기·모양·색.',
    '실제처럼 보이게 할 것: 천은 자연스러운 주름과 늘어짐, 레이스와 프릴 질감, 나무와 페인트는 실제 재질,',
    '창으로 들어오는 자연광과 벽에 반사되는 은은한 빛, 가구 아래 부드러운 그림자, 생활감 있는 작은 흔적.',
    '한국 아파트에서 휴대폰으로 찍은 사진처럼 보여야 해요. 3D 렌더나 CG 느낌 없이, 글자나 사람은 넣지 마세요.',
    `분위기: ${style}.`,
  ]
    .filter(Boolean)
    .join('\n')
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
  if (r.status === 404) throw new Error('자동 만들기는 내 컴퓨터에서 개발 서버(npm run dev)로 열었을 때만 동작해요.')
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

