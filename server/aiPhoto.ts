import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin } from 'vite'

/**
 * POST /api/ai-photo — turns a 3D view of the room into a photograph with OpenAI's image editing model.
 *
 * Runs inside the local dev server so the API key (OPENAI_API_KEY in .env.local) never reaches the browser.
 * The env file is re-read on every request, so adding the key does not need a server restart.
 */

type Body = {
  /** The 3D view (JPEG/PNG data URL): the layout the photo must follow. */
  layout: string
  /** Optional real photo of the empty room from the same viewpoint (data URL). */
  roomPhoto?: string
  prompt: string
  width: number
  height: number
}

const DEFAULT_MODEL = 'gpt-image-2.5-sunburst'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function dataUrlToBlob(dataUrl: string) {
  const [head, b64] = dataUrl.split(',', 2)
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png'
  return new Blob([Buffer.from(b64, 'base64')], { type })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** The API accepts custom sizes in multiples of 16 between ~0.65 and ~8.3 megapixels, up to 3840 px per edge. */
export function apiSize(width: number, height: number) {
  const aspect = Math.min(3, Math.max(1 / 3, width / height))
  const pixels = 1_600_000
  let w = Math.sqrt(pixels * aspect)
  let h = w / aspect
  const k = Math.min(1, 3840 / Math.max(w, h))
  w = Math.round((w * k) / 16) * 16
  h = Math.round((h * k) / 16) * 16
  return `${w}x${h}`
}

export function aiPhotoPlugin(): Plugin {
  let root = process.cwd()
  let mode = 'development'
  return {
    name: 'ai-photo',
    configResolved(config) {
      root = config.root
      mode = config.mode
    },
    configureServer(server) {
      server.middlewares.use('/api/ai-photo', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        const env = loadEnv(mode, root, '')
        const key = env.OPENAI_API_KEY
        if (!key) return send(res, 400, { error: 'missing-key' })
        let body: Body
        try {
          body = JSON.parse(await readBody(req))
        } catch {
          return send(res, 400, { error: '요청을 읽지 못했어요.' })
        }

        const form = new FormData()
        form.append('model', env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL)
        form.append('image[]', dataUrlToBlob(body.layout), 'layout.jpg')
        if (body.roomPhoto) form.append('image[]', dataUrlToBlob(body.roomPhoto), 'room.jpg')
        form.append('prompt', body.prompt)
        form.append('size', apiSize(body.width, body.height))
        form.append('quality', 'high')
        form.append('output_format', 'jpeg')
        form.append('output_compression', '92')

        try {
          const r = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: form,
          })
          const json = (await r.json()) as { data?: { b64_json?: string }[]; error?: { message?: string } }
          if (!r.ok || !json.data?.[0]?.b64_json) {
            return send(res, r.status || 500, { error: json.error?.message ?? `OpenAI 응답 오류 (${r.status})` })
          }
          send(res, 200, { image: `data:image/jpeg;base64,${json.data[0].b64_json}` })
        } catch (e) {
          send(res, 502, { error: `OpenAI에 연결하지 못했어요: ${(e as Error).message}` })
        }
      })
    },
  }
}
