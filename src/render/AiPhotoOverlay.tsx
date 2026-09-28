import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { DEFAULT_STYLE, MissingKeyError, STYLE_CHIPS, buildPrompt, requestAiPhoto } from './aiPhoto'

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; image: string } | { kind: 'error'; message: string } | { kind: 'no-key' }

/** Drag the divider to compare the 3D layout with the AI photograph. */
function Compare({ before, after }: { before: string; after: string }) {
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
      <img src={after} alt="AI 사진" draggable={false} />
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
  const name = useStore((s) => s.project.room.name)
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (state.kind !== 'loading') return
    setSeconds(0)
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [state.kind])

  const run = async () => {
    setState({ kind: 'loading' })
    try {
      const image = await requestAiPhoto({ layout, roomPhoto, prompt: buildPrompt(style, !!roomPhoto), width, height })
      setState({ kind: 'done', image })
    } catch (e) {
      if (e instanceof MissingKeyError) setState({ kind: 'no-key' })
      else setState({ kind: 'error', message: (e as Error).message })
    }
  }

  const download = () => {
    if (state.kind !== 'done') return
    const a = document.createElement('a')
    a.href = state.image
    a.download = `${name || 'room'}-photo.jpg`
    a.click()
  }

  return (
    <div className="ai-overlay" role="dialog" aria-label="AI로 사진처럼">
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
        {state.kind === 'no-key' && (
          <div className="ai-key">
            <strong>OpenAI API 키가 필요해요</strong>
            <ol>
              <li>
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a>에서 키를 만들어요.
              </li>
              <li>
                프로젝트 폴더에 <code>.env.local</code> 파일을 만들고 <code>OPENAI_API_KEY=발급받은키</code> 한 줄을 넣어요.
              </li>
              <li>저장하고 아래 "사진 만들기"를 다시 눌러요. 서버를 다시 켤 필요는 없어요.</li>
            </ol>
          </div>
        )}
        {state.kind === 'error' && <p className="warn">{state.message}</p>}
        {roomPhoto && <p className="hint">실제 방 사진 시점이라, 그 사진 속 방에 가구를 들인 모습으로 만들어요.</p>}

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
        <div className="row">
          <button className="btn primary" disabled={state.kind === 'loading'} onClick={run}>
            {state.kind === 'done' ? '다시 만들기' : '📸 사진 만들기'}
          </button>
          <button className="btn" disabled={state.kind !== 'done'} onClick={download}>이미지 저장</button>
          <button className="btn" onClick={onClose}>닫기</button>
        </div>
        <p className="hint">한 장 만들 때마다 OpenAI 사용료가 나가요. 배치와 구도는 유지하지만 작은 소품은 조금 달라질 수 있어요.</p>
      </div>
    </div>
  )
}
