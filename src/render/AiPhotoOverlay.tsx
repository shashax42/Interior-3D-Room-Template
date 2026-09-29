import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { DEFAULT_STYLE, MissingKeyError, STYLE_CHIPS, buildPrompt, requestAiPhoto } from './aiPhoto'
import { copyImage, saveImage } from '../ui/SaveSheet'
import { readImage } from '../photo/imageFile'

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; image: string } | { kind: 'error'; message: string } | { kind: 'no-key' }
type Mode = 'free' | 'api'

/** Drag the divider to compare the 3D layout with the photograph. */
export function Compare({ before, after }: { before: string; after: string }) {
  const [x, setX] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const move = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    setX(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }
  return (
    <div
      className="compare"
      ref={box}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX)
      }}
      onPointerMove={(e) => e.buttons && move(e.clientX)}
    >
      <img src={after} alt="사진" draggable={false} />
      <img src={before} alt="3D" draggable={false} className="before" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }} />
      <div className="divider" style={{ left: `${x}%` }}>
        <span>3D ⇆ 사진</span>
      </div>
    </div>
  )
}

export function AiPhotoOverlay({ layout, roomPhoto, width, height, onClose }: {
  /** The 3D view to follow (data URL). */
  layout: string
  /** Real photo of the empty room from the same viewpoint, when the view is a photo's viewpoint. */
  roomPhoto?: string
  width: number
  height: number
  onClose: () => void
}) {
  const name = useStore((s) => s.project.room.name) || 'room'
  const [mode, setMode] = useState<Mode>('free')
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [seconds, setSeconds] = useState(0)
  const [copied, setCopied] = useState(false)
  const [imgCopied, setImgCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)
  const prompt = buildPrompt(style, !!roomPhoto)

  useEffect(() => {
    if (state.kind !== 'loading') return
    setSeconds(0)
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [state.kind])

  const runApi = async () => {
    setState({ kind: 'loading' })
    try {
      keep(await requestAiPhoto({ layout, roomPhoto, prompt, width, height }))
    } catch (e) {
      if (e instanceof MissingKeyError) setState({ kind: 'no-key' })
      else setState({ kind: 'error', message: (e as Error).message })
    }
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the text box below is selectable as a fallback.
      setCopied(false)
    }
  }

  const addToGallery = useStore((s) => s.addToGallery)
  const keep = (image: string) => {
    setState({ kind: 'done', image })
    addToGallery({ photo: image, layout })
  }

  const loadResult = async (file: File) => keep((await readImage(file, 2400)).dataUrl)

  // Pasting the photo copied from ChatGPT works as well as picking a file.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      void loadResult(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  return (
    <div className="ai-overlay" role="dialog" aria-label="사진처럼 만들기">
      <div className="ai-stage">
        {state.kind === 'done' ? (
          <Compare before={layout} after={state.image} />
        ) : (
          <div className="ai-preview">
            <img src={layout} alt="지금 3D 화면" className={state.kind === 'loading' ? 'pulse' : ''} />
            {state.kind === 'loading' && (
              <div className="ai-loading">
                <div className="spinner" />
                <p>AI가 진짜 사진처럼 만드는 중… {seconds}초</p>
                <small>보통 30초~1분 걸려요</small>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ai-panel">
        <div className="seg">
          <button className={mode === 'free' ? 'on' : ''} onClick={() => setMode('free')}>무료 (ChatGPT 앱)</button>
          <button className={mode === 'api' ? 'on' : ''} onClick={() => setMode('api')}>자동 (API 키)</button>
        </div>

        <label className="field">
          <span>원하는 분위기</span>
          <textarea rows={3} value={style} onChange={(e) => setStyle(e.target.value)} />
        </label>
        <div className="chips">
          {STYLE_CHIPS.map((c) => (
            <button key={c.label} className="chip" onClick={() => setStyle((s) => (s.includes(c.text) ? s : `${s}, ${c.text}`))}>
              + {c.label}
            </button>
          ))}
        </div>

        {mode === 'free' ? (
          <ol className="ai-steps">
            <li>
              <a
                className="btn primary big"
                href="https://chatgpt.com/"
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  copyImage(layout)
                    .then(() => setImgCopied('ok'))
                    .catch(() => setImgCopied('fail'))
                }}
              >
                3D 이미지 복사하고 ChatGPT 열기
              </a>
              <span>
                {imgCopied === 'fail'
                  ? '복사가 막혀 있어요. 아래 "이미지 저장"으로 저장한 뒤 ChatGPT에 첨부해주세요.'
                  : '열린 ChatGPT 입력창에 ⌘V(폰은 길게 눌러 붙여넣기)로 이미지를 붙여넣어요.'}
              </span>
              <div className="row wrap">
                <button className="btn" onClick={() => saveImage(layout, `${name}-3d.jpg`)}>이미지 저장</button>
                {roomPhoto && <button className="btn" onClick={() => saveImage(roomPhoto, `${name}-room.jpg`)}>실제 방 사진 저장</button>}
              </div>
            </li>
            <li>
              <button className="btn primary big" onClick={copyPrompt}>{copied ? '복사됨 ✓' : '요청문 복사'}</button>
              <span>ChatGPT에 요청문도 붙여넣고 보내요. 무료 계정은 하루에 만들 수 있는 이미지 수가 정해져 있어요.</span>
            </li>
            <li>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && loadResult(e.target.files[0])} />
              <button className="btn primary big" onClick={() => fileRef.current?.click()}>받은 사진 불러오기</button>
              <span>ChatGPT가 만든 사진을 복사해서 여기서 ⌘V로 붙여넣어도 돼요. 갤러리에 모이고, 3D와 밀어서 비교할 수 있어요.</span>
            </li>
          </ol>
        ) : (
          <>
            {state.kind === 'no-key' && (
              <div className="ai-key">
                <strong>OpenAI API 키가 필요해요</strong>
                <p>API는 ChatGPT 구독과 별개로, 사진 한 장마다 사용료가 나가요.</p>
                <ol>
                  <li>
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a>에서 키를 만들어요.
                  </li>
                  <li>
                    프로젝트 폴더에 <code>.env.local</code> 파일을 만들고 <code>OPENAI_API_KEY=발급받은키</code> 한 줄을 넣어요.
                  </li>
                  <li>저장하고 다시 눌러요. 서버를 다시 켤 필요는 없어요.</li>
                </ol>
              </div>
            )}
            {state.kind === 'error' && <p className="warn">{state.message}</p>}
            <button className="btn primary" disabled={state.kind === 'loading'} onClick={runApi}>
              {state.kind === 'done' ? '다시 만들기' : '📸 자동으로 사진 만들기'}
            </button>
          </>
        )}

        {roomPhoto && <p className="hint">실제 방 사진 시점이라, 그 사진 속 방에 가구를 들인 모습으로 요청해요.</p>}
        <details className="prompt-preview">
          <summary>요청문 보기</summary>
          <pre>{prompt}</pre>
        </details>
        <div className="row">
          <button className="btn" disabled={state.kind !== 'done'} onClick={() => state.kind === 'done' && saveImage(state.image, `${name}-photo.jpg`)}>
            사진 저장
          </button>
          <button className="btn" onClick={onClose}>닫기</button>
        </div>
        <p className="hint">방 구조와 큰 가구 배치는 유지되지만, 작은 소품 모양은 조금 달라질 수 있어요.</p>
      </div>
    </div>
  )
}
